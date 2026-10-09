"use client";

import React, { useState, useEffect } from "react";
import { fetchRuns, fetchIssues, fetchAudit, submitReview, RunSummary, AuditItem } from "@/lib/api";
import { Check, X, ShieldAlert, CheckCircle2, Clock, Filter, AlertCircle, RefreshCw } from "lucide-react";

export default function ReviewPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [pendingItems, setPendingItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [feedback, setFeedback] = useState<{ id: string; decision: "applied" | "rejected" } | null>(null);

  useEffect(() => {
    loadInitialRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      loadPendingItems(selectedRunId);
    }
  }, [selectedRunId]);

  async function loadInitialRuns() {
    try {
      setLoading(true);
      const data = await fetchRuns();
      setRuns(data);
      if (data.length > 0) {
        setSelectedRunId(data[0].run_id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingItems(runId: string) {
    try {
      setLoading(true);
      const audit = await fetchAudit(runId);
      // Filter pending review items
      const pending = audit.filter((a) => a.status === "pending_review");
      setPendingItems(pending);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(item: AuditItem, approve: boolean) {
    setProcessingId(item.action_id);
    try {
      await submitReview(selectedRunId, item.action_id, approve);
      setFeedback({ id: item.action_id, decision: approve ? "applied" : "rejected" });
      // Remove or update status locally
      setPendingItems((prev) => prev.filter((p) => p.action_id !== item.action_id));
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      alert("Error submitting review: " + err.message);
    } finally {
      setProcessingId(null);
    }
  }

  const filteredItems = pendingItems.filter((item) => {
    if (tableFilter !== "all" && item.table !== tableFilter) return false;
    if (actionFilter !== "all" && item.action_type !== actionFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Human-in-the-Loop Review Queue</h1>
            <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {pendingItems.length} Pending
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Carefully review borderline merge candidates, low-confidence typos, and detected contradictions.
          </p>
        </div>

        {runs.length > 0 && (
          <select
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                Run: {r.run_id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
        <span className="flex items-center gap-1.5 text-slate-400 uppercase tracking-wider font-semibold">
          <Filter className="h-3.5 w-3.5" /> Filters:
        </span>

        <div className="flex items-center gap-2">
          <span>Table:</span>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700"
          >
            <option value="all">All Tables</option>
            <option value="people">People</option>
            <option value="places">Places</option>
            <option value="events">Events</option>
            <option value="relationships">Relationships</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span>Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700"
          >
            <option value="all">All Actions</option>
            <option value="FLAG">FLAG (Review Band)</option>
            <option value="FIX_TYPO">FIX_TYPO</option>
            <option value="MERGE">MERGE</option>
            <option value="RESOLVE_CONFLICT">RESOLVE_CONFLICT</option>
          </select>
        </div>

        <button
          onClick={() => selectedRunId && loadPendingItems(selectedRunId)}
          className="ml-auto inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {feedback && (
        <div className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
          feedback.decision === "applied" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-slate-100 text-slate-800 border border-slate-200"
        }`}>
          <CheckCircle2 className="h-4 w-4" />
          Decision recorded: action <strong>{feedback.id}</strong> was <strong>{feedback.decision}</strong>.
        </div>
      )}

      {/* Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
            Loading review items...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Review queue is clear!</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No pending review decisions for the selected filters. All repairs and merges have been verified.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Action / ID</th>
                  <th className="px-5 py-3.5">Table &amp; Entity</th>
                  <th className="px-5 py-3.5">Values (Old &rarr; Proposed)</th>
                  <th className="px-5 py-3.5">Plain Reason</th>
                  <th className="px-5 py-3.5">Confidence</th>
                  <th className="px-5 py-3.5 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.action_id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-4 align-top font-mono text-xs font-semibold text-slate-600">
                      <div>{item.action_id}</div>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                        {item.action_type}
                      </span>
                    </td>

                    <td className="px-5 py-4 align-top">
                      <div className="font-semibold text-slate-900 capitalize">{item.table}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {item.record_ids.join(", ")}
                      </div>
                    </td>

                    <td className="px-5 py-4 align-top max-w-xs">
                      {item.field && <div className="text-xs text-slate-400 font-medium">{item.field}:</div>}
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="text-rose-600 line-through bg-rose-50 px-2 py-0.5 rounded border border-rose-100 w-fit">
                          {String(item.old_value ?? "null")}
                        </span>
                        {item.new_value !== undefined && item.new_value !== null ? (
                          <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 w-fit">
                            &rarr; {String(item.new_value)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">No replacement</span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 align-top text-xs text-slate-600 max-w-sm">
                      {item.plain_English_reason}
                    </td>

                    <td className="px-5 py-4 align-top text-xs font-semibold">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          item.confidence >= 0.8
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {(item.confidence * 100).toFixed(0)}%
                      </span>
                    </td>

                    <td className="px-5 py-4 align-top text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleDecision(item, true)}
                        disabled={processingId === item.action_id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50 transition"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleDecision(item, false)}
                        disabled={processingId === item.action_id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
