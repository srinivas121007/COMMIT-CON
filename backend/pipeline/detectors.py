"""
Detectors module.
Standalone detector functions for:
- MISSING_FIELD
- INCOMPLETE_RELATIONSHIP (dangling ids)
- TYPO (edit distance <= 2 to frequent value >= 3 occurrences, conf = 1 - dist/len)
- INVALID_FORMAT
Contradiction rules:
- death_before_birth
- parent_younger_than_child (or < 12 years older)
- self_relationship
- conflicting_dob_in_cluster
- place_multiple_countries
- event_before_birth
Does not import FastAPI or Firebase. Never mutates input DataFrames.
"""

import re
from datetime import datetime
from collections import Counter
from typing import Dict, List, Tuple, Any, Optional
import pandas as pd
from rapidfuzz.distance import Levenshtein


def _safe_date(val: Any) -> Optional[datetime]:
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


def detect_missing_fields(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """Detect missing values in essential fields."""
    issues = []
    
    # Check people essential fields (excluding dod which can naturally be None for living people)
    for _, row in people_df.iterrows():
        pid = row.get("person_id")
        for col in ["full_name", "dob", "birth_place_id", "gender", "occupation"]:
            val = row.get(col)
            if val is None or pd.isna(val) or str(val).strip() in ("", "nan", "none", "null"):
                issues.append({
                    "type": "MISSING_FIELD",
                    "table": "people",
                    "record_ids": [pid],
                    "field": col,
                    "old_value": None,
                    "new_value": None,
                    "reason": f"Required field '{col}' is missing in people record {pid}",
                    "confidence": 1.0,
                    "status": "pending_review",
                })

    # Check places
    for _, row in places_df.iterrows():
        plid = row.get("place_id")
        for col in ["name", "country", "region"]:
            val = row.get(col)
            if val is None or pd.isna(val) or str(val).strip() in ("", "nan", "none", "null"):
                issues.append({
                    "type": "MISSING_FIELD",
                    "table": "places",
                    "record_ids": [plid],
                    "field": col,
                    "old_value": None,
                    "new_value": None,
                    "reason": f"Required field '{col}' is missing in places record {plid}",
                    "confidence": 1.0,
                    "status": "pending_review",
                })

    # Check events
    for _, row in events_df.iterrows():
        eid = row.get("event_id")
        for col in ["title", "date", "place_id", "event_type"]:
            val = row.get(col)
            if val is None or pd.isna(val) or str(val).strip() in ("", "nan", "none", "null"):
                issues.append({
                    "type": "MISSING_FIELD",
                    "table": "events",
                    "record_ids": [eid],
                    "field": col,
                    "old_value": None,
                    "new_value": None,
                    "reason": f"Required field '{col}' is missing in events record {eid}",
                    "confidence": 1.0,
                    "status": "pending_review",
                })

    return issues


def detect_incomplete_relationships(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """Detect dangling IDs across tables."""
    issues = []
    known_people = set(people_df["person_id"].dropna().astype(str))
    known_places = set(places_df["place_id"].dropna().astype(str))
    known_events = set(events_df["event_id"].dropna().astype(str))

    # Relationships references
    for _, row in relationships_df.iterrows():
        rel_id = row.get("rel_id")
        from_id = str(row.get("from_id") or "")
        to_id = str(row.get("to_id") or "")
        rel_type = str(row.get("rel_type") or "")

        # from_id should always be a person
        if from_id and from_id not in known_people:
            issues.append({
                "type": "INCOMPLETE_RELATIONSHIP",
                "table": "relationships",
                "record_ids": [rel_id],
                "field": "from_id",
                "old_value": from_id,
                "new_value": None,
                "reason": f"Dangling from_id '{from_id}' does not exist in people table",
                "confidence": 1.0,
                "status": "pending_review",
            })

        # to_id depends on rel_type
        if rel_type == "participated_in":
            if to_id and to_id not in known_events:
                issues.append({
                    "type": "INCOMPLETE_RELATIONSHIP",
                    "table": "relationships",
                    "record_ids": [rel_id],
                    "field": "to_id",
                    "old_value": to_id,
                    "new_value": None,
                    "reason": f"Dangling event to_id '{to_id}' does not exist in events table",
                    "confidence": 1.0,
                    "status": "pending_review",
                })
        else:
            if to_id and to_id not in known_people:
                issues.append({
                    "type": "INCOMPLETE_RELATIONSHIP",
                    "table": "relationships",
                    "record_ids": [rel_id],
                    "field": "to_id",
                    "old_value": to_id,
                    "new_value": None,
                    "reason": f"Dangling person to_id '{to_id}' does not exist in people table",
                    "confidence": 1.0,
                    "status": "pending_review",
                })

    # People foreign key to places
    for _, row in people_df.iterrows():
        pid = row.get("person_id")
        bp = str(row.get("birth_place_id") or "").strip()
        if bp and bp.lower() not in ("none", "nan") and bp not in known_places:
            issues.append({
                "type": "INCOMPLETE_RELATIONSHIP",
                "table": "people",
                "record_ids": [pid],
                "field": "birth_place_id",
                "old_value": bp,
                "new_value": None,
                "reason": f"Dangling birth_place_id '{bp}' does not exist in places table",
                "confidence": 1.0,
                "status": "pending_review",
            })

    # Events foreign key to places
    for _, row in events_df.iterrows():
        eid = row.get("event_id")
        pl = str(row.get("place_id") or "").strip()
        if pl and pl.lower() not in ("none", "nan") and pl not in known_places:
            issues.append({
                "type": "INCOMPLETE_RELATIONSHIP",
                "table": "events",
                "record_ids": [eid],
                "field": "place_id",
                "old_value": pl,
                "new_value": None,
                "reason": f"Dangling place_id '{pl}' does not exist in places table",
                "confidence": 1.0,
                "status": "pending_review",
            })

    return issues


def detect_typos(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """
    Detect typos: value appearing <= 2 times within edit distance <= 2
    of a value appearing >= 3 times in the same field.
    confidence = 1 - (dist / len(value))
    """
    issues = []

    columns_to_check = [
        ("people", people_df, "person_id", ["occupation"]),
        ("places", places_df, "place_id", ["country", "region"]),
        ("events", events_df, "event_id", ["event_type"]),
    ]

    for table_name, df, id_col, fields in columns_to_check:
        for field in fields:
            if field not in df.columns:
                continue
            # Gather non-null trimmed string values
            values = [
                str(v).strip()
                for v in df[field].dropna()
                if str(v).strip() and str(v).lower() not in ("none", "nan")
            ]
            counts = Counter(values)
            rare_vals = {v for v, c in counts.items() if c <= 2}
            frequent_vals = {v for v, c in counts.items() if c >= 3}

            # Map rare to best frequent match
            typo_map: Dict[str, Tuple[str, int, float]] = {}
            for r_val in rare_vals:
                best_match = None
                best_dist = 999
                for f_val in frequent_vals:
                    if r_val.lower() == f_val.lower():
                        continue
                    dist = Levenshtein.distance(r_val.lower(), f_val.lower())
                    if dist <= 2 and dist < best_dist:
                        best_dist = dist
                        best_match = f_val

                if best_match is not None and best_dist <= 2:
                    conf = max(0.0, min(1.0, 1.0 - (best_dist / max(len(r_val), 1))))
                    typo_map[r_val] = (best_match, best_dist, round(conf, 4))

            # Find matching records
            if typo_map:
                for _, row in df.iterrows():
                    val = str(row.get(field) or "").strip()
                    if val in typo_map:
                        rec_id = row.get(id_col)
                        suggested, dist, conf = typo_map[val]
                        issues.append({
                            "type": "TYPO",
                            "table": table_name,
                            "record_ids": [rec_id],
                            "field": field,
                            "old_value": val,
                            "new_value": suggested,
                            "reason": f"Value '{val}' appears <=2 times, edit distance {dist} from frequent '{suggested}'",
                            "confidence": conf,
                            "status": "pending_review",
                        })

    return issues


def detect_invalid_formats(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """Detect invalid date formats (not ISO YYYY-MM-DD) and malformed values."""
    issues = []
    iso_date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")

    # People DOB and DOD
    for _, row in people_df.iterrows():
        pid = row.get("person_id")
        dob = row.get("dob")
        if dob is not None and pd.notna(dob) and str(dob).strip() not in ("", "nan", "none", "null"):
            s_dob = str(dob).strip()
            if not iso_date_pattern.match(s_dob):
                parsed = _safe_date(s_dob)
                suggested = parsed.strftime("%Y-%m-%d") if parsed else None
                issues.append({
                    "type": "INVALID_FORMAT",
                    "table": "people",
                    "record_ids": [pid],
                    "field": "dob",
                    "old_value": s_dob,
                    "new_value": suggested,
                    "reason": f"DOB '{s_dob}' is not in ISO YYYY-MM-DD format",
                    "confidence": 0.95 if suggested else 0.5,
                    "status": "pending_review",
                })

        dod = row.get("dod")
        if dod is not None and pd.notna(dod) and str(dod).strip() not in ("", "nan", "none", "null"):
            s_dod = str(dod).strip()
            if not iso_date_pattern.match(s_dod):
                parsed = _safe_date(s_dod)
                suggested = parsed.strftime("%Y-%m-%d") if parsed else None
                issues.append({
                    "type": "INVALID_FORMAT",
                    "table": "people",
                    "record_ids": [pid],
                    "field": "dod",
                    "old_value": s_dod,
                    "new_value": suggested,
                    "reason": f"DOD '{s_dod}' is not in ISO YYYY-MM-DD format",
                    "confidence": 0.95 if suggested else 0.5,
                    "status": "pending_review",
                })

    # Events date
    for _, row in events_df.iterrows():
        eid = row.get("event_id")
        edate = row.get("date")
        if edate is not None and pd.notna(edate) and str(edate).strip() not in ("", "nan", "none", "null"):
            s_date = str(edate).strip()
            if not iso_date_pattern.match(s_date):
                parsed = _safe_date(s_date)
                suggested = parsed.strftime("%Y-%m-%d") if parsed else None
                issues.append({
                    "type": "INVALID_FORMAT",
                    "table": "events",
                    "record_ids": [eid],
                    "field": "date",
                    "old_value": s_date,
                    "new_value": suggested,
                    "reason": f"Event date '{s_date}' is not in ISO YYYY-MM-DD format",
                    "confidence": 0.95 if suggested else 0.5,
                    "status": "pending_review",
                })

    return issues


def detect_death_before_birth(people_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Detect people where DOD is strictly before DOB."""
    issues = []
    for _, row in people_df.iterrows():
        pid = row.get("person_id")
        dob = _safe_date(row.get("dob"))
        dod = _safe_date(row.get("dod"))
        if dob and dod and dod < dob:
            issues.append({
                "type": "CONTRADICTION_DOD_BEFORE_DOB",
                "table": "people",
                "record_ids": [pid],
                "field": "dod",
                "old_value": str(row.get("dod")),
                "new_value": None,
                "reason": f"Death date ({row.get('dod')}) is before birth date ({row.get('dob')})",
                "confidence": 1.0,
                "status": "pending_review",
            })
    return issues


def detect_parent_younger_than_child(
    people_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """Detect parent younger than child or less than 12 years older."""
    issues = []
    people_map = {}
    for _, row in people_df.iterrows():
        pid = row.get("person_id")
        people_map[pid] = _safe_date(row.get("dob"))

    for _, row in relationships_df.iterrows():
        if row.get("rel_type") == "parent_of":
            rel_id = row.get("rel_id")
            parent_id = row.get("from_id")
            child_id = row.get("to_id")
            parent_dob = people_map.get(parent_id)
            child_dob = people_map.get(child_id)
            if parent_dob and child_dob:
                # Parent should be >= 12 years older
                # i.e., child_dob - parent_dob >= 12 years
                age_diff_years = (child_dob - parent_dob).days / 365.25
                if age_diff_years < 12.0:
                    issues.append({
                        "type": "CONTRADICTION_PARENT_YOUNGER",
                        "table": "relationships",
                        "record_ids": [rel_id, parent_id, child_id],
                        "field": "dob",
                        "old_value": f"Parent DOB: {parent_dob.strftime('%Y-%m-%d')}, Child DOB: {child_dob.strftime('%Y-%m-%d')}",
                        "new_value": None,
                        "reason": f"Parent {parent_id} is only {age_diff_years:.1f} years older than child {child_id} (< 12 years)",
                        "confidence": 1.0,
                        "status": "pending_review",
                    })
    return issues


def detect_self_relationships(relationships_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Detect relationships where from_id == to_id."""
    issues = []
    for _, row in relationships_df.iterrows():
        from_id = row.get("from_id")
        to_id = row.get("to_id")
        if from_id and to_id and from_id == to_id:
            rel_id = row.get("rel_id")
            issues.append({
                "type": "CONTRADICTION_SELF_RELATIONSHIP",
                "table": "relationships",
                "record_ids": [rel_id, from_id],
                "field": "to_id",
                "old_value": to_id,
                "new_value": None,
                "reason": f"Entity {from_id} is in a self-relationship {rel_id} ({row.get('rel_type')})",
                "confidence": 1.0,
                "status": "pending_review",
            })
    return issues


def detect_conflicting_dob_in_cluster(
    people_df: pd.DataFrame,
    clusters: Optional[List[List[str]]] = None,
) -> List[Dict[str, Any]]:
    """
    Detect conflicting DOBs among records grouped in the same cluster.
    """
    issues = []
    if not clusters:
        return issues

    people_map = {r["person_id"]: r for r in people_df.to_dict(orient="records")}

    for cluster in clusters:
        if len(cluster) <= 1:
            continue
        dobs = {}
        for pid in cluster:
            rec = people_map.get(pid)
            if rec and rec.get("dob"):
                dt = _safe_date(rec.get("dob"))
                if dt:
                    dobs[pid] = dt

        if len(dobs) > 1:
            # Check if any two DOBs differ by > 1 year
            pid_list = list(dobs.keys())
            for i in range(len(pid_list)):
                for j in range(i + 1, len(pid_list)):
                    p1, p2 = pid_list[i], pid_list[j]
                    d1, d2 = dobs[p1], dobs[p2]
                    diff_days = abs((d1 - d2).days)
                    if diff_days > 365:
                        issues.append({
                            "type": "CONTRADICTION_CONFLICTING_DOB",
                            "table": "people",
                            "record_ids": [p1, p2],
                            "field": "dob",
                            "old_value": f"{p1}: {d1.strftime('%Y-%m-%d')}, {p2}: {d2.strftime('%Y-%m-%d')}",
                            "new_value": None,
                            "reason": f"Conflicting DOBs within duplicate cluster: {p1} ({d1.strftime('%Y-%m-%d')}) vs {p2} ({d2.strftime('%Y-%m-%d')})",
                            "confidence": 0.95,
                            "status": "pending_review",
                        })
    return issues


def detect_place_multiple_countries(
    places_df: pd.DataFrame,
    clusters: Optional[List[List[str]]] = None,
) -> List[Dict[str, Any]]:
    """Detect places with the same name or in the same cluster assigned to different countries."""
    issues = []
    places_map = {r["place_id"]: r for r in places_df.to_dict(orient="records")}

    # 1. Check within clusters
    if clusters:
        for cluster in clusters:
            countries = set()
            for plid in cluster:
                p = places_map.get(plid)
                if p and p.get("country"):
                    c_clean = str(p.get("country")).strip().lower()
                    if c_clean:
                        countries.add((c_clean, plid, p.get("country")))
            if len({c[0] for c in countries}) > 1:
                rec_ids = [c[1] for c in countries]
                raw_countries = [c[2] for c in countries]
                issues.append({
                    "type": "CONTRADICTION_PLACE_COUNTRY",
                    "table": "places",
                    "record_ids": rec_ids,
                    "field": "country",
                    "old_value": ", ".join(raw_countries),
                    "new_value": None,
                    "reason": f"Place cluster has conflicting countries: {raw_countries}",
                    "confidence": 0.95,
                    "status": "pending_review",
                })

    # 2. Check places with identical normalized names having contradictory countries
    # (e.g. Atlantis / Utopia)
    by_name = {}
    for r in places_df.to_dict(orient="records"):
        name_clean = str(r.get("name") or "").strip().lower()
        if name_clean:
            by_name.setdefault(name_clean, []).append(r)

    for n_clean, recs in by_name.items():
        if len(recs) > 1:
            distinct_countries = {str(r.get("country")).strip().lower() for r in recs if r.get("country")}
            if len(distinct_countries) > 1:
                rec_ids = [r["place_id"] for r in recs]
                issues.append({
                    "type": "CONTRADICTION_PLACE_COUNTRY",
                    "table": "places",
                    "record_ids": rec_ids,
                    "field": "country",
                    "old_value": ", ".join([str(r.get("country")) for r in recs]),
                    "new_value": None,
                    "reason": f"Same place name '{n_clean}' associated with multiple countries",
                    "confidence": 0.90,
                    "status": "pending_review",
                })

    return issues


def detect_event_before_birth(
    people_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """Detect events occurring before participant's birth date or after their death date."""
    issues = []
    people_map = {}
    for _, row in people_df.iterrows():
        people_map[row["person_id"]] = {
            "dob": _safe_date(row.get("dob")),
            "dod": _safe_date(row.get("dod")),
        }

    events_map = {}
    for _, row in events_df.iterrows():
        events_map[row["event_id"]] = _safe_date(row.get("date"))

    for _, row in relationships_df.iterrows():
        if row.get("rel_type") == "participated_in":
            rel_id = row.get("rel_id")
            person_id = row.get("from_id")
            event_id = row.get("to_id")
            p_dates = people_map.get(person_id)
            ev_date = events_map.get(event_id)

            if p_dates and ev_date and p_dates["dob"]:
                if ev_date < p_dates["dob"]:
                    issues.append({
                        "type": "CONTRADICTION_EVENT_BEFORE_BIRTH",
                        "table": "events",
                        "record_ids": [event_id, person_id, rel_id],
                        "field": "date",
                        "old_value": ev_date.strftime("%Y-%m-%d"),
                        "new_value": None,
                        "reason": f"Event {event_id} ({ev_date.strftime('%Y-%m-%d')}) occurred before participant {person_id} was born ({p_dates['dob'].strftime('%Y-%m-%d')})",
                        "confidence": 1.0,
                        "status": "pending_review",
                    })

    return issues


def run_all_detectors(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
    people_clusters: Optional[List[List[str]]] = None,
    places_clusters: Optional[List[List[str]]] = None,
) -> List[Dict[str, Any]]:
    """
    Run all detectors and return normalized list of issues with issue_id.
    """
    all_issues: List[Dict[str, Any]] = []

    all_issues.extend(detect_missing_fields(people_df, places_df, events_df, relationships_df))
    all_issues.extend(detect_incomplete_relationships(people_df, places_df, events_df, relationships_df))
    all_issues.extend(detect_typos(people_df, places_df, events_df))
    all_issues.extend(detect_invalid_formats(people_df, places_df, events_df))
    all_issues.extend(detect_death_before_birth(people_df))
    all_issues.extend(detect_parent_younger_than_child(people_df, relationships_df))
    all_issues.extend(detect_self_relationships(relationships_df))
    all_issues.extend(detect_conflicting_dob_in_cluster(people_df, people_clusters))
    all_issues.extend(detect_place_multiple_countries(places_df, places_clusters))
    all_issues.extend(detect_event_before_birth(people_df, events_df, relationships_df))

    # Assign unique issue_ids
    for idx, iss in enumerate(all_issues):
        iss["issue_id"] = f"ISS_{idx + 1:05d}"

    return all_issues
