"""
Unit tests for quality calculation and ground truth evaluation.
"""

import pandas as pd
import pytest

from backend.pipeline.generator import generate_clean_dataset
from backend.pipeline.corruptor import inject_corruption
from backend.pipeline.quality import calculate_dataset_quality
from backend.pipeline.evaluate import evaluate_vs_ground_truth
from backend.pipeline.run import execute_pipeline


def test_quality_clean_data_upper_bound():
    """Clean data quality should be near 100% and strictly greater than corrupted data."""
    cp, cpl, ce, cr = generate_clean_dataset(seed=42)
    p, pl, e, r, gt = inject_corruption(cp, cpl, ce, cr, seed=42)

    clean_q = calculate_dataset_quality(cp, cpl, ce, cr)
    corrupted_q = calculate_dataset_quality(p, pl, e, r)

    assert clean_q["overall_quality"] >= 99.0
    assert clean_q["completeness"] >= 99.0
    assert clean_q["consistency"] >= 99.0
    assert clean_q["validity"] >= 99.0

    assert clean_q["overall_quality"] > corrupted_q["overall_quality"]


def test_evaluation_metrics_and_harm_rate():
    """Verify evaluation metrics: duplicate F1, accuracies, harm rate < 5%."""
    cp, cpl, ce, cr = generate_clean_dataset(seed=42)
    p, pl, e, r, gt = inject_corruption(cp, cpl, ce, cr, seed=42)

    result = execute_pipeline(p, pl, e, r, clean_data=(cp, cpl, ce, cr), ground_truth=gt)
    ev = result["evaluation"]

    assert ev is not None
    assert "duplicate_metrics" in ev
    dm = ev["duplicate_metrics"]
    assert dm["precision"] >= 0.90
    assert dm["f1"] >= 0.85, f"Expected F1 >= 0.85, got {dm['f1']}"
    assert ev["harm_rate"] <= 0.05, f"Expected harm rate <= 0.05, got {ev['harm_rate']}"
