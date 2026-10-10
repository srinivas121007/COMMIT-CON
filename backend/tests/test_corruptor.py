"""
Unit tests for the corruptor module.
Verifies every injected issue type exists, ground truth mapping, and immutability.
"""

import pandas as pd
import pytest

from backend.pipeline.generator import generate_clean_dataset
from backend.pipeline.corruptor import inject_corruption


def test_corruptor_immutability():
    """Input DataFrames must not be mutated by inject_corruption."""
    p, pl, e, r = generate_clean_dataset(seed=42)
    p_orig = p.copy()
    pl_orig = pl.copy()
    e_orig = e.copy()
    r_orig = r.copy()

    cp, cpl, ce, cr, gt = inject_corruption(p, pl, e, r, seed=42)

    pd.testing.assert_frame_equal(p, p_orig)
    pd.testing.assert_frame_equal(pl, pl_orig)
    pd.testing.assert_frame_equal(e, e_orig)
    pd.testing.assert_frame_equal(r, r_orig)


def test_every_injected_issue_type_exists():
    """Verify that every required injected issue type exists in ground truth."""
    p, pl, e, r = generate_clean_dataset(seed=42)
    cp, cpl, ce, cr, gt = inject_corruption(p, pl, e, r, seed=42)

    injected = gt.get("injected_issues", [])
    assert len(injected) > 0

    found_types = {iss["type"] for iss in injected}

    required_types = [
        "DUPLICATE",
        "TYPO",
        "MISSING_FIELD",
        "INVALID_FORMAT",
        "CONTRADICTION_DOD_BEFORE_DOB",
        "CONTRADICTION_PARENT_YOUNGER",
        "CONTRADICTION_SELF_RELATIONSHIP",
        "CONTRADICTION_CONFLICTING_DOB",
        "CONTRADICTION_PLACE_COUNTRY",
        "CONTRADICTION_EVENT_BEFORE_BIRTH",
    ]

    for req in required_types:
        assert req in found_types, f"Required injected issue type '{req}' was not found in injected issues!"


def test_entity_map_completeness():
    """Verify entity_map maps all records in corrupted dataset."""
    p, pl, e, r = generate_clean_dataset(seed=42)
    cp, cpl, ce, cr, gt = inject_corruption(p, pl, e, r, seed=42)

    emap = gt["entity_map"]
    for pid in cp["person_id"]:
        assert pid in emap
    for plid in cpl["place_id"]:
        assert plid in emap
