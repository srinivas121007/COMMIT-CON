"""
Unit tests for synthetic clean generator.
Verifies determinism for seed 42 and zero logical violations.
"""

from datetime import datetime
import pandas as pd
import pytest

from backend.pipeline.generator import generate_clean_dataset


def test_generator_determinism():
    """Generator output must be perfectly deterministic for seed 42."""
    p1, pl1, e1, r1 = generate_clean_dataset(seed=42)
    p2, pl2, e2, r2 = generate_clean_dataset(seed=42)

    pd.testing.assert_frame_equal(p1, p2)
    pd.testing.assert_frame_equal(pl1, pl2)
    pd.testing.assert_frame_equal(e1, e2)
    pd.testing.assert_frame_equal(r1, r2)


def test_generator_counts_and_structure():
    """Verifies approximate expected counts and column presence."""
    p, pl, e, r = generate_clean_dataset(seed=42)

    assert 380 <= len(p) <= 420
    assert 35 <= len(pl) <= 45
    assert 70 <= len(e) <= 90
    assert 550 <= len(r) <= 650

    for col in ["person_id", "full_name", "dob", "birth_place_id", "gender", "occupation"]:
        assert col in p.columns
        assert p[col].notna().all()

    for col in ["place_id", "name", "country", "region"]:
        assert col in pl.columns
        assert pl[col].notna().all()


def test_generator_zero_logical_violations():
    """Verifies zero logical violations in generated clean dataset."""
    p, pl, e, r = generate_clean_dataset(seed=42)

    # 1. dod after dob
    for _, row in p.iterrows():
        dob = datetime.strptime(row["dob"], "%Y-%m-%d")
        if row["dod"]:
            dod = datetime.strptime(row["dod"], "%Y-%m-%d")
            assert dod > dob, f"dod {dod} is not after dob {dob} for {row['person_id']}"

    # 2. No self-relationships
    for _, row in r.iterrows():
        assert row["from_id"] != row["to_id"], f"Self relationship on {row['rel_id']}"

    # 3. Parents 18-50 years older than children
    p_map = {row["person_id"]: datetime.strptime(row["dob"], "%Y-%m-%d") for _, row in p.iterrows()}
    parent_rels = r[r["rel_type"] == "parent_of"]
    for _, row in parent_rels.iterrows():
        parent_dob = p_map[row["from_id"]]
        child_dob = p_map[row["to_id"]]
        age_diff = child_dob.year - parent_dob.year
        assert 18 <= age_diff <= 50, f"Parent {row['from_id']} age diff {age_diff} not in 18-50 for child {row['to_id']}"

    # 4. Events after participant's birth
    e_map = {row["event_id"]: datetime.strptime(row["date"], "%Y-%m-%d") for _, row in e.iterrows()}
    part_rels = r[r["rel_type"] == "participated_in"]
    for _, row in part_rels.iterrows():
        person_dob = p_map[row["from_id"]]
        event_date = e_map[row["to_id"]]
        assert event_date > person_dob, f"Event {row['to_id']} at {event_date} before birth {person_dob}"

    # 5. Each place in one country
    place_countries = pl.groupby("name")["country"].nunique()
    assert (place_countries == 1).all(), "A place exists with multiple countries"
