/**
 * API client library for Knowledge Repair Tool.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface QualityMetrics {
  overall_quality: number;
  completeness: number;
  uniqueness: number;
  consistency: number;
  validity: number;
  metrics?: {
    completeness_ratio: number;
    uniqueness_ratio: number;
    consistency_ratio: number;
    validity_ratio: number;
    total_records: number;
    contradiction_violations: number;
  };
}

export interface EvaluationMetrics {
  duplicate_metrics: {
    precision: number;
    recall: number;
    f1: number;
    true_positives: number;
    false_positives: number;
    false_negatives: number;
    ground_truth_duplicates: number;
    predicted_duplicates: number;
  };
  typo_accuracy: number;
  missing_fill_accuracy: number;
  contradiction_accuracy: number;
  harm_rate: number;
  harmful_actions_count: number;
  total_auto_applied_actions: number;
  summary: {
    duplicate_f1: number;
    typo_acc_pct: number;
    missing_fill_acc_pct: number;
    contradiction_acc_pct: number;
    harm_rate_pct: number;
  };
}

export interface RunSummary {
  run_id: string;
  created_at: string;
  quality_before: QualityMetrics;
  quality_after: QualityMetrics;
  quality_clean?: QualityMetrics | null;
  evaluation?: EvaluationMetrics | null;
  issues_by_type?: Record<string, number>;
  actions_by_type?: Record<string, number>;
  counts: {
    issues: number;
    audit_actions: number;
    repaired_people?: number;
    repaired_places?: number;
    repaired_events?: number;
    repaired_relationships?: number;
  };
  id_mapping?: Record<string, string>;
}

export interface IssueItem {
  issue_id: string;
  type: string;
  table: string;
  record_ids: string[];
  field?: string;
  old_value?: any;
  new_value?: any;
  reason: string;
  confidence: number;
  status: "applied" | "pending_review" | "rejected";
}

export interface AuditItem {
  action_id: string;
  action_type: string;
  table: string;
  record_ids: string[];
  field?: string;
  old_value?: any;
  new_value?: any;
  plain_English_reason: string;
  confidence: number;
  method: string;
  status: "applied" | "pending_review" | "rejected";
}

export interface LineageData {
  repaired_id: string;
  table: string;
  repaired_record: Record<string, any>;
  source_ids: string[];
  original_records: Record<string, any>[];
  field_provenance: Record<string, string>;
  audit_timeline: AuditItem[];
}

export async function fetchHealth(): Promise<{ status: string; storage_backend: string }> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Backend service unreachable");
  return res.json();
}

export async function fetchRuns(): Promise<RunSummary[]> {
  const res = await fetch(`${API_BASE}/api/runs`);
  if (!res.ok) throw new Error("Failed to fetch runs");
  return res.json();
}

export async function fetchRunSummary(runId: string): Promise<RunSummary> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/summary`);
  if (!res.ok) throw new Error(`Failed to fetch summary for run ${runId}`);
  return res.json();
}

export async function fetchIssues(runId: string, status?: string): Promise<IssueItem[]> {
  const url = status
    ? `${API_BASE}/api/runs/${runId}/issues?status=${encodeURIComponent(status)}`
    : `${API_BASE}/api/runs/${runId}/issues`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch issues for run ${runId}`);
  return res.json();
}

export async function fetchAudit(
  runId: string,
  actionType?: string,
  recordId?: string
): Promise<AuditItem[]> {
  const params = new URLSearchParams();
  if (actionType) params.append("action_type", actionType);
  if (recordId) params.append("record_id", recordId);
  const q = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/api/runs/${runId}/audit${q}`);
  if (!res.ok) throw new Error(`Failed to fetch audit log for run ${runId}`);
  return res.json();
}

export async function fetchLineage(runId: string, repairedId: string): Promise<LineageData> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/lineage/${repairedId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch lineage for ${repairedId}`);
  }
  return res.json();
}

export async function submitReview(
  runId: string,
  issueId: string,
  approve: boolean
): Promise<{ status: string; decision: string }> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issue_id: issueId, approve }),
  });
  if (!res.ok) throw new Error("Failed to submit review decision");
  return res.json();
}

export async function executeRepairSample(seed: number = 42): Promise<RunSummary> {
  const formData = new FormData();
  formData.append("use_sample", "true");
  formData.append("seed", seed.toString());

  const res = await fetch(`${API_BASE}/api/repair`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Repair execution failed");
  }
  return res.json();
}

export async function executeRepairCSVs(files: {
  people: File;
  places: File;
  events: File;
  relationships: File;
}): Promise<RunSummary> {
  const formData = new FormData();
  formData.append("people_file", files.people);
  formData.append("places_file", files.places);
  formData.append("events_file", files.events);
  formData.append("relationships_file", files.relationships);

  const res = await fetch(`${API_BASE}/api/repair`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "CSV upload repair execution failed");
  }
  return res.json();
}

export function getExportUrl(runId: string): string {
  return `${API_BASE}/api/runs/${runId}/export`;
}
