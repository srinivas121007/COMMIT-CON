"use client";

import React, { useState, useEffect } from "react";
import { fetchRuns, fetchAudit, RunSummary, AuditItem } from "@/lib/api";
import { Search, History, Filter, Download, CheckCircle, Clock, XCircle, RefreshCw } from "lucide-react";

export default function AuditPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [auditLog, setAuditLog] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    loadInitialRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      loadAudit(selectedRunId);
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

  async function loadAudit(runId: string) {
    try {
      setLoading(true);
      const data = await fetchAudit(runId);
      setAuditLog(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredLog = auditLog.filter((item) => {
    if (actionTypeFilter !== "all" && item.action_type !== actionTypeFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = item.action_id.toLowerCase().includes(q);
      const matchRecords = item.record_ids.some((r) => r.toLowerCase().includes(q));
      const matchReason = item.plain_English_reason.toLowerCase().includes(q);
      const matchField = item.field?.toLowerCase().includes(q) || false;
      return matchId || matchRecords || matchReason || matchField;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Trail &amp; Provenance Log</h1>
            <span className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {auditLog.length} Actions Recorded
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            Complete, immutable audit log of all automatic resolutions, survivorship votes, and human overrides.
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

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by action ID, record ID, or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span>Action Type:</span>
          <select
            value={actionTypeFilter}
            onChange={(e) => setActionTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700"
          >
            <option value="all">All Actions</option>
            <option value="MERGE">MERGE</option>
            <option value="FIX_TYPO">FIX_TYPO</option>
            <option value="FILL_MISSING">FILL_MISSING</option>
            <option value="RESOLVE_CONFLICT">RESOLVE_CONFLICT</option>
            <option value="REPOINT">REPOINT</option>
            <option value="FLAG">FLAG</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span>Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="applied">Applied</option>
            <option value="pending_review">Pending Review</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
            Loading audit log...
          </div>
        ) : filteredLog.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No audit actions found matching query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Action ID</th>
                  <th className="px-5 py-3.5">Type &amp; Method</th>
                  <th className="px-5 py-3.5">Table &amp; Records</th>
                  <th className="px-5 py-3.5">Details (Old &rarr; New)</th>
                  <th className="px-5 py-3.5">Plain Reason</th>
                  <th className="px-5 py-3.5">Confidence</th>
                  <th className="px-5 py-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLog.map((act) => (
                  <tr key={act.action_id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-4 align-top font-mono text-xs font-semibold text-slate-600">
                      {act.action_id}
                    </td>

                    <td className="px-5 py-4 align-top">
                      <span className="font-semibold text-slate-900 block text-xs">{act.action_type}</span>
                      <span className="text-[10px] text-slate-400 capitalize">{act.method}</span>
                    </td>

                    <td className="px-5 py-4 align-top">
                      <div className="text-xs font-semibold text-slate-900 capitalize">{act.table}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[140px]">
                        {act.record_ids.join(", ")}
                      </div>
                    </td>

                    <td className="px-5 py-4 align-top max-w-xs text-xs">
                      {act.field && <div className="text-slate-400 font-medium text-[11px]">{act.field}:</div>}
                      <div className="truncate">
                        <span className="text-slate-400 line-through mr-1.5">{String(act.old_value ?? "none")}</span>
                        &rarr; <span className="text-indigo-600 font-semibold">{String(act.new_value ?? "none")}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4 align-top text-xs text-slate-600 max-w-sm">
                      {act.plain_English_reason}
                    </td>

                    <td className="px-5 py-4 align-top text-xs font-semibold">
                      {(act.confidence * 100).toFixed(0)}%
                    </td>

                    <td className="px-5 py-4 align-top">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          act.status === "applied"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : act.status === "pending_review"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {act.status === "applied" && <CheckCircle className="h-3 w-3" />}
                        {act.status === "pending_review" && <Clock className="h-3 w-3" />}
                        {act.status === "rejected" && <XCircle className="h-3 w-3" />}
                        {act.status.replace("_", " ")}
                      </span>
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
