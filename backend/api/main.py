"""
FastAPI application for the Knowledge Repair Tool.
CORS enabled for http://localhost:3000.
Endpoints for sample generation, repair execution, run summaries,
issues, audit log, lineage tracing, review decisions, and export.
"""

import io
import json
import os
import zipfile
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from backend.pipeline.generator import generate_clean_dataset
from backend.pipeline.corruptor import inject_corruption
from backend.pipeline.run import execute_pipeline
from backend.pipeline.repair import apply_review_decision, get_lineage
from backend.storage import get_store
from backend.storage.base import to_json_safe

app = FastAPI(
    title="Knowledge Repair Tool API",
    description="Detect and repair inconsistencies, duplicates, and contradictions in relational knowledge datasets.",
    version="1.0.0",
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = get_store()


class ReviewRequest(BaseModel):
    issue_id: str
    approve: bool


class RepairRequest(BaseModel):
    use_sample: bool = True
    seed: int = 42


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    backend = os.getenv("STORAGE_BACKEND", "local")
    return to_json_safe({
        "status": "healthy",
        "service": "knowledge-repair-backend",
        "storage_backend": backend,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.post("/api/sample/generate")
def generate_sample(seed: int = 42):
    """Generates synthetic clean and corrupted dataset and returns metadata."""
    try:
        clean_p, clean_pl, clean_e, clean_r = generate_clean_dataset(seed=seed)
        c_p, c_pl, c_e, c_r, gt = inject_corruption(clean_p, clean_pl, clean_e, clean_r, seed=seed)

        return to_json_safe({
            "status": "success",
            "seed": seed,
            "counts": {
                "clean_people": len(clean_p),
                "clean_places": len(clean_pl),
                "clean_events": len(clean_e),
                "clean_relationships": len(clean_r),
                "corrupted_people": len(c_p),
                "corrupted_places": len(c_pl),
                "corrupted_events": len(c_e),
                "corrupted_relationships": len(c_r),
                "injected_issues": len(gt["injected_issues"]),
            },
            "sample_records": {
                "people": c_p.head(5).to_dict(orient="records"),
                "places": c_pl.head(5).to_dict(orient="records"),
                "events": c_e.head(5).to_dict(orient="records"),
                "relationships": c_r.head(5).to_dict(orient="records"),
            },
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate sample: {str(e)}")


@app.post("/api/repair")
async def run_repair(
    use_sample: Optional[bool] = Form(None),
    seed: Optional[int] = Form(42),
    people_file: Optional[UploadFile] = File(None),
    places_file: Optional[UploadFile] = File(None),
    events_file: Optional[UploadFile] = File(None),
    relationships_file: Optional[UploadFile] = File(None),
):
    """
    Executes the repair pipeline.
    Accepts either use_sample=true or 4 uploaded CSV files.
    """
    try:
        clean_data = None
        ground_truth = None

        if people_file and places_file and events_file and relationships_file:
            # Uploaded CSVs
            p_content = await people_file.read()
            pl_content = await places_file.read()
            e_content = await events_file.read()
            r_content = await relationships_file.read()

            people_df = pd.read_csv(io.BytesIO(p_content))
            places_df = pd.read_csv(io.BytesIO(pl_content))
            events_df = pd.read_csv(io.BytesIO(e_content))
            relationships_df = pd.read_csv(io.BytesIO(r_content))
        else:
            # Use sample dataset
            effective_seed = seed if seed is not None else 42
            clean_p, clean_pl, clean_e, clean_r = generate_clean_dataset(seed=effective_seed)
            people_df, places_df, events_df, relationships_df, ground_truth = inject_corruption(
                clean_p, clean_pl, clean_e, clean_r, seed=effective_seed
            )
            clean_data = (clean_p, clean_pl, clean_e, clean_r)

        # Run pipeline
        run_res = execute_pipeline(
            people_df, places_df, events_df, relationships_df,
            clean_data=clean_data,
            ground_truth=ground_truth,
        )

        # Save to store
        run_id = store.save_run(run_res)

        # Return summary
        summary = store.get_run(run_id)
        return JSONResponse(content=to_json_safe(summary))

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Repair pipeline failed: {str(e)}")


@app.get("/api/runs")
def list_runs():
    """Lists all stored repair runs."""
    try:
        runs = store.list_runs()
        return JSONResponse(content=to_json_safe(runs))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/runs/{run_id}/summary")
def get_run_summary(run_id: str):
    """Retrieves full summary, component quality metrics, and issue breakdown for a run."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    issues = store.get_issues(run_id)
    audit = store.get_audit(run_id)

    # Group issues by type
    issues_by_type: Dict[str, int] = {}
    for iss in issues:
        t = iss.get("type", "UNKNOWN")
        issues_by_type[t] = issues_by_type.get(t, 0) + 1

    # Group actions by type
    actions_by_type: Dict[str, int] = {}
    for act in audit:
        t = act.get("action_type", "UNKNOWN")
        actions_by_type[t] = actions_by_type.get(t, 0) + 1

    res = {
        **run,
        "issues_by_type": issues_by_type,
        "actions_by_type": actions_by_type,
    }
    return JSONResponse(content=to_json_safe(res))


@app.get("/api/runs/{run_id}/issues")
def get_run_issues(run_id: str, status: Optional[str] = Query(None)):
    """Retrieves detected issues, optionally filtered by status (pending_review, applied, rejected)."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    issues = store.get_issues(run_id, status=status)
    return JSONResponse(content=to_json_safe(issues))


@app.get("/api/runs/{run_id}/audit")
def get_run_audit(
    run_id: str,
    action_type: Optional[str] = Query(None),
    record_id: Optional[str] = Query(None),
):
    """Retrieves audit log entries, optionally filtered by action_type or record_id."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    audit = store.get_audit(run_id, action_type=action_type, record_id=record_id)
    return JSONResponse(content=to_json_safe(audit))


@app.get("/api/runs/{run_id}/lineage/{repaired_id}")
def get_record_lineage(run_id: str, repaired_id: str):
    """Retrieves lineage, source records, and provenance for a repaired record."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    # Reconstitute run_data for lineage calculation
    repaired_tables = store.get_repaired(run_id)
    original_tables = store.get_original(run_id)
    audit = store.get_audit(run_id)

    run_data = {
        "audit_log": audit,
        "repaired_people": pd.DataFrame(repaired_tables.get("people", [])),
        "repaired_places": pd.DataFrame(repaired_tables.get("places", [])),
        "repaired_events": pd.DataFrame(repaired_tables.get("events", [])),
        "repaired_relationships": pd.DataFrame(repaired_tables.get("relationships", [])),
        "original_people": pd.DataFrame(original_tables.get("people", [])),
        "original_places": pd.DataFrame(original_tables.get("places", [])),
        "original_events": pd.DataFrame(original_tables.get("events", [])),
        "original_relationships": pd.DataFrame(original_tables.get("relationships", [])),
    }

    lineage = get_lineage(repaired_id, run_data)
    if "error" in lineage:
        raise HTTPException(status_code=404, detail=lineage["error"])

    return JSONResponse(content=to_json_safe(lineage))


@app.post("/api/runs/{run_id}/review")
def review_decision(run_id: str, req: ReviewRequest):
    """Applies human review decision (approve or reject) to an issue or audit action."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    new_status = "applied" if req.approve else "rejected"
    success = store.update_issue(run_id, req.issue_id, {"status": new_status})

    if not success:
        raise HTTPException(status_code=404, detail=f"Issue or action {req.issue_id} not found")

    return JSONResponse(content=to_json_safe({
        "status": "success",
        "run_id": run_id,
        "issue_id": req.issue_id,
        "decision": new_status,
    }))


@app.get("/api/runs/{run_id}/export")
def export_repaired_data(run_id: str):
    """Exports repaired CSVs and audit_log.csv packed into a zip archive."""
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    repaired = store.get_repaired(run_id)
    audit = store.get_audit(run_id)

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for tbl in ["people", "places", "events", "relationships"]:
            recs = repaired.get(tbl, [])
            df = pd.DataFrame(recs)
            csv_buf = io.StringIO()
            df.to_csv(csv_buf, index=False)
            zf.writestr(f"repaired_{tbl}.csv", csv_buf.getvalue())

        # Audit log CSV
        audit_df = pd.DataFrame(audit)
        audit_buf = io.StringIO()
        audit_df.to_csv(audit_buf, index=False)
        zf.writestr("audit_log.csv", audit_buf.getvalue())

    zip_buffer.seek(0)
    filename = f"knowledge_repair_run_{run_id}.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
