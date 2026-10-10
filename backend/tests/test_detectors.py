"""
Unit tests for each detector function in backend.pipeline.detectors.
Each detector must have its own standalone test.
"""

import pandas as pd
import pytest

from backend.pipeline.detectors import (
    detect_missing_fields,
    detect_incomplete_relationships,
    detect_typos,
    detect_invalid_formats,
    detect_death_before_birth,
    detect_parent_younger_than_child,
    detect_self_relationships,
    detect_conflicting_dob_in_cluster,
    detect_place_multiple_countries,
    detect_event_before_birth,
)


def test_detect_missing_fields():
    p_df = pd.DataFrame([{"person_id": "P1", "full_name": None, "dob": "1990-01-01", "birth_place_id": "PL1", "gender": "M", "occupation": "Doctor"}])
    empty = pd.DataFrame()
    issues = detect_missing_fields(p_df, empty, empty, empty)
    assert len(issues) == 1
    assert issues[0]["type"] == "MISSING_FIELD"
    assert issues[0]["field"] == "full_name"


def test_detect_incomplete_relationships():
    p_df = pd.DataFrame([{"person_id": "P1", "birth_place_id": "PL_MISSING"}])
    pl_df = pd.DataFrame([{"place_id": "PL1"}])
    e_df = pd.DataFrame([{"event_id": "E1", "place_id": "PL_MISSING"}])
    r_df = pd.DataFrame([{"rel_id": "R1", "from_id": "P_MISSING", "to_id": "P1", "rel_type": "parent_of"}])

    issues = detect_incomplete_relationships(p_df, pl_df, e_df, r_df)
    assert len(issues) >= 3
    types = {i["type"] for i in issues}
    assert "INCOMPLETE_RELATIONSHIP" in types


def test_detect_typos():
    # Value appearing <=2 times within edit distance <=2 of one appearing >=3 times
    p_df = pd.DataFrame([
        {"person_id": "P1", "occupation": "Software Engineer"},
        {"person_id": "P2", "occupation": "Software Engineer"},
        {"person_id": "P3", "occupation": "Software Engineer"},
        {"person_id": "P4", "occupation": "Software Enginer"},  # typo!
    ])
    empty = pd.DataFrame()
    issues = detect_typos(p_df, empty, empty)
    assert len(issues) == 1
    assert issues[0]["type"] == "TYPO"
    assert issues[0]["old_value"] == "Software Enginer"
    assert issues[0]["new_value"] == "Software Engineer"
    assert issues[0]["confidence"] >= 0.80


def test_detect_invalid_formats():
    p_df = pd.DataFrame([
        {"person_id": "P1", "dob": "05/12/1980", "dod": "1990/10/20"},
    ])
    empty = pd.DataFrame()
    issues = detect_invalid_formats(p_df, empty, empty)
    assert len(issues) == 2
    for iss in issues:
        assert iss["type"] == "INVALID_FORMAT"


def test_detect_death_before_birth():
    p_df = pd.DataFrame([
        {"person_id": "P1", "dob": "1980-05-10", "dod": "1975-04-01"},  # DOD before DOB!
        {"person_id": "P2", "dob": "1980-05-10", "dod": "2020-04-01"},
    ])
    issues = detect_death_before_birth(p_df)
    assert len(issues) == 1
    assert issues[0]["type"] == "CONTRADICTION_DOD_BEFORE_DOB"
    assert issues[0]["record_ids"] == ["P1"]


def test_detect_parent_younger_than_child():
    p_df = pd.DataFrame([
        {"person_id": "P_PARENT", "dob": "2000-01-01"},
        {"person_id": "P_CHILD", "dob": "1995-01-01"},  # Parent younger than child!
    ])
    r_df = pd.DataFrame([
        {"rel_id": "R1", "from_id": "P_PARENT", "to_id": "P_CHILD", "rel_type": "parent_of"},
    ])
    issues = detect_parent_younger_than_child(p_df, r_df)
    assert len(issues) == 1
    assert issues[0]["type"] == "CONTRADICTION_PARENT_YOUNGER"


def test_detect_self_relationships():
    r_df = pd.DataFrame([
        {"rel_id": "R1", "from_id": "P1", "to_id": "P1", "rel_type": "spouse_of"},
        {"rel_id": "R2", "from_id": "P1", "to_id": "P2", "rel_type": "sibling_of"},
    ])
    issues = detect_self_relationships(r_df)
    assert len(issues) == 1
    assert issues[0]["type"] == "CONTRADICTION_SELF_RELATIONSHIP"
    assert issues[0]["record_ids"] == ["R1", "P1"]


def test_detect_conflicting_dob_in_cluster():
    p_df = pd.DataFrame([
        {"person_id": "P1", "dob": "1980-05-10"},
        {"person_id": "P2", "dob": "1985-05-10"},  # 5 years diff
    ])
    clusters = [["P1", "P2"]]
    issues = detect_conflicting_dob_in_cluster(p_df, clusters)
    assert len(issues) == 1
    assert issues[0]["type"] == "CONTRADICTION_CONFLICTING_DOB"


def test_detect_place_multiple_countries():
    pl_df = pd.DataFrame([
        {"place_id": "PL1", "name": "Springfield", "country": "United States"},
        {"place_id": "PL2", "name": "Springfield", "country": "Atlantis"},
    ])
    issues = detect_place_multiple_countries(pl_df)
    assert len(issues) >= 1
    assert issues[0]["type"] == "CONTRADICTION_PLACE_COUNTRY"


def test_detect_event_before_birth():
    p_df = pd.DataFrame([
        {"person_id": "P1", "dob": "1990-01-01", "dod": None},
    ])
    e_df = pd.DataFrame([
        {"event_id": "E1", "date": "1985-01-01"},  # Event before participant birth!
    ])
    r_df = pd.DataFrame([
        {"rel_id": "R1", "from_id": "P1", "to_id": "E1", "rel_type": "participated_in"},
    ])
    issues = detect_event_before_birth(p_df, e_df, r_df)
    assert len(issues) == 1
    assert issues[0]["type"] == "CONTRADICTION_EVENT_BEFORE_BIRTH"
