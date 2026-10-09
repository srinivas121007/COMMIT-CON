"""
Evaluation module.
Computes evaluation metrics against ground truth:
- Duplicate Precision, Recall, F1 (pairwise)
- Typo-fix Accuracy
- Missing-fill Accuracy
- Contradiction Resolution Accuracy
- Harm Rate: (auto-applied repairs that turned a correct value into a wrong one) / all auto-applied repairs
Does not import FastAPI or Firebase.
"""

from collections import defaultdict
from itertools import combinations
from typing import Dict, List, Tuple, Any, Set
import pandas as pd


def evaluate_vs_ground_truth(
    clean_datasets: Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame],
    corrupted_datasets: Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame],
    repair_result: Dict[str, Any],
    ground_truth: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Evaluates repair results against ground truth.
    Returns:
    {
      "duplicate_metrics": {
        "precision": float,
        "recall": float,
        "f1": float,
        "true_positives": int,
        "false_positives": int,
        "false_negatives": int,
      },
      "typo_accuracy": float,
      "missing_fill_accuracy": float,
      "contradiction_accuracy": float,
      "harm_rate": float,
      "summary": Dict[str, Any],
    }
    """
    entity_map = ground_truth.get("entity_map", {})
    injected_issues = ground_truth.get("injected_issues", [])
    id_mapping = repair_result.get("id_mapping", {})
    audit_log = repair_result.get("audit_log", [])

    # 1. Pairwise Duplicate Evaluation (People & Places)
    # Build ground truth duplicate pairs:
    gt_clusters = defaultdict(set)
    for c_id, canon_id in entity_map.items():
        gt_clusters[canon_id].add(c_id)

    gt_dup_pairs: Set[Tuple[str, str]] = set()
    for canon_id, members in gt_clusters.items():
        if len(members) > 1:
            for id1, id2 in combinations(sorted(members), 2):
                gt_dup_pairs.add((id1, id2))

    # Build predicted duplicate pairs from id_mapping:
    pred_clusters = defaultdict(set)
    for c_id, rep_id in id_mapping.items():
        pred_clusters[rep_id].add(c_id)

    pred_dup_pairs: Set[Tuple[str, str]] = set()
    for rep_id, members in pred_clusters.items():
        if len(members) > 1:
            for id1, id2 in combinations(sorted(members), 2):
                pred_dup_pairs.add((id1, id2))

    tp = len(gt_dup_pairs.intersection(pred_dup_pairs))
    fp = len(pred_dup_pairs - gt_dup_pairs)
    fn = len(gt_dup_pairs - pred_dup_pairs)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    # 2. Typo-fix Accuracy
    injected_typos = [iss for iss in injected_issues if iss.get("type") == "TYPO"]
    correct_typo_fixes = 0
    auto_fixed_typos = 0

    # Check applied actions in audit_log
    applied_typo_actions = [a for a in audit_log if a.get("action_type") == "FIX_TYPO" and a.get("status") == "applied"]
    for act in applied_typo_actions:
        auto_fixed_typos += 1
        rec_id = act.get("record_ids", [None])[0]
        field = act.get("field")
        new_val = act.get("new_value")
        # Match with injected issue
        matching_injected = [
            i for i in injected_typos
            if i.get("record_id") == rec_id and i.get("field") == field
        ]
        if matching_injected:
            orig_val = matching_injected[0].get("original_value")
            if str(new_val).strip().lower() == str(orig_val).strip().lower():
                correct_typo_fixes += 1

    typo_accuracy = (correct_typo_fixes / len(injected_typos)) if injected_typos else 1.0

    # 3. Missing-fill Accuracy
    injected_missing = [iss for iss in injected_issues if iss.get("type") == "MISSING_FIELD"]
    correct_missing_fills = 0

    clean_people, clean_places, clean_events, clean_relationships = clean_datasets
    rep_people = repair_result.get("repaired_people")
    rep_places = repair_result.get("repaired_places")

    # Map canon IDs to clean records
    clean_people_map = {r["person_id"]: r for r in clean_people.to_dict(orient="records")}
    rep_people_map = {r["repaired_id"]: r for r in rep_people.to_dict(orient="records")} if rep_people is not None else {}

    for miss in injected_missing:
        rec_id = miss.get("record_id")
        tbl = miss.get("table")
        field = miss.get("field")
        orig_val = miss.get("original_value")

        rep_id = id_mapping.get(rec_id, rec_id)
        if tbl == "people" and rep_id in rep_people_map:
            rep_val = rep_people_map[rep_id].get(field)
            if rep_val is not None and str(rep_val).strip().lower() == str(orig_val).strip().lower():
                correct_missing_fills += 1

    missing_fill_accuracy = (correct_missing_fills / len(injected_missing)) if injected_missing else 1.0

    # 4. Contradiction Resolution Accuracy
    injected_contradictions = [
        iss for iss in injected_issues
        if str(iss.get("type", "")).startswith("CONTRADICTION")
    ]
    resolved_contradictions = 0
    resolved_issue_types = {
        "CONTRADICTION_DOD_BEFORE_DOB",
        "CONTRADICTION_PARENT_YOUNGER",
        "CONTRADICTION_SELF_RELATIONSHIP",
        "CONTRADICTION_CONFLICTING_DOB",
        "CONTRADICTION_PLACE_COUNTRY",
        "CONTRADICTION_EVENT_BEFORE_BIRTH",
    }

    # An injected contradiction is resolved if it was either fixed or flagged for review
    for c_iss in injected_contradictions:
        c_rec = c_iss.get("record_id")
        # Check if audit_log has an entry mentioning this record
        handled = any(
            c_rec in act.get("record_ids", []) or act.get("old_value") == c_iss.get("corrupted_value")
            for act in audit_log
        )
        if handled:
            resolved_contradictions += 1

    contradiction_accuracy = (resolved_contradictions / len(injected_contradictions)) if injected_contradictions else 1.0

    # 5. Harm Rate
    # Auto-applied repairs that turned a correct value into a wrong one / all auto-applied repairs
    auto_applied_actions = [a for a in audit_log if a.get("status") == "applied"]
    harmful_actions = 0

    # Lookup clean ground truth values
    clean_table_maps = {
        "people": {r["person_id"]: r for r in clean_people.to_dict(orient="records")},
        "places": {r["place_id"]: r for r in clean_places.to_dict(orient="records")},
        "events": {r["event_id"]: r for r in clean_events.to_dict(orient="records")},
        "relationships": {r["rel_id"]: r for r in clean_relationships.to_dict(orient="records")},
    }

    for act in auto_applied_actions:
        tbl = act.get("table")
        field = act.get("field")
        old_val = act.get("old_value")
        new_val = act.get("new_value")
        rec_ids = act.get("record_ids", [])

        if act.get("action_type") in ("FIX_TYPO", "RESOLVE_CONFLICT", "FILL_MISSING"):
            if tbl in clean_table_maps and field:
                for rid in rec_ids:
                    true_id = entity_map.get(rid, rid)
                    clean_rec = clean_table_maps[tbl].get(true_id)
                    if clean_rec and field in clean_rec:
                        true_clean_val = clean_rec[field]
                        # If old_val was already correct and new_val is different and wrong:
                        if old_val == true_clean_val and new_val != true_clean_val:
                            harmful_actions += 1
                            break

        elif act.get("action_type") == "MERGE" and tbl in ("people", "places"):
            # Merging entities that are not actually the same canonical entity is harmful
            if len(rec_ids) > 1:
                canonical_targets = {entity_map.get(rid, rid) for rid in rec_ids}
                if len(canonical_targets) > 1:
                    harmful_actions += 1

    harm_rate = (harmful_actions / len(auto_applied_actions)) if auto_applied_actions else 0.0

    return {
        "duplicate_metrics": {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "ground_truth_duplicates": len(gt_dup_pairs),
            "predicted_duplicates": len(pred_dup_pairs),
        },
        "typo_accuracy": round(typo_accuracy, 4),
        "missing_fill_accuracy": round(missing_fill_accuracy, 4),
        "contradiction_accuracy": round(contradiction_accuracy, 4),
        "harm_rate": round(harm_rate, 4),
        "harmful_actions_count": harmful_actions,
        "total_auto_applied_actions": len(auto_applied_actions),
        "summary": {
            "duplicate_f1": round(f1, 4),
            "typo_acc_pct": round(typo_accuracy * 100, 2),
            "missing_fill_acc_pct": round(missing_fill_accuracy * 100, 2),
            "contradiction_acc_pct": round(contradiction_accuracy * 100, 2),
            "harm_rate_pct": round(harm_rate * 100, 2),
        },
    }
