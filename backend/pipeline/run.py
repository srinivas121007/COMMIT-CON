"""
Pipeline runner and CLI entrypoint.
Orchestrates:
1. Normalization
2. Deduplication & entity resolution
3. Anomaly and contradiction detection
4. Repair and survivorship
5. Quality assessment (before and after)
6. Ground truth evaluation (P/R/F1, accuracy, harm rate)
CLI usage: python -m pipeline.run --sample
"""

import argparse
import json
import sys
from pathlib import Path
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple
import pandas as pd

# Ensure project root is in sys.path
_root = str(Path(__file__).resolve().parent.parent.parent)
if _root not in sys.path:
    sys.path.insert(0, _root)

from backend.pipeline.generator import generate_clean_dataset
from backend.pipeline.corruptor import inject_corruption
from backend.pipeline.normalize import normalize_datasets
from backend.pipeline.dedupe import deduplicate_dataset
from backend.pipeline.detectors import run_all_detectors
from backend.pipeline.repair import repair_dataset
from backend.pipeline.quality import calculate_dataset_quality
from backend.pipeline.evaluate import evaluate_vs_ground_truth


def execute_pipeline(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
    clean_data: Optional[Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]] = None,
    ground_truth: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Executes the end-to-end knowledge repair pipeline.
    Never mutates input DataFrames (copies throughout).
    """
    now = datetime.now(timezone.utc)
    run_id = f"run_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    created_at = now.isoformat()

    # Step 1: Quality Before
    quality_before = calculate_dataset_quality(
        people_df.copy(),
        places_df.copy(),
        events_df.copy(),
        relationships_df.copy(),
    )

    # Step 2: Normalization
    norm_p, norm_pl, norm_e, norm_r = normalize_datasets(
        people_df.copy(),
        places_df.copy(),
        events_df.copy(),
        relationships_df.copy(),
    )

    # Step 3: Deduplication
    dedupe_res = deduplicate_dataset(norm_p, norm_pl)

    # Step 4: Detectors
    p_clusters = dedupe_res.get("people", {}).get("auto_merge_clusters", [])
    pl_clusters = dedupe_res.get("places", {}).get("auto_merge_clusters", [])
    detected_issues = run_all_detectors(
        norm_p, norm_pl, norm_e, norm_r,
        people_clusters=p_clusters,
        places_clusters=pl_clusters,
    )

    # Step 5: Repair
    repair_res = repair_dataset(
        norm_p, norm_pl, norm_e, norm_r,
        dedupe_results=dedupe_res,
        detected_issues=detected_issues,
    )

    # Step 6: Quality After
    quality_after = calculate_dataset_quality(
        repair_res["repaired_people"].copy(),
        repair_res["repaired_places"].copy(),
        repair_res["repaired_events"].copy(),
        repair_res["repaired_relationships"].copy(),
    )

    # Clean Quality (if clean data provided)
    quality_clean = None
    if clean_data is not None:
        quality_clean = calculate_dataset_quality(
            clean_data[0].copy(),
            clean_data[1].copy(),
            clean_data[2].copy(),
            clean_data[3].copy(),
        )

    # Step 7: Evaluation vs Ground Truth (if available)
    evaluation = None
    if clean_data is not None and ground_truth is not None:
        evaluation = evaluate_vs_ground_truth(
            clean_data,
            (people_df, places_df, events_df, relationships_df),
            repair_res,
            ground_truth,
        )

    return {
        "run_id": run_id,
        "created_at": created_at,
        "quality_before": quality_before,
        "quality_after": quality_after,
        "quality_clean": quality_clean,
        "evaluation": evaluation,
        "issues": repair_res["issues"],
        "audit_log": repair_res["audit_log"],
        "repaired_people": repair_res["repaired_people"],
        "repaired_places": repair_res["repaired_places"],
        "repaired_events": repair_res["repaired_events"],
        "repaired_relationships": repair_res["repaired_relationships"],
        "original_people": people_df.copy(),
        "original_places": places_df.copy(),
        "original_events": events_df.copy(),
        "original_relationships": relationships_df.copy(),
        "id_mapping": repair_res["id_mapping"],
    }


def main():
    parser = argparse.ArgumentParser(description="Knowledge Repair Tool Pipeline")
    parser.add_argument("--sample", action="store_true", help="Generate sample dataset and run repair pipeline")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default 42)")
    args = parser.parse_args()

    if args.sample:
        print("=" * 70)
        print("  KNOWLEDGE REPAIR TOOL — END-TO-END PIPELINE EXECUTION")
        print("=" * 70)
        print(f"Generating clean synthetic dataset (seed={args.seed})...")
        clean_people, clean_places, clean_events, clean_relationships = generate_clean_dataset(seed=args.seed)
        print(f"  Clean counts: {len(clean_people)} people, {len(clean_places)} places, {len(clean_events)} events, {len(clean_relationships)} relationships")

        print("Injecting realistic corruption...")
        c_people, c_places, c_events, c_relationships, ground_truth = inject_corruption(
            clean_people, clean_places, clean_events, clean_relationships, seed=args.seed
        )
        print(f"  Corrupted counts: {len(c_people)} people, {len(c_places)} places, {len(c_events)} events, {len(c_relationships)} relationships")
        print(f"  Injected issues: {len(ground_truth['injected_issues'])}")

        print("\nExecuting repair pipeline...")
        result = execute_pipeline(
            c_people, c_places, c_events, c_relationships,
            clean_data=(clean_people, clean_places, clean_events, clean_relationships),
            ground_truth=ground_truth,
        )

        qb = result["quality_before"]
        qa = result["quality_after"]
        qc = result["quality_clean"]
        ev = result["evaluation"]

        print("\n" + "=" * 70)
        print("  QUALITY METRICS SUMMARY")
        print("=" * 70)
        print(f"  {'Metric':<20} | {'Clean Data':<12} | {'Before Repair':<15} | {'After Repair':<12}")
        print("-" * 70)
        print(f"  {'Overall Quality':<20} | {qc['overall_quality']:<12.1f} | {qb['overall_quality']:<15.1f} | {qa['overall_quality']:<12.1f}")
        print(f"  {'Completeness':<20} | {qc['completeness']:<12.1f}% | {qb['completeness']:<15.1f}% | {qa['completeness']:<12.1f}%")
        print(f"  {'Uniqueness':<20} | {qc['uniqueness']:<12.1f}% | {qb['uniqueness']:<15.1f}% | {qa['uniqueness']:<12.1f}%")
        print(f"  {'Consistency':<20} | {qc['consistency']:<12.1f}% | {qb['consistency']:<15.1f}% | {qa['consistency']:<12.1f}%")
        print(f"  {'Validity':<20} | {qc['validity']:<12.1f}% | {qb['validity']:<15.1f}% | {qa['validity']:<12.1f}%")

        if ev:
            dm = ev["duplicate_metrics"]
            print("\n" + "=" * 70)
            print("  GROUND TRUTH EVALUATION METRICS")
            print("=" * 70)
            print(f"  Duplicate Resolution:")
            print(f"    - Precision:              {dm['precision']:.4f}")
            print(f"    - Recall:                 {dm['recall']:.4f}")
            print(f"    - F1 Score:               {dm['f1']:.4f}")
            print(f"    - True Positives:         {dm['true_positives']}")
            print(f"    - False Positives:        {dm['false_positives']}")
            print(f"    - False Negatives:        {dm['false_negatives']}")
            print(f"  Typo Fix Accuracy:          {ev['typo_accuracy'] * 100:.2f}%")
            print(f"  Missing Fill Accuracy:      {ev['missing_fill_accuracy'] * 100:.2f}%")
            print(f"  Contradiction Accuracy:     {ev['contradiction_accuracy'] * 100:.2f}%")
            print(f"  Harm Rate:                  {ev['harm_rate'] * 100:.2f}% (Target: < 5%)")

        print("\n" + "=" * 70)
        print("  REPAIR AUDIT ACTIONS")
        print("=" * 70)
        action_counts = {}
        for act in result["audit_log"]:
            t = act.get("action_type")
            action_counts[t] = action_counts.get(t, 0) + 1
        for act_type, cnt in sorted(action_counts.items()):
            print(f"  - {act_type:<20}: {cnt} actions")
        print(f"  Total Audit Actions:        {len(result['audit_log'])}")
        print(f"  Total Detected Issues:      {len(result['issues'])}")
        print("=" * 70)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
