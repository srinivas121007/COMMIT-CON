"""
Quality scoring module.
Calculates data quality as:
Quality = 100 * (0.25 Completeness + 0.25 Uniqueness + 0.25 Consistency + 0.25 Validity)
Computed with the exact same function on clean, corrupted, and repaired datasets.
Does not import FastAPI or Firebase.
"""

import re
from datetime import datetime
from typing import Dict, Any, List, Optional
import pandas as pd


def _safe_dt(val: Any) -> Optional[datetime]:
    if val is None or pd.isna(val):
        return None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null", "nat"):
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return None


def calculate_dataset_quality(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Computes quality metrics on a relational dataset:
    - Completeness (0-1)
    - Uniqueness (0-1)
    - Consistency (0-1)
    - Validity (0-1)
    - Overall Quality (0-100)
    """
    # 1. Completeness
    # Check non-null essential fields
    p_fields = ["person_id", "full_name", "dob", "birth_place_id", "gender", "occupation"]
    pl_fields = ["place_id", "name", "country", "region"]
    e_fields = ["event_id", "title", "date", "place_id", "event_type"]
    r_fields = ["rel_id", "from_id", "to_id", "rel_type"]

    total_cells = 0
    filled_cells = 0

    for df, fields in [
        (people_df, p_fields),
        (places_df, pl_fields),
        (events_df, e_fields),
        (relationships_df, r_fields),
    ]:
        for f in fields:
            if f in df.columns:
                col = df[f]
                total_cells += len(col)
                # Count non-null, non-empty, non-nan
                filled = col.apply(lambda v: v is not None and not (isinstance(v, float) and pd.isna(v)) and str(v).strip() not in ("", "None", "nan", "null")).sum()
                filled_cells += int(filled)

    completeness = (filled_cells / total_cells) if total_cells > 0 else 1.0

    # 2. Uniqueness
    # Approximate uniqueness from duplicates / collisions in entities
    # People: count unique normalized name + dob combinations vs total people
    total_people = len(people_df)
    if total_people > 0:
        # Simple fingerprint: (first 3 chars of name, dob year)
        fingerprints = []
        for _, r in people_df.iterrows():
            name = str(r.get("full_name") or "").lower().strip()
            dob = str(r.get("dob") or "").strip()[:4]
            fingerprints.append(f"{name[:10]}_{dob}")
        unique_people_count = len(set(fingerprints))
        people_uniqueness = unique_people_count / total_people
    else:
        people_uniqueness = 1.0

    total_places = len(places_df)
    if total_places > 0:
        place_names = [str(r.get("name") or "").lower().strip() for _, r in places_df.iterrows()]
        places_uniqueness = len(set(place_names)) / total_places
    else:
        places_uniqueness = 1.0

    uniqueness = (0.75 * people_uniqueness + 0.25 * places_uniqueness)

    # 3. Consistency
    # Check logical contradiction rules
    contradictions = 0
    checks_performed = 0

    # Rule A: dod >= dob
    for _, r in people_df.iterrows():
        dob = _safe_dt(r.get("dob"))
        dod = _safe_dt(r.get("dod"))
        if dob and dod:
            checks_performed += 1
            if dod < dob:
                contradictions += 1

    # Rule B: parent >= 12 years older than child, no self-rel
    people_dob_map = {r["person_id"]: _safe_dt(r.get("dob")) for _, r in people_df.iterrows()}
    for _, r in relationships_df.iterrows():
        from_id = r.get("from_id")
        to_id = r.get("to_id")
        rtype = r.get("rel_type")
        checks_performed += 1

        if from_id == to_id:
            contradictions += 1

        if rtype == "parent_of":
            p_dob = people_dob_map.get(from_id)
            c_dob = people_dob_map.get(to_id)
            if p_dob and c_dob:
                checks_performed += 1
                age_diff = (c_dob - p_dob).days / 365.25
                if age_diff < 12.0:
                    contradictions += 1

    # Rule C: events after participant's birth
    events_date_map = {r["event_id"]: _safe_dt(r.get("date")) for _, r in events_df.iterrows()}
    for _, r in relationships_df.iterrows():
        if r.get("rel_type") == "participated_in":
            p_dob = people_dob_map.get(r.get("from_id"))
            ev_dt = events_date_map.get(r.get("to_id"))
            if p_dob and ev_dt:
                checks_performed += 1
                if ev_dt < p_dob:
                    contradictions += 1

    # Rule D: places country conflicts
    by_place_name = {}
    for _, r in places_df.iterrows():
        pn = str(r.get("name") or "").strip().lower()
        if pn:
            by_place_name.setdefault(pn, set()).add(str(r.get("country") or "").strip().lower())
    for pn, countries in by_place_name.items():
        checks_performed += 1
        if len(countries) > 1:
            contradictions += (len(countries) - 1)

    checks_performed = max(checks_performed, 1)
    consistency = max(0.0, 1.0 - (contradictions / checks_performed))

    # 4. Validity
    # Format checks & foreign key referential integrity
    valid_format_count = 0
    format_checks = 0
    iso_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")

    # Date validity
    for d in people_df["dob"].dropna():
        format_checks += 1
        if iso_pattern.match(str(d).strip()):
            valid_format_count += 1
    for d in people_df["dod"].dropna():
        format_checks += 1
        if iso_pattern.match(str(d).strip()):
            valid_format_count += 1
    for d in events_df["date"].dropna():
        format_checks += 1
        if iso_pattern.match(str(d).strip()):
            valid_format_count += 1

    # Referential integrity checks
    known_people = set(people_df["person_id"].dropna().astype(str))
    known_places = set(places_df["place_id"].dropna().astype(str))
    known_events = set(events_df["event_id"].dropna().astype(str))

    for _, r in relationships_df.iterrows():
        format_checks += 2
        if str(r.get("from_id")) in known_people:
            valid_format_count += 1
        if r.get("rel_type") == "participated_in":
            if str(r.get("to_id")) in known_events:
                valid_format_count += 1
        else:
            if str(r.get("to_id")) in known_people:
                valid_format_count += 1

    for bp in people_df["birth_place_id"].dropna():
        s = str(bp).strip()
        if s and s.lower() not in ("none", "nan"):
            format_checks += 1
            if s in known_places:
                valid_format_count += 1

    for pl in events_df["place_id"].dropna():
        s = str(pl).strip()
        if s and s.lower() not in ("none", "nan"):
            format_checks += 1
            if s in known_places:
                valid_format_count += 1

    validity = (valid_format_count / max(format_checks, 1))

    # Overall score = 100 * (0.25 C + 0.25 U + 0.25 C + 0.25 V)
    overall_quality = 100.0 * (
        0.25 * completeness
        + 0.25 * uniqueness
        + 0.25 * consistency
        + 0.25 * validity
    )

    return {
        "overall_quality": round(overall_quality, 2),
        "completeness": round(completeness * 100, 2),
        "uniqueness": round(uniqueness * 100, 2),
        "consistency": round(consistency * 100, 2),
        "validity": round(validity * 100, 2),
        "metrics": {
            "completeness_ratio": round(completeness, 4),
            "uniqueness_ratio": round(uniqueness, 4),
            "consistency_ratio": round(consistency, 4),
            "validity_ratio": round(validity, 4),
            "total_records": len(people_df) + len(places_df) + len(events_df) + len(relationships_df),
            "contradiction_violations": contradictions,
        },
    }
