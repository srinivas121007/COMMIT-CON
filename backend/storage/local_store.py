"""
Local JSON-based Store implementation.
Default storage backend requiring zero external setup.
"""

import json
import os
from pathlib import Path
from typing import Dict, List, Any, Optional
import pandas as pd

from backend.storage.base import Store, to_json_safe


class LocalJsonStore(Store):
    """
    Persists runs, datasets, audit logs, and issues to local JSON files.
    """

    def __init__(self, base_dir: str = "backend/data_store"):
        self.base_dir = Path(base_dir)
        self.runs_dir = self.base_dir / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def _get_run_folder(self, run_id: str) -> Path:
        folder = self.runs_dir / run_id
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def save_run(self, run_data: Dict[str, Any]) -> str:
        run_id = run_data["run_id"]
        run_folder = self._get_run_folder(run_id)

        # 1. Summary metadata
        summary = {
            "run_id": run_id,
            "created_at": run_data.get("created_at"),
            "quality_before": to_json_safe(run_data.get("quality_before")),
            "quality_after": to_json_safe(run_data.get("quality_after")),
            "quality_clean": to_json_safe(run_data.get("quality_clean")),
            "evaluation": to_json_safe(run_data.get("evaluation")),
            "id_mapping": to_json_safe(run_data.get("id_mapping", {})),
            "counts": {
                "issues": len(run_data.get("issues", [])),
                "audit_actions": len(run_data.get("audit_log", [])),
                "repaired_people": len(run_data.get("repaired_people", [])),
                "repaired_places": len(run_data.get("repaired_places", [])),
                "repaired_events": len(run_data.get("repaired_events", [])),
                "repaired_relationships": len(run_data.get("repaired_relationships", [])),
            },
        }
        with open(run_folder / "summary.json", "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)

        # 2. Issues
        issues = to_json_safe(run_data.get("issues", []))
        with open(run_folder / "issues.json", "w", encoding="utf-8") as f:
            json.dump(issues, f, indent=2)

        # 3. Audit log
        audit = to_json_safe(run_data.get("audit_log", []))
        with open(run_folder / "audit_log.json", "w", encoding="utf-8") as f:
            json.dump(audit, f, indent=2)

        # 4. Repaired tables
        repaired_dir = run_folder / "repaired"
        repaired_dir.mkdir(exist_ok=True)
        for tbl in ["people", "places", "events", "relationships"]:
            df = run_data.get(f"repaired_{tbl}")
            recs = to_json_safe(df)
            with open(repaired_dir / f"{tbl}.json", "w", encoding="utf-8") as f:
                json.dump(recs, f, indent=2)

        # 5. Original tables
        original_dir = run_folder / "original"
        original_dir.mkdir(exist_ok=True)
        for tbl in ["people", "places", "events", "relationships"]:
            df = run_data.get(f"original_{tbl}")
            recs = to_json_safe(df)
            with open(original_dir / f"{tbl}.json", "w", encoding="utf-8") as f:
                json.dump(recs, f, indent=2)

        return run_id

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        run_folder = self.runs_dir / run_id
        sum_path = run_folder / "summary.json"
        if not sum_path.exists():
            return None
        with open(sum_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def list_runs(self) -> List[Dict[str, Any]]:
        runs = []
        for d in self.runs_dir.iterdir():
            if d.is_dir() and (d / "summary.json").exists():
                try:
                    with open(d / "summary.json", "r", encoding="utf-8") as f:
                        runs.append(json.load(f))
                except Exception:
                    pass
        # Sort descending by created_at
        runs.sort(key=lambda r: r.get("created_at") or "", reverse=True)
        return runs

    def get_issues(self, run_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        run_folder = self.runs_dir / run_id
        issues_path = run_folder / "issues.json"
        if not issues_path.exists():
            return []
        with open(issues_path, "r", encoding="utf-8") as f:
            issues = json.load(f)
        if status:
            issues = [i for i in issues if str(i.get("status", "")).lower() == status.lower()]
        return issues

    def get_audit(
        self,
        run_id: str,
        action_type: Optional[str] = None,
        record_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        run_folder = self.runs_dir / run_id
        audit_path = run_folder / "audit_log.json"
        if not audit_path.exists():
            return []
        with open(audit_path, "r", encoding="utf-8") as f:
            audit = json.load(f)
        if action_type:
            audit = [a for a in audit if str(a.get("action_type", "")).lower() == action_type.lower()]
        if record_id:
            audit = [a for a in audit if record_id in a.get("record_ids", []) or a.get("record_ids") == [record_id]]
        return audit

    def get_repaired(self, run_id: str, table_name: Optional[str] = None) -> Dict[str, Any]:
        run_folder = self.runs_dir / run_id / "repaired"
        if not run_folder.exists():
            return {}
        if table_name:
            t_path = run_folder / f"{table_name}.json"
            if t_path.exists():
                with open(t_path, "r", encoding="utf-8") as f:
                    return {table_name: json.load(f)}
            return {}
        res = {}
        for tbl in ["people", "places", "events", "relationships"]:
            t_path = run_folder / f"{tbl}.json"
            if t_path.exists():
                with open(t_path, "r", encoding="utf-8") as f:
                    res[tbl] = json.load(f)
        return res

    def get_original(self, run_id: str, table_name: Optional[str] = None) -> Dict[str, Any]:
        run_folder = self.runs_dir / run_id / "original"
        if not run_folder.exists():
            return {}
        if table_name:
            t_path = run_folder / f"{table_name}.json"
            if t_path.exists():
                with open(t_path, "r", encoding="utf-8") as f:
                    return {table_name: json.load(f)}
            return {}
        res = {}
        for tbl in ["people", "places", "events", "relationships"]:
            t_path = run_folder / f"{tbl}.json"
            if t_path.exists():
                with open(t_path, "r", encoding="utf-8") as f:
                    res[tbl] = json.load(f)
        return res

    def update_issue(self, run_id: str, issue_id: str, update_data: Dict[str, Any]) -> bool:
        run_folder = self.runs_dir / run_id
        # Update in issues.json if present
        updated = False
        issues_path = run_folder / "issues.json"
        if issues_path.exists():
            with open(issues_path, "r", encoding="utf-8") as f:
                issues = json.load(f)
            for iss in issues:
                if iss.get("issue_id") == issue_id:
                    iss.update(update_data)
                    updated = True
            if updated:
                with open(issues_path, "w", encoding="utf-8") as f:
                    json.dump(issues, f, indent=2)

        # Update in audit_log.json if present
        audit_path = run_folder / "audit_log.json"
        if audit_path.exists():
            with open(audit_path, "r", encoding="utf-8") as f:
                audit = json.load(f)
            for act in audit:
                if act.get("action_id") == issue_id or act.get("issue_id") == issue_id:
                    act.update(update_data)
                    updated = True
            if updated:
                with open(audit_path, "w", encoding="utf-8") as f:
                    json.dump(audit, f, indent=2)

        return updated
