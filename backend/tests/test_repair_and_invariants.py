"""
Unit tests for repair engine, invariants, and survivorship:
- Input DataFrames unchanged after repair (hash / equality check)
- Every applied change has an audit entry
- No dangling ids after repair
- Rejecting a pending action restores original value
- Lineage retrieval
"""

import pandas as pd
import pytest

from backend.pipeline.generator import generate_clean_dataset
from backend.pipeline.corruptor import inject_corruption
from backend.pipeline.normalize import normalize_datasets
from backend.pipeline.dedupe import deduplicate_dataset
from backend.pipeline.detectors import run_all_detectors
from backend.pipeline.repair import repair_dataset, apply_review_decision, get_lineage


def test_input_dataframes_unchanged_after_repair():
    """Hash / equality check ensuring input DataFrames are not mutated during repair."""
    p, pl, e, r = generate_clean_dataset(seed=42)
    cp, cpl, ce, cr, gt = inject_corruption(p, pl, e, r, seed=42)

    cp_orig = cp.copy()
    cpl_orig = cpl.copy()
    ce_orig = ce.copy()
    cr_orig = cr.copy()

    norm_p, norm_pl, norm_e, norm_r = normalize_datasets(cp, cpl, ce, cr)
    dedupe_res = deduplicate_dataset(norm_p, norm_pl)
    issues = run_all_detectors(norm_p, norm_pl, norm_e, norm_r)

    repair_res = repair_dataset(norm_p, norm_pl, norm_e, norm_r, dedupe_res, issues)

    # Verify original inputs are untouched
    pd.testing.assert_frame_equal(cp, cp_orig)
    pd.testing.assert_frame_equal(cpl, cpl_orig)
    pd.testing.assert_frame_equal(ce, ce_orig)
    pd.testing.assert_frame_equal(cr, cr_orig)


def test_every_applied_change_has_audit_entry():
    """Every modification in repaired output must have a traceable audit log entry."""
    p, pl, e, r = generate_clean_dataset(seed=42)
    cp, cpl, ce, cr, gt = inject_corruption(p, pl, e, r, seed=42)

    norm_p, norm_pl, norm_e, norm_r = normalize_datasets(cp, cpl, ce, cr)
    dedupe_res = deduplicate_dataset(norm_p, norm_pl)
    issues = run_all_detectors(norm_p, norm_pl, norm_e, norm_r)

    repair_res = repair_dataset(norm_p, norm_pl, norm_e, norm_r, dedupe_res, issues)
    audit = repair_res["audit_log"]

    assert len(audit) > 0

    required_keys = [
        "action_id",
        "action_type",
        "table",
        "record_ids",
        "plain_English_reason",
        "confidence",
        "method",
        "status",
    ]
    for act in audit:
        for k in required_keys:
            assert k in act, f"Missing key {k} in audit action: {act}"
        assert act["status"] in ("applied", "pending_review", "rejected")


def test_no_dangling_ids_after_repair():
    """Referential integrity: no dangling foreign keys after repair."""
    p, pl, e, r = generate_clean_dataset(seed=42)
    cp, cpl, ce, cr, gt = inject_corruption(p, pl, e, r, seed=42)

    norm_p, norm_pl, norm_e, norm_r = normalize_datasets(cp, cpl, ce, cr)
    dedupe_res = deduplicate_dataset(norm_p, norm_pl)
    issues = run_all_detectors(norm_p, norm_pl, norm_e, norm_r)

    repair_res = repair_dataset(norm_p, norm_pl, norm_e, norm_r, dedupe_res, issues)

    rep_p = repair_res["repaired_people"]
    rep_pl = repair_res["repaired_places"]
    rep_e = repair_res["repaired_events"]
    rep_r = repair_res["repaired_relationships"]

    known_people = set(rep_p["repaired_id"].dropna().astype(str))
    known_places = set(rep_pl["repaired_id"].dropna().astype(str))
    known_events = set(rep_e["repaired_id"].dropna().astype(str))

    # In relationships
    for _, row in rep_r.iterrows():
        assert str(row["from_id"]) in known_people
        if row["rel_type"] == "participated_in":
            assert str(row["to_id"]) in known_events
        else:
            assert str(row["to_id"]) in known_people

    # In people birth_place_id
    for bp in rep_p["birth_place_id"].dropna():
        if str(bp).strip() and str(bp).lower() not in ("none", "nan"):
            assert str(bp) in known_places

    # In events place_id
    for plid in rep_e["place_id"].dropna():
        if str(plid).strip() and str(plid).lower() not in ("none", "nan"):
            assert str(plid) in known_places


def test_rejecting_pending_action_restores_original_value():
    """Rejecting an action must restore the original value in the repaired dataset."""
    run_data = {
        "audit_log": [
            {
                "action_id": "ACT_001",
                "action_type": "FIX_TYPO",
                "table": "people",
                "record_ids": ["PER_001"],
                "field": "occupation",
                "old_value": "Software Enginer",
                "new_value": "Software Engineer",
                "status": "applied",
            }
        ],
        "repaired_people": pd.DataFrame([
            {"repaired_id": "PER_001", "occupation": "Software Engineer"}
        ]),
        "issues": [],
    }

    # Reject the action
    updated = apply_review_decision(run_data, "ACT_001", approve=False)
    assert updated["audit_log"][0]["status"] == "rejected"
    # Value should be restored to old_value
    current_val = updated["repaired_people"].loc[
        updated["repaired_people"]["repaired_id"] == "PER_001", "occupation"
    ].iloc[0]
    assert current_val == "Software Enginer"


def test_lineage_traceability():
    """Lineage returns repaired record, source records, and provenance."""
    orig_p = pd.DataFrame([
        {"person_id": "P1", "full_name": "Bob Smith", "dob": "1980-01-01"},
        {"person_id": "P2", "full_name": "Robert Smith", "dob": "1980-01-01"},
    ])
    rep_p = pd.DataFrame([
        {
            "repaired_id": "P1",
            "full_name": "Robert Smith",
            "source_ids": ["P1", "P2"],
            "field_provenance": {"full_name": "P2", "dob": "P1"},
        }
    ])
    run_data = {
        "audit_log": [
            {
                "action_id": "ACT_001",
                "record_ids": ["P1", "P2"],
                "action_type": "MERGE",
                "plain_English_reason": "Merged duplicates",
            }
        ],
        "repaired_people": rep_p,
        "original_people": orig_p,
    }

    lineage = get_lineage("P1", run_data)
    assert lineage["repaired_id"] == "P1"
    assert len(lineage["original_records"]) == 2
    assert lineage["field_provenance"]["full_name"] == "P2"
    assert len(lineage["audit_timeline"]) == 1
