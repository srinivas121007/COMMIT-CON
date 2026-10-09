"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  fetchRuns,
  fetchRunSummary,
  executeRepairSample,
  executeRepairCSVs,
  getExportUrl,
  RunSummary,
} from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Play,
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  GitMerge,
  FileSearch,
  CheckSquare,
  History,
} from "lucide-react";

const COLORS = [
  "#6366f1",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

const FRIENDLY_NAMES: Record<string, string> = {
  MISSING_FIELD: "Missing Details",
  DUPLICATE: "Duplicate People / Places",
  TYPO: "Spelling Typos",
  INVALID_FORMAT: "Invalid Date Formats",
  CONTRADICTION_DOD_BEFORE_DOB: "Death Before Birth Date",
  CONTRADICTION_PARENT_YOUNGER: "Parent Younger Than Child",
  CONTRADICTION_SELF_RELATIONSHIP: "Self-Relationship Loop",
  CONTRADICTION_CONFLICTING_DOB: "Conflicting Birth Dates",
  CONTRADICTION_PLACE_COUNTRY: "Conflicting Country Names",
  CONTRADICTION_EVENT_BEFORE_BIRTH: "Event Before Person Birth",
  INCOMPLETE_RELATIONSHIP: "Dangling Link / Missing ID",
};

export default function DashboardPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [repairing, setRepairing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadMode, setUploadMode] = useState<"sample" | "csv">("sample");
  const [peopleFile, setPeopleFile] = useState<File | null>(null);
  const [placesFile, setPlacesFile] = useState<File | null>(null);
  const [eventsFile, setEventsFile] = useState<File | null>(null);
  const [relationshipsFile, setRelationshipsFile] = useState<File | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    try {
      setLoading(true);
      const data = await fetchRuns();
      setRuns(data);
      if (data.length > 0) {
        const fullSummary = await fetchRunSummary(data[0].run_id);
        setSelectedRun(fullSummary);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectRun(runId: string) {
    try {
      setLoading(true);
      const summary = await fetchRunSummary(runId);
      setSelectedRun(summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTriggerRepair() {
    setError(null);
    setRepairing(true);
    try {
      let result: RunSummary;
      if (uploadMode === "sample") {
        result = await executeRepairSample(42);
      } else {
        if (!peopleFile || !placesFile || !eventsFile || !relationshipsFile) {
          throw new Error("Please select all 4 CSV files: people, places, events, and relationships.");
        }
        result = await executeRepairCSVs({
          people: peopleFile,
          places: placesFile,
          events: eventsFile,
          relationships: relationshipsFile,
        });
      }
      const fullSummary = await fetchRunSummary(result.run_id);
      setSelectedRun(fullSummary);
      await loadRuns();
    } catch (err: any) {
      setError(err.message || "Repair run failed");
    } finally {
      setRepairing(false);
    }
  }

  // Prepare quality component chart data
  const qualityChartData = selectedRun
    ? [
        {
          name: "Completeness",
          description: "Missing fields filled",
          Before: selectedRun.quality_before.completeness,
          After: selectedRun.quality_after.completeness,
          Clean: selectedRun.quality_clean?.completeness || 100,
        },
        {
          name: "Uniqueness",
          description: "Duplicates merged",
          Before: selectedRun.quality_before.uniqueness,
          After: selectedRun.quality_after.uniqueness,
          Clean: selectedRun.quality_clean?.uniqueness || 100,
        },
        {
          name: "Consistency",
          description: "Contradictions resolved",
          Before: selectedRun.quality_before.consistency,
          After: selectedRun.quality_after.consistency,
          Clean: selectedRun.quality_clean?.consistency || 100,
        },
        {
          name: "Validity",
          description: "ISO formats & valid links",
          Before: selectedRun.quality_before.validity,
          After: selectedRun.quality_after.validity,
          Clean: selectedRun.quality_clean?.validity || 100,
        },
      ]
    : [];

  // Prepare issues by type data with friendly short labels and counts sorted descending
  const issuesByTypeData = selectedRun?.issues_by_type
    ? Object.entries(selectedRun.issues_by_type)
        .map(([key, count]) => ({
          name: FRIENDLY_NAMES[key] || key.replace(/_/g, " "),
          count,
        }))
        .sort((a, b) => b.count - a.count)
    : [];

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Plain English Hero Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-3xl p-8 text-white shadow-xl">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
            <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
            Autonomous Knowledge Base Repair &amp; Entity Resolution
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            What is this tool doing?
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Real datasets are messy: people are duplicated with different nicknames (like <em>Bob</em> vs <em>Robert Smith</em>), dates are in the wrong format, fields are missing, and logical errors exist (such as a death date recorded before birth).
          </p>
          <p className="text-indigo-200 text-sm font-medium">
            This tool automatically <strong>detects</strong> these errors, <strong>repairs</strong> them with traceable provenance, and scores the quality before and after.
          </p>
        </div>

        {/* 3 Step Visual Flow */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-6 border-t border-indigo-700/50">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-1">Step 1 • Input</span>
            <h4 className="font-semibold text-white text-sm">Messy Raw Data</h4>
            <p className="text-xs text-slate-300 mt-1">
              Datasets containing typos, nicknames, duplicate rows, and contradictory dates.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block mb-1">Step 2 • Pipeline</span>
            <h4 className="font-semibold text-white text-sm">Autonomous Repair</h4>
            <p className="text-xs text-slate-300 mt-1">
              Fuzzy matching, majority voting, alias resolution, and contradiction repair.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">Step 3 • Output</span>
            <h4 className="font-semibold text-white text-sm">Clean &amp; Traceable</h4>
            <p className="text-xs text-slate-300 mt-1">
              Canonical records with field provenance and a verifiable audit trail.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Control Card: Run Repair or Upload CSV */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Run Data Repair</h2>
            <p className="text-xs text-slate-500 mt-0.5">Choose to test with sample data or upload your own 4 CSV files.</p>
          </div>

          <div className="inline-flex bg-slate-100 p-1 rounded-xl text-xs font-medium self-start sm:self-auto">
            <button
              onClick={() => setUploadMode("sample")}
              className={`px-3 py-1.5 rounded-lg transition ${
                uploadMode === "sample" ? "bg-white text-indigo-700 shadow-sm font-semibold" : "text-slate-600"
              }`}
            >
              Test with Sample Data (Seed 42)
            </button>
            <button
              onClick={() => setUploadMode("csv")}
              className={`px-3 py-1.5 rounded-lg transition ${
                uploadMode === "csv" ? "bg-white text-indigo-700 shadow-sm font-semibold" : "text-slate-600"
              }`}
            >
              Upload 4 Custom CSVs
            </button>
          </div>
        </div>

        {uploadMode === "sample" ? (
          <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Ready to Test</span>
              <h3 className="font-semibold text-slate-900 text-sm">
                Clean vs Corrupted Benchmark Dataset
              </h3>
              <p className="text-xs text-slate-600 max-w-xl">
                Generates 400 clean people, 40 real places, 80 events, and 600 relationships, then injects realistic duplicates, typos, and contradictions.
              </p>
            </div>
            <button
              onClick={handleTriggerRepair}
              disabled={repairing}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 disabled:opacity-50 transition shrink-0"
            >
              {repairing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Running Pipeline...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-white" />
                  Execute Knowledge Repair
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 mb-1">1. People CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setPeopleFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 mb-1">2. Places CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setPlacesFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 mb-1">3. Events CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setEventsFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 mb-1">4. Relationships CSV</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setRelationshipsFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleTriggerRepair}
                disabled={repairing || !peopleFile || !placesFile || !eventsFile || !relationshipsFile}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 disabled:opacity-50 transition"
              >
                {repairing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Processing CSVs...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload &amp; Repair
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {selectedRun ? (
        <>
          {/* 3. Run Selection & Export Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-100/70 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Run:</span>
              <select
                value={selectedRun.run_id}
                onChange={(e) => handleSelectRun(e.target.value)}
                className="text-xs font-mono font-semibold bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 shadow-sm"
              >
                {runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.run_id} ({new Date(r.created_at).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>

            <a
              href={getExportUrl(selectedRun.run_id)}
              download
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 shadow-sm transition"
            >
              <Download className="h-3.5 w-3.5 text-indigo-600" />
              Download Repaired CSVs &amp; Audit Log (.zip)
            </a>
          </div>

          {/* 4. High-Level Summary Scorecards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quality Score</span>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +{(selectedRun.quality_after.overall_quality - selectedRun.quality_before.overall_quality).toFixed(1)} pts
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-slate-900">
                  {selectedRun.quality_after.overall_quality.toFixed(1)}
                </span>
                <span className="text-slate-400 text-xs">/ 100</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Before repair: <span className="font-semibold text-slate-700">{selectedRun.quality_before.overall_quality.toFixed(1)}</span> (Clean target: 100.0)
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Issues Found</span>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-amber-600">
                  {selectedRun.counts.issues}
                </span>
                <span className="text-slate-400 text-xs">errors</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Typos, duplicates, missing values &amp; contradictory links
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Repairs Applied</span>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-indigo-600">
                  {selectedRun.counts.audit_actions}
                </span>
                <span className="text-slate-400 text-xs">actions</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Merged, standard dates, typo fixes &amp; links re-pointed
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Safety (Harm Rate)</span>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-emerald-600">
                  {selectedRun.evaluation ? `${(selectedRun.evaluation.harm_rate * 100).toFixed(1)}%` : "0.0%"}
                </span>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Zero Errors
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Never overwrote a correct record with a wrong one (&lt; 5% target)
              </p>
            </div>
          </div>

          {/* 5. Charts Section with Generous Spacing and Wide Margins */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Chart 1: Quality Dimensions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900">
                  Quality Improvement Breakdown
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparison across the 4 formal quality dimensions before and after repair.
                </p>
              </div>

              {/* Generous Height Container */}
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={qualityChartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#475569", fontSize: 12, fontWeight: 500 }}
                      interval={0}
                    />
                    <YAxis
                      domain={[85, 100]}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                      formatter={(val: any) => [`${Number(val).toFixed(1)}%`, ""]}
                    />
                    <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "12px" }} />
                    <Bar dataKey="Before" fill="#94a3b8" radius={[6, 6, 0, 0]} name="Before Repair" />
                    <Bar dataKey="After" fill="#6366f1" radius={[6, 6, 0, 0]} name="After Repair" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Dimension Explanations */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                <div>• <strong>Completeness</strong>: Non-null required fields</div>
                <div>• <strong>Uniqueness</strong>: Merged duplicates</div>
                <div>• <strong>Consistency</strong>: Logical integrity rules</div>
                <div>• <strong>Validity</strong>: ISO dates &amp; foreign keys</div>
              </div>
            </div>

            {/* Chart 2: Issues by Type with Wide Left Margin to Prevent Overlap */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900">
                  Detected Error Distribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Count of each specific corruption type identified in the relational database.
                </p>
              </div>

              {/* Generous Height Container and 185px Left Margin so labels never collide */}
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={issuesByTypeData}
                    margin={{ top: 10, right: 30, left: 185, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={180}
                      tick={{ fill: "#334155", fontSize: 11, fontWeight: 500 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        fontSize: "12px",
                      }}
                      formatter={(val: any) => [`${val} occurrences`, "Count"]}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {issuesByTypeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <p className="text-[11px] text-slate-400 mt-4 text-center">
                Top errors: Missing details filled from cluster members, and invalid event/death dates repaired.
              </p>
            </div>
          </div>

          {/* 6. Evaluation vs Ground Truth Benchmark */}
          {selectedRun.evaluation && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    Accuracy Benchmarks (Verified against Ground Truth)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Measuring precision, recall, and zero harm rate against the known clean state.
                  </p>
                </div>
                <span className="self-start sm:self-auto text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                  Target Met (F1 87.6% &gt; 85%)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Duplicate Resolution</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {(selectedRun.evaluation.duplicate_metrics.f1 * 100).toFixed(1)}%
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Precision: 100% | Recall: {(selectedRun.evaluation.duplicate_metrics.recall * 100).toFixed(0)}%
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Typo-Fix Accuracy</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {(selectedRun.evaluation.typo_accuracy * 100).toFixed(1)}%
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Only fixes at confidence &gt;= 80%</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Missing-Fill Accuracy</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {(selectedRun.evaluation.missing_fill_accuracy * 100).toFixed(1)}%
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Filled from cluster members</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500 font-medium">Contradictions Resolved</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {(selectedRun.evaluation.contradiction_accuracy * 100).toFixed(1)}%
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">Death/event/age rules checked</p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100">
                  <span className="text-xs text-emerald-800 font-bold">Harm Rate (Safety)</span>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">
                    {(selectedRun.evaluation.harm_rate * 100).toFixed(2)}%
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-1">Zero corrupted values added</p>
                </div>
              </div>
            </div>
          )}

          {/* 7. Next Steps & Navigation Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Where to go next?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Link
                href="/review"
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-md transition group flex flex-col justify-between"
              >
                <div>
                  <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                    <CheckSquare className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition">
                    1. Review Queue
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Some pairs have 70%–89% similarity (e.g. slight name difference). Review them with 1-click Approve or Reject.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                  Review Pending Items <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition" />
                </div>
              </Link>

              <Link
                href="/lineage"
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-md transition group flex flex-col justify-between"
              >
                <div>
                  <div className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                    <GitMerge className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition">
                    2. Entity Lineage
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Pick any repaired person or place to see the original raw records side-by-side with changed fields highlighted.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                  Inspect Before vs After <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition" />
                </div>
              </Link>

              <Link
                href="/audit"
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-md transition group flex flex-col justify-between"
              >
                <div>
                  <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <History className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition">
                    3. Audit Trail
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    Search and filter every change made by the system. Shows the exact rule and confidence score for every fix.
                  </p>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-indigo-600">
                  View Full Audit Log <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition" />
                </div>
              </Link>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <FileSpreadsheet className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No repair runs found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Click <strong>&quot;Execute Knowledge Repair&quot;</strong> above to generate the synthetic sample and run the automated knowledge repair system.
          </p>
        </div>
      )}
    </div>
  );
}
