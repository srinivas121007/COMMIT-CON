"""
Unit tests for LocalJsonStore and JSON-safe conversion utility.
"""

import math
import numpy as np
import pandas as pd
import pytest

from backend.storage.base import to_json_safe
from backend.storage.local_store import LocalJsonStore


def test_to_json_safe_converts_nan_and_numpy():
    data = {
        "nan_val": float("nan"),
        "inf_val": float("inf"),
        "numpy_int": np.int64(42),
        "numpy_float": np.float64(3.14),
        "none_val": None,
        "nested": {"nested_nan": np.nan, "list": [1, np.nan, np.int32(10)]},
    }
    safe = to_json_safe(data)
    assert safe["nan_val"] is None
    assert safe["inf_val"] is None
    assert safe["numpy_int"] == 42
    assert isinstance(safe["numpy_int"], int)
    assert safe["nested"]["nested_nan"] is None
    assert safe["nested"]["list"][1] is None


def test_local_json_store_crud(tmp_path):
    store = LocalJsonStore(base_dir=str(tmp_path))

    run_data = {
        "run_id": "test_run_123",
        "created_at": "2024-01-01T00:00:00Z",
        "quality_before": {"overall_quality": 80.0},
        "quality_after": {"overall_quality": 95.0},
        "issues": [
            {"issue_id": "ISS_001", "type": "TYPO", "status": "pending_review"}
        ],
        "audit_log": [
            {"action_id": "ACT_001", "action_type": "FIX_TYPO", "status": "applied"}
        ],
        "repaired_people": pd.DataFrame([{"person_id": "P1", "full_name": "Test Person"}]),
        "repaired_places": pd.DataFrame(),
        "repaired_events": pd.DataFrame(),
        "repaired_relationships": pd.DataFrame(),
        "original_people": pd.DataFrame([{"person_id": "P1", "full_name": "Test Persn"}]),
        "original_places": pd.DataFrame(),
        "original_events": pd.DataFrame(),
        "original_relationships": pd.DataFrame(),
    }

    run_id = store.save_run(run_data)
    assert run_id == "test_run_123"

    run = store.get_run("test_run_123")
    assert run is not None
    assert run["run_id"] == "test_run_123"

    runs = store.list_runs()
    assert len(runs) == 1

    issues = store.get_issues("test_run_123")
    assert len(issues) == 1

    audit = store.get_audit("test_run_123")
    assert len(audit) == 1

    repaired = store.get_repaired("test_run_123", "people")
    assert "people" in repaired
    assert len(repaired["people"]) == 1

    # Update issue
    success = store.update_issue("test_run_123", "ISS_001", {"status": "applied"})
    assert success is True
    updated_issues = store.get_issues("test_run_123", status="applied")
    assert len(updated_issues) == 1
