"""
Unit tests for FastAPI endpoints using TestClient.
Tests all required endpoints:
- GET /api/health
- POST /api/sample/generate
- POST /api/repair
- GET /api/runs
- GET /api/runs/{id}/summary
- GET /api/runs/{id}/issues
- GET /api/runs/{id}/audit
- GET /api/runs/{id}/lineage/{repaired_id}
- POST /api/runs/{id}/review
- GET /api/runs/{id}/export
"""

import zipfile
import io
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app

client = TestClient(app)


def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "storage_backend" in data


def test_api_sample_generate():
    res = client.post("/api/sample/generate?seed=42")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "counts" in data
    assert data["counts"]["clean_people"] >= 380


def test_api_full_repair_flow():
    # 1. Run repair using sample data
    repair_res = client.post("/api/repair", data={"use_sample": "true", "seed": "42"})
    assert repair_res.status_code == 200
    run_summary = repair_res.json()
    assert "run_id" in run_summary
    run_id = run_summary["run_id"]

    # 2. List runs
    runs_res = client.get("/api/runs")
    assert runs_res.status_code == 200
    runs = runs_res.json()
    assert any(r["run_id"] == run_id for r in runs)

    # 3. Get run summary
    sum_res = client.get(f"/api/runs/{run_id}/summary")
    assert sum_res.status_code == 200
    summary_data = sum_res.json()
    assert "quality_before" in summary_data
    assert "quality_after" in summary_data
    assert "issues_by_type" in summary_data
    assert "actions_by_type" in summary_data

    # 4. Get issues
    issues_res = client.get(f"/api/runs/{run_id}/issues")
    assert issues_res.status_code == 200
    issues = issues_res.json()
    assert len(issues) > 0

    # 5. Get audit
    audit_res = client.get(f"/api/runs/{run_id}/audit")
    assert audit_res.status_code == 200
    audit = audit_res.json()
    assert len(audit) > 0

    # 6. Get lineage for first repaired person
    first_person_id = summary_data["id_mapping"].get(list(summary_data["id_mapping"].keys())[0])
    lineage_res = client.get(f"/api/runs/{run_id}/lineage/{first_person_id}")
    assert lineage_res.status_code == 200
    lineage = lineage_res.json()
    assert lineage["repaired_id"] == first_person_id
    assert "source_ids" in lineage

    # 7. Post review decision
    first_issue = issues[0]
    iss_id = first_issue["issue_id"]
    rev_res = client.post(
        f"/api/runs/{run_id}/review",
        json={"issue_id": iss_id, "approve": True},
    )
    assert rev_res.status_code == 200
    assert rev_res.json()["decision"] == "applied"

    # 8. Export ZIP
    export_res = client.get(f"/api/runs/{run_id}/export")
    assert export_res.status_code == 200
    assert export_res.headers["content-type"] == "application/zip"

    # Check zip contents
    with zipfile.ZipFile(io.BytesIO(export_res.content)) as zf:
        namelist = zf.namelist()
        assert "repaired_people.csv" in namelist
        assert "repaired_places.csv" in namelist
        assert "repaired_events.csv" in namelist
        assert "repaired_relationships.csv" in namelist
        assert "audit_log.csv" in namelist
