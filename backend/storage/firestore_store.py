"""
Firestore-based Store implementation.
Uses collections: runs, original_records, repaired_records, audit_log, issues.
Each doc has run_id.
Performs batched writes of max 400 items.
Converts NaN/NaT/numpy to JSON-safe types.
"""

import os
from typing import Dict, List, Any, Optional
import firebase_admin
from firebase_admin import credentials, firestore

from backend.storage.base import Store, to_json_safe


class FirestoreStore(Store):
    """
    Firestore storage implementation using collections:
    runs, original_records, repaired_records, audit_log, issues.
    """

    def __init__(self, project_id: Optional[str] = None):
        self.db = None
        self._init_firestore(project_id)

    def _init_firestore(self, project_id: Optional[str]):
        try:
            if not firebase_admin._apps:
                cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
                if cred_path and os.path.exists(cred_path):
                    cred = credentials.Certificate(cred_path)
                    firebase_admin.initialize_app(cred, {"projectId": project_id})
                else:
                    firebase_admin.initialize_app(options={"projectId": project_id})
            self.db = firestore.client()
        except Exception as e:
            # Stored gracefully; will raise on use if not configured
            self.init_error = str(e)

    def _check_client(self):
        if not self.db:
            raise RuntimeError(
                "Firestore is not configured. Set STORAGE_BACKEND=local in .env or provide valid credentials."
            )

    def _batch_write(self, collection_name: str, documents: List[Dict[str, Any]]):
        """Batched writes with chunks of at most 400 documents."""
        self._check_client()
        chunk_size = 400
        for i in range(0, len(documents), chunk_size):
            chunk = documents[i : i + chunk_size]
            batch = self.db.batch()
            for doc in chunk:
                doc_ref = self.db.collection(collection_name).document()
                batch.set(doc_ref, doc)
            batch.commit()

    def save_run(self, run_data: Dict[str, Any]) -> str:
        self._check_client()
        run_id = run_data["run_id"]

        # 1. runs collection
        run_summary = {
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
            },
        }
        self.db.collection("runs").document(run_id).set(to_json_safe(run_summary))

        # 2. issues collection
        issues_docs = []
        for iss in run_data.get("issues", []):
            d = to_json_safe(iss)
            d["run_id"] = run_id
            issues_docs.append(d)
        if issues_docs:
            self._batch_write("issues", issues_docs)

        # 3. audit_log collection
        audit_docs = []
        for act in run_data.get("audit_log", []):
            d = to_json_safe(act)
            d["run_id"] = run_id
            audit_docs.append(d)
        if audit_docs:
            self._batch_write("audit_log", audit_docs)

        # 4. repaired_records collection
        repaired_docs = []
        for tbl in ["people", "places", "events", "relationships"]:
            df = run_data.get(f"repaired_{tbl}")
            recs = to_json_safe(df)
            if recs:
                for r in recs:
                    r["run_id"] = run_id
                    r["table"] = tbl
                    repaired_docs.append(r)
        if repaired_docs:
            self._batch_write("repaired_records", repaired_docs)

        # 5. original_records collection
        original_docs = []
        for tbl in ["people", "places", "events", "relationships"]:
            df = run_data.get(f"original_{tbl}")
            recs = to_json_safe(df)
            if recs:
                for r in recs:
                    r["run_id"] = run_id
                    r["table"] = tbl
                    original_docs.append(r)
        if original_docs:
            self._batch_write("original_records", original_docs)

        return run_id

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        self._check_client()
        doc = self.db.collection("runs").document(run_id).get()
        return doc.to_dict() if doc.exists else None

    def list_runs(self) -> List[Dict[str, Any]]:
        self._check_client()
        docs = self.db.collection("runs").order_by("created_at", direction=firestore.Query.DESCENDING).stream()
        return [d.to_dict() for d in docs]

    def get_issues(self, run_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        self._check_client()
        q = self.db.collection("issues").where("run_id", "==", run_id)
        if status:
            q = q.where("status", "==", status)
        return [d.to_dict() for d in q.stream()]

    def get_audit(
        self,
        run_id: str,
        action_type: Optional[str] = None,
        record_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        self._check_client()
        q = self.db.collection("audit_log").where("run_id", "==", run_id)
        if action_type:
            q = q.where("action_type", "==", action_type)
        actions = [d.to_dict() for d in q.stream()]
        if record_id:
            actions = [a for a in actions if record_id in a.get("record_ids", []) or a.get("record_ids") == [record_id]]
        return actions

    def get_repaired(self, run_id: str, table_name: Optional[str] = None) -> Dict[str, Any]:
        self._check_client()
        q = self.db.collection("repaired_records").where("run_id", "==", run_id)
        if table_name:
            q = q.where("table", "==", table_name)
        docs = [d.to_dict() for d in q.stream()]
        res: Dict[str, List[Any]] = {}
        for d in docs:
            t = d.pop("table", "unknown")
            res.setdefault(t, []).append(d)
        return res

    def get_original(self, run_id: str, table_name: Optional[str] = None) -> Dict[str, Any]:
        self._check_client()
        q = self.db.collection("original_records").where("run_id", "==", run_id)
        if table_name:
            q = q.where("table", "==", table_name)
        docs = [d.to_dict() for d in q.stream()]
        res: Dict[str, List[Any]] = {}
        for d in docs:
            t = d.pop("table", "unknown")
            res.setdefault(t, []).append(d)
        return res

    def update_issue(self, run_id: str, issue_id: str, update_data: Dict[str, Any]) -> bool:
        self._check_client()
        q = self.db.collection("issues").where("run_id", "==", run_id).where("issue_id", "==", issue_id)
        docs = list(q.stream())
        if docs:
            for d in docs:
                d.reference.update(to_json_safe(update_data))
            return True
        return False
