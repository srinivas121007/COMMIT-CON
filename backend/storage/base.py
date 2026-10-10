"""
Base Store interface and JSON serialization utilities.
No dependencies on FastAPI.
"""

from abc import ABC, abstractmethod
import math
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional


def to_json_safe(obj: Any) -> Any:
    """Recursively converts NaN, NaT, numpy primitives and DataFrames to JSON-safe primitives."""
    if obj is None:
        return None
    if isinstance(obj, (float, np.floating)):
        if math.isnan(obj) or math.isinf(obj) or pd.isna(obj):
            return None
        return float(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (pd.Timestamp, np.datetime64)):
        return obj.isoformat() if hasattr(obj, "isoformat") else str(obj)
    if isinstance(obj, dict):
        return {str(k): to_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [to_json_safe(x) for x in obj]
    if isinstance(obj, pd.DataFrame):
        return [to_json_safe(row) for row in obj.to_dict(orient="records")]
    if pd.isna(obj):
        return None
    return obj


class Store(ABC):
    """Abstract interface for run, issue, audit, and dataset persistence."""

    @abstractmethod
    def save_run(self, run_data: Dict[str, Any]) -> str:
        """Persists run data and returns run_id."""
        pass

    @abstractmethod
    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves summary and metadata for a run."""
        pass

    @abstractmethod
    def list_runs(self) -> List[Dict[str, Any]]:
        """Lists all recorded runs sorted by creation date descending."""
        pass

    @abstractmethod
    def get_issues(self, run_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns detected issues for a run, optionally filtered by status."""
        pass

    @abstractmethod
    def get_audit(
        self,
        run_id: str,
        action_type: Optional[str] = None,
        record_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Returns audit log actions for a run with optional filters."""
        pass

    @abstractmethod
    def get_repaired(self, run_id: str, table_name: Optional[str] = None) -> Dict[str, Any]:
        """Returns repaired records for one or all tables."""
        pass

    @abstractmethod
    def get_original(self, run_id: str, table_name: Optional[str] = None) -> Dict[str, Any]:
        """Returns original records for one or all tables."""
        pass

    @abstractmethod
    def update_issue(self, run_id: str, issue_id: str, update_data: Dict[str, Any]) -> bool:
        """Updates status or decisions on an issue or audit action."""
        pass
