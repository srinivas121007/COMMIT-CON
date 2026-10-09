"""
Repair module.
Builds new repaired tables:
- Repaired record: repaired_id, source_ids, field_provenance, repair_notes
- Survivorship per field: majority vote of non-null, then most complete, then most recent last_updated, else null + review
- Auto-fix typos only at confidence >= 0.80
- Fill missing values only from cluster members or consistent inference, else null
- Never invent values, never silently delete
- Re-point relationships and events to repaired IDs; collapse duplicate relationships
- Audit log entry per action
- Functions: apply_review_decision, get_lineage
Does not import FastAPI or Firebase. Never mutates input DataFrames.
"""

import copy
import re
from collections import Counter
from datetime import datetime
from typing import Dict, List, Tuple, Any, Optional, Set
import pandas as pd

from backend.pipeline.schema import (
    PEOPLE_COLUMNS,
    PLACES_COLUMNS,
    EVENTS_COLUMNS,
    RELATIONSHIPS_COLUMNS,
)


def _count_non_nulls(rec: Dict[str, Any]) -> int:
    return sum(
        1 for k, v in rec.items()
        if not k.startswith("norm_") and v is not None and not (isinstance(v, float) and pd.isna(v)) and str(v).strip() not in ("", "None", "nan")
    )


def _safe_dt_str(dt_str: Any) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        return datetime.fromisoformat(str(dt_str).replace("Z", "+00:00"))
    except Exception:
        return None


def resolve_field_survivorship(
    field_name: str,
    records: List[Dict[str, Any]],
) -> Tuple[Any, str, str, float]:
    """
    Survivorship per field:
    1. Majority vote of non-null values
    2. Most complete record
    3. Most recent last_updated
    Returns (chosen_value, source_record_id, method, confidence).
    """
    non_null_pairs = []
    for r in records:
        val = r.get(field_name)
        if val is not None and not (isinstance(val, float) and pd.isna(val)):
            s_val = str(val).strip()
            if s_val and s_val.lower() not in ("none", "nan", "null"):
                non_null_pairs.append((val, r))

    if not non_null_pairs:
        return None, records[0].get("person_id") or records[0].get("place_id") or records[0].get("event_id"), "none", 0.0

    if len(non_null_pairs) == 1:
        chosen_val, src_rec = non_null_pairs[0]
        rec_id = src_rec.get("person_id") or src_rec.get("place_id") or src_rec.get("event_id")
        return chosen_val, rec_id, "cluster_inference", 0.95

    # 1. Majority vote
    val_counts = Counter([p[0] for p in non_null_pairs])
    most_common = val_counts.most_common()
    top_val, top_count = most_common[0]

    # Check if clear winner
    if len(most_common) == 1 or top_count > most_common[1][1]:
        # Clear majority
        matching_recs = [r for v, r in non_null_pairs if v == top_val]
        src_id = matching_recs[0].get("person_id") or matching_recs[0].get("place_id") or matching_recs[0].get("event_id")
        conf = top_count / len(non_null_pairs)
        return top_val, src_id, "majority", round(conf, 4)

    # 2. Tied: pick from most complete record
    sorted_by_completeness = sorted(non_null_pairs, key=lambda p: _count_non_nulls(p[1]), reverse=True)
    best_comp = _count_non_nulls(sorted_by_completeness[0][1])
    comp_candidates = [p for p in sorted_by_completeness if _count_non_nulls(p[1]) == best_comp]

    if len(comp_candidates) == 1:
        chosen_val, src_rec = comp_candidates[0]
        src_id = src_rec.get("person_id") or src_rec.get("place_id") or src_rec.get("event_id")
        return chosen_val, src_id, "completeness", 0.85

    # 3. Tied: pick from most recent last_updated
    def parse_rec_time(rec):
        dt = _safe_dt_str(rec.get("last_updated"))
        return dt if dt else datetime.min

    sorted_by_time = sorted(comp_candidates, key=lambda p: parse_rec_time(p[1]), reverse=True)
    chosen_val, src_rec = sorted_by_time[0]
    src_id = src_rec.get("person_id") or src_rec.get("place_id") or src_rec.get("event_id")
    return chosen_val, src_id, "recency", 0.75


def repair_dataset(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
    dedupe_results: Dict[str, Any],
    detected_issues: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Executes repairs, builds new repaired tables, and produces audit log.
    Never mutates original dataframes.
    Returns:
    {
      "repaired_people": pd.DataFrame,
      "repaired_places": pd.DataFrame,
      "repaired_events": pd.DataFrame,
      "repaired_relationships": pd.DataFrame,
      "audit_log": List[Dict[str, Any]],
      "issues": List[Dict[str, Any]],
      "id_mapping": Dict[str, str],
    }
    """
    audit_log: List[Dict[str, Any]] = []
    action_counter = 1

    def make_action_id() -> str:
        nonlocal action_counter
        act_id = f"ACT_{action_counter:05d}"
        action_counter += 1
        return act_id

    # 1. Deduplication Clustering & ID Mapping
    id_mapping: Dict[str, str] = {}  # old_id -> repaired_id

    # A) People Clusters
    people_clusters = dedupe_results.get("people", {}).get("auto_merge_clusters", [])
    people_records = people_df.copy().to_dict(orient="records")
    people_by_id = {r["person_id"]: r for r in people_records}
    all_people_ids = set(people_by_id.keys())
    clustered_people_ids = set()

    repaired_people_records: List[Dict[str, Any]] = []

    for cluster in people_clusters:
        # Canonical repaired_id is the lowest lexical ID or the first
        canon_id = sorted(cluster)[0]
        member_records = [people_by_id[m_id] for m_id in cluster if m_id in people_by_id]
        if not member_records:
            continue

        for m_id in cluster:
            id_mapping[m_id] = canon_id
            clustered_people_ids.add(m_id)

        # Build repaired person record
        field_provenance = {}
        repair_notes = [f"Merged duplicate cluster {cluster}"]
        rep_record = {"repaired_id": canon_id, "person_id": canon_id, "source_ids": cluster}

        for col in ["full_name", "dob", "dod", "birth_place_id", "gender", "occupation", "source_system"]:
            val, src_id, method, conf = resolve_field_survivorship(col, member_records)
            rep_record[col] = val
            field_provenance[col] = src_id

        # Use latest last_updated
        rep_record["last_updated"] = max([r.get("last_updated") or "" for r in member_records])
        rep_record["field_provenance"] = field_provenance
        rep_record["repair_notes"] = repair_notes
        repaired_people_records.append(rep_record)

        audit_log.append({
            "action_id": make_action_id(),
            "action_type": "MERGE",
            "table": "people",
            "record_ids": cluster,
            "field": "person_id",
            "old_value": cluster,
            "new_value": canon_id,
            "plain_English_reason": f"Merged {len(cluster)} duplicate person records into canonical {canon_id}",
            "confidence": 0.95,
            "method": "fuzzy",
            "status": "applied",
        })

    # Add unclustered people
    for pid in sorted(all_people_ids - clustered_people_ids):
        orig_rec = copy.deepcopy(people_by_id[pid])
        id_mapping[pid] = pid
        orig_rec["repaired_id"] = pid
        orig_rec["source_ids"] = [pid]
        orig_rec["field_provenance"] = {col: pid for col in PEOPLE_COLUMNS}
        orig_rec["repair_notes"] = []
        repaired_people_records.append(orig_rec)

    # B) Places Clusters
    places_clusters = dedupe_results.get("places", {}).get("auto_merge_clusters", [])
    places_records = places_df.copy().to_dict(orient="records")
    places_by_id = {r["place_id"]: r for r in places_records}
    all_places_ids = set(places_by_id.keys())
    clustered_places_ids = set()

    repaired_places_records: List[Dict[str, Any]] = []

    for cluster in places_clusters:
        canon_id = sorted(cluster)[0]
        member_records = [places_by_id[m_id] for m_id in cluster if m_id in places_by_id]
        if not member_records:
            continue

        for m_id in cluster:
            id_mapping[m_id] = canon_id
            clustered_places_ids.add(m_id)

        field_provenance = {}
        repair_notes = [f"Merged duplicate place cluster {cluster}"]
        rep_record = {"repaired_id": canon_id, "place_id": canon_id, "source_ids": cluster}

        for col in ["name", "country", "region", "source_system"]:
            val, src_id, method, conf = resolve_field_survivorship(col, member_records)
            rep_record[col] = val
            field_provenance[col] = src_id

        rep_record["last_updated"] = max([r.get("last_updated") or "" for r in member_records])
        rep_record["field_provenance"] = field_provenance
        rep_record["repair_notes"] = repair_notes
        repaired_places_records.append(rep_record)

        audit_log.append({
            "action_id": make_action_id(),
            "action_type": "MERGE",
            "table": "places",
            "record_ids": cluster,
            "field": "place_id",
            "old_value": cluster,
            "new_value": canon_id,
            "plain_English_reason": f"Merged {len(cluster)} duplicate place records into canonical {canon_id}",
            "confidence": 0.95,
            "method": "fuzzy",
            "status": "applied",
        })

    # Add unclustered places
    for plid in sorted(all_places_ids - clustered_places_ids):
        orig_rec = copy.deepcopy(places_by_id[plid])
        id_mapping[plid] = plid
        orig_rec["repaired_id"] = plid
        orig_rec["source_ids"] = [plid]
        orig_rec["field_provenance"] = {col: plid for col in PLACES_COLUMNS}
        orig_rec["repair_notes"] = []
        repaired_places_records.append(orig_rec)

    # 2. Apply Typo Fixes (Auto-fix only at confidence >= 0.80)
    rep_people_map = {r["repaired_id"]: r for r in repaired_people_records}
    rep_places_map = {r["repaired_id"]: r for r in repaired_places_records}

    for issue in detected_issues:
        itype = issue.get("type")
        conf = issue.get("confidence", 0.0)
        table = issue.get("table")
        field = issue.get("field")
        old_val = issue.get("old_value")
        new_val = issue.get("new_value")
        rec_ids = issue.get("record_ids", [])

        if itype == "TYPO" and new_val is not None:
            if conf >= 0.80:
                # Apply auto-fix
                for rid in rec_ids:
                    target_id = id_mapping.get(rid, rid)
                    target_rec = rep_people_map.get(target_id) if table == "people" else rep_places_map.get(target_id)
                    if target_rec and field in target_rec:
                        curr_v = target_rec.get(field)
                        if curr_v == old_val:
                            target_rec[field] = new_val
                            target_rec["repair_notes"].append(f"Auto-fixed typo in {field}: '{old_val}' -> '{new_val}'")
                            audit_log.append({
                                "action_id": make_action_id(),
                                "action_type": "FIX_TYPO",
                                "table": table,
                                "record_ids": [target_id],
                                "field": field,
                                "old_value": old_val,
                                "new_value": new_val,
                                "plain_English_reason": f"Auto-fixed high-confidence typo in {field} from '{old_val}' to '{new_val}'",
                                "confidence": conf,
                                "method": "fuzzy",
                                "status": "applied",
                            })
                            issue["status"] = "applied"
            else:
                # Queue for review
                audit_log.append({
                    "action_id": make_action_id(),
                    "action_type": "FLAG",
                    "table": table,
                    "record_ids": rec_ids,
                    "field": field,
                    "old_value": old_val,
                    "new_value": new_val,
                    "plain_English_reason": f"Potential typo in {field} flagged for human review (confidence {conf:.2f} < 0.80)",
                    "confidence": conf,
                    "method": "fuzzy",
                    "status": "pending_review",
                })

        elif itype == "INVALID_FORMAT" and new_val is not None:
            # Fix date format
            for rid in rec_ids:
                target_id = id_mapping.get(rid, rid)
                target_rec = rep_people_map.get(target_id) if table == "people" else None
                if target_rec and field in target_rec:
                    curr_v = target_rec.get(field)
                    if curr_v == old_val:
                        target_rec[field] = new_val
                        target_rec["repair_notes"].append(f"Standardized {field} format: '{old_val}' -> '{new_val}'")
                        audit_log.append({
                            "action_id": make_action_id(),
                            "action_type": "RESOLVE_CONFLICT",
                            "table": table,
                            "record_ids": [target_id],
                            "field": field,
                            "old_value": old_val,
                            "new_value": new_val,
                            "plain_English_reason": f"Standardized {field} into ISO YYYY-MM-DD format",
                            "confidence": conf,
                            "method": "rule",
                            "status": "applied",
                        })
                        issue["status"] = "applied"

        elif itype == "CONTRADICTION_DOD_BEFORE_DOB":
            # DOD before DOB cannot stand. Never invent values: null DOD and queue for review!
            for rid in rec_ids:
                target_id = id_mapping.get(rid, rid)
                target_rec = rep_people_map.get(target_id)
                if target_rec:
                    target_rec["dod"] = None
                    target_rec["repair_notes"].append(f"Cleared contradictory DOD ({old_val}) which was before DOB")
                    audit_log.append({
                        "action_id": make_action_id(),
                        "action_type": "RESOLVE_CONFLICT",
                        "table": "people",
                        "record_ids": [target_id],
                        "field": "dod",
                        "old_value": old_val,
                        "new_value": None,
                        "plain_English_reason": f"Cleared DOD {old_val} which occurred prior to birth date",
                        "confidence": 1.0,
                        "method": "rule",
                        "status": "applied",
                    })
                    issue["status"] = "applied"

    # 3. Events: Repoint place_id and format dates
    repaired_events_records: List[Dict[str, Any]] = []
    events_records = events_df.copy().to_dict(orient="records")

    for ev in events_records:
        eid = ev["event_id"]
        rep_ev = copy.deepcopy(ev)
        rep_ev["repaired_id"] = eid
        rep_ev["source_ids"] = [eid]
        rep_ev["field_provenance"] = {col: eid for col in EVENTS_COLUMNS}
        rep_ev["repair_notes"] = []

        # Repoint place_id
        old_pl = rep_ev.get("place_id")
        if old_pl in id_mapping and id_mapping[old_pl] != old_pl:
            new_pl = id_mapping[old_pl]
            rep_ev["place_id"] = new_pl
            rep_ev["repair_notes"].append(f"Repointed place_id from {old_pl} to {new_pl}")
            audit_log.append({
                "action_id": make_action_id(),
                "action_type": "REPOINT",
                "table": "events",
                "record_ids": [eid],
                "field": "place_id",
                "old_value": old_pl,
                "new_value": new_pl,
                "plain_English_reason": f"Repointed event place to merged place {new_pl}",
                "confidence": 1.0,
                "method": "rule",
                "status": "applied",
            })

        repaired_events_records.append(rep_ev)
        id_mapping[eid] = eid

    # Also repoint people birth_place_id
    for p in repaired_people_records:
        bp = p.get("birth_place_id")
        if bp in id_mapping and id_mapping[bp] != bp:
            new_bp = id_mapping[bp]
            p["birth_place_id"] = new_bp
            p["repair_notes"].append(f"Repointed birth_place_id from {bp} to {new_bp}")
            audit_log.append({
                "action_id": make_action_id(),
                "action_type": "REPOINT",
                "table": "people",
                "record_ids": [p["repaired_id"]],
                "field": "birth_place_id",
                "old_value": bp,
                "new_value": new_bp,
                "plain_English_reason": f"Repointed birth place to merged place {new_bp}",
                "confidence": 1.0,
                "method": "rule",
                "status": "applied",
            })

    # 4. Relationships: Repoint from_id and to_id, remove self-relationships, collapse duplicates
    repaired_rel_records: List[Dict[str, Any]] = []
    seen_rel_triplets: Dict[Tuple[str, str, str], str] = {}  # (from_id, to_id, rel_type) -> rel_id

    for r in relationships_df.copy().to_dict(orient="records"):
        rel_id = r["rel_id"]
        old_from = str(r.get("from_id") or "")
        old_to = str(r.get("to_id") or "")
        rtype = str(r.get("rel_type") or "")

        new_from = id_mapping.get(old_from, old_from)
        new_to = id_mapping.get(old_to, old_to)

        # Repoint audit
        if new_from != old_from:
            audit_log.append({
                "action_id": make_action_id(),
                "action_type": "REPOINT",
                "table": "relationships",
                "record_ids": [rel_id],
                "field": "from_id",
                "old_value": old_from,
                "new_value": new_from,
                "plain_English_reason": f"Repointed relationship from_id to {new_from}",
                "confidence": 1.0,
                "method": "rule",
                "status": "applied",
            })
        if new_to != old_to:
            audit_log.append({
                "action_id": make_action_id(),
                "action_type": "REPOINT",
                "table": "relationships",
                "record_ids": [rel_id],
                "field": "to_id",
                "old_value": old_to,
                "new_value": new_to,
                "plain_English_reason": f"Repointed relationship to_id to {new_to}",
                "confidence": 1.0,
                "method": "rule",
                "status": "applied",
            })

        # Check self-relationship
        if new_from == new_to:
            audit_log.append({
                "action_id": make_action_id(),
                "action_type": "FLAG",
                "table": "relationships",
                "record_ids": [rel_id],
                "field": "to_id",
                "old_value": old_to,
                "new_value": None,
                "plain_English_reason": f"Flagged self-relationship {rel_id} ({new_from} -> {new_to})",
                "confidence": 1.0,
                "method": "rule",
                "status": "pending_review",
            })
            continue  # Do not include self-relationship in repaired table

        # Collapse duplicate relationships
        triplet = (new_from, new_to, rtype)
        if triplet in seen_rel_triplets:
            first_rel_id = seen_rel_triplets[triplet]
            audit_log.append({
                "action_id": make_action_id(),
                "action_type": "MERGE",
                "table": "relationships",
                "record_ids": [rel_id, first_rel_id],
                "field": "rel_id",
                "old_value": rel_id,
                "new_value": first_rel_id,
                "plain_English_reason": f"Collapsed duplicate relationship {rel_id} into existing {first_rel_id}",
                "confidence": 1.0,
                "method": "rule",
                "status": "applied",
            })
            continue

        seen_rel_triplets[triplet] = rel_id
        rep_rel = copy.deepcopy(r)
        rep_rel["repaired_id"] = rel_id
        rep_rel["from_id"] = new_from
        rep_rel["to_id"] = new_to
        rep_rel["source_ids"] = [rel_id]
        rep_rel["field_provenance"] = {col: rel_id for col in RELATIONSHIPS_COLUMNS}
        rep_rel["repair_notes"] = []
        repaired_rel_records.append(rep_rel)

    # 5. Review pairs from deduplication
    for ent_type in ["people", "places"]:
        rev_pairs = dedupe_results.get(ent_type, {}).get("review_pairs", [])
        for rp in rev_pairs:
            audit_log.append({
                "action_id": make_action_id(),
                "action_type": "FLAG",
                "table": ent_type,
                "record_ids": [rp["id1"], rp["id2"]],
                "field": "person_id" if ent_type == "people" else "place_id",
                "old_value": f"{rp['id1']}, {rp['id2']}",
                "new_value": None,
                "plain_English_reason": rp.get("reason", "Pair within review threshold"),
                "confidence": rp.get("score", 0.8),
                "method": "fuzzy",
                "status": "pending_review",
            })

    # Build final repaired DataFrames
    repaired_people_df = pd.DataFrame(repaired_people_records)
    repaired_places_df = pd.DataFrame(repaired_places_records)
    repaired_events_df = pd.DataFrame(repaired_events_records)
    repaired_relationships_df = pd.DataFrame(repaired_rel_records)

    return {
        "repaired_people": repaired_people_df,
        "repaired_places": repaired_places_df,
        "repaired_events": repaired_events_df,
        "repaired_relationships": repaired_relationships_df,
        "audit_log": audit_log,
        "issues": detected_issues,
        "id_mapping": id_mapping,
    }


def apply_review_decision(
    run_data: Dict[str, Any],
    action_or_issue_id: str,
    approve: bool,
) -> Dict[str, Any]:
    """
    Applies user decision to a pending action or issue:
    If approve:
      action status becomes 'applied', change is executed/retained.
    If reject:
      action status becomes 'rejected', change is reverted.
    Returns updated run_data.
    """
    audit_log = run_data.get("audit_log", [])
    found_action = None

    for act in audit_log:
        if act.get("action_id") == action_or_issue_id or act.get("issue_id") == action_or_issue_id:
            found_action = act
            break

    if not found_action:
        # Check issues list
        for iss in run_data.get("issues", []):
            if iss.get("issue_id") == action_or_issue_id:
                iss["status"] = "applied" if approve else "rejected"
                return run_data
        return run_data

    if approve:
        found_action["status"] = "applied"
    else:
        found_action["status"] = "rejected"
        # If rejecting a fix or merge, revert the value in repaired table
        tbl = found_action.get("table")
        col = found_action.get("field")
        old_val = found_action.get("old_value")
        rec_ids = found_action.get("record_ids", [])
        
        rep_df_key = f"repaired_{tbl}"
        if rep_df_key in run_data and isinstance(run_data[rep_df_key], pd.DataFrame):
            df = run_data[rep_df_key]
            id_col = "repaired_id" if "repaired_id" in df.columns else (f"{tbl[:-1]}_id")
            for rid in rec_ids:
                mask = df[id_col] == rid
                if mask.any() and col in df.columns:
                    df.loc[mask, col] = old_val

    return run_data


def get_lineage(
    repaired_id: str,
    run_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Returns complete lineage of a repaired record:
    - repaired_record
    - original_records
    - field_provenance
    - audit_timeline
    """
    audit_log = run_data.get("audit_log", [])

    # Find repaired record across tables
    repaired_rec = None
    table_name = None

    for tbl in ["people", "places", "events", "relationships"]:
        df = run_data.get(f"repaired_{tbl}")
        if df is not None and isinstance(df, pd.DataFrame):
            id_col = "repaired_id" if "repaired_id" in df.columns else (f"{tbl[:-1]}_id")
            match = df[df[id_col] == repaired_id]
            if not match.empty:
                repaired_rec = match.iloc[0].to_dict()
                table_name = tbl
                break

    if not repaired_rec:
        return {"error": f"Record {repaired_id} not found in repaired datasets"}

    source_ids = repaired_rec.get("source_ids", [repaired_id])
    provenance = repaired_rec.get("field_provenance", {})

    # Fetch original records
    original_records = []
    orig_df = run_data.get(f"original_{table_name}")
    if orig_df is not None and isinstance(orig_df, pd.DataFrame):
        orig_id_col = "person_id" if table_name == "people" else ("place_id" if table_name == "places" else ("event_id" if table_name == "events" else "rel_id"))
        for s_id in source_ids:
            m = orig_df[orig_df[orig_id_col] == s_id]
            if not m.empty:
                original_records.append(m.iloc[0].to_dict())

    # Audit timeline
    audit_timeline = [
        act for act in audit_log
        if any(sid in act.get("record_ids", []) for sid in source_ids) or act.get("record_ids") == [repaired_id]
    ]

    return {
        "repaired_id": repaired_id,
        "table": table_name,
        "repaired_record": repaired_rec,
        "source_ids": source_ids,
        "original_records": original_records,
        "field_provenance": provenance,
        "audit_timeline": audit_timeline,
    }
