"use client";

import React, { useState, useEffect } from "react";
import { fetchRuns, fetchRunSummary, fetchLineage, RunSummary, LineageData } from "@/lib/api";
import { Search, GitCommit, ArrowRight, ShieldCheck, History, AlertCircle, RefreshCw } from "lucide-react";

export default function LineagePage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [lineage, setLineage] = useState<LineageData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      loadCandidates(selectedRunId);
    }
  }, [selectedRunId]);

  useEffect(() => {
    if (selectedRunId && selectedId) {
      loadRecordLineage(selectedRunId, selectedId);
    }
  }, [selectedId]);

  async function loadInitialRuns() {
    try {
      setLoading(true);
      const data = await fetchRuns();
      setRuns(data);
      if (data.length > 0) {
        setSelectedRunId(data[0].run_id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCandidates(runId: string) {
    try {
      setLoading(true);
      const summary = await fetchRunSummary(runId);
      if (summary.id_mapping) {
        const uniqueRepaired = Array.from(new Set(Object.values(summary.id_mapping)));
        setCandidateIds(uniqueRepaired);
        if (uniqueRepaired.length > 0) {
          setSelectedId(uniqueRepaired[0]);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecordLineage(runId: string, repId: string) {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchLineage(runId, repId);
      setLineage(data);
    } catch (err: any) {
      setError(err.message);
      setLineage(null);
    } finally {
      setLoading(false);
    }
  }

  const repairedKeys = lineage
    ? Object.keys(lineage.repaired_record).filter(
        (k) => !["field_provenance", "source_ids", "repair_notes", "norm_"].some((p) => k.startsWith(p))
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Selector */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Entity Lineage &amp; Provenance</h1>
          <p className="text-slate-500 text-sm mt-1">
            Trace repaired canonical entities back to their raw source records with exact field-level provenance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          {candidateIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">Entity ID:</span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 font-mono font-semibold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {candidateIds.map((cid) => (
                  <option key={cid} value={cid}>
                    {cid}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-slate-500 text-sm bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
          Tracing entity lineage...
        </div>
      ) : lineage ? (
        <div className="space-y-6">
          {/* Provenance Overview Card */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-indigo-950">{lineage.repaired_id}</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-indigo-200 text-indigo-800">
                  {lineage.table}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Resolved from <strong>{lineage.source_ids.length}</strong> source record(s):{" "}
                <span className="font-mono font-semibold">{lineage.source_ids.join(", ")}</span>
              </p>
            </div>

            <div className="text-xs text-indigo-900 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm">
              Provenance Status: <strong className="text-emerald-700">Verified &amp; Traceable</strong>
            </div>
          </div>

          {/* Side-by-Side Comparison: Original vs Repaired */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Repaired Record Card */}
            <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-6 ring-2 ring-indigo-500/10">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  Canonical Repaired Record
                </h3>
                <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-semibold">
                  {lineage.repaired_id}
                </span>
              </div>

              <div className="space-y-3">
                {repairedKeys.map((key) => {
                  const val = lineage.repaired_record[key];
                  const provSource = lineage.field_provenance[key];
                  return (
                    <div key={key} className="flex items-start justify-between text-xs py-1 border-b border-slate-50">
                      <span className="font-medium text-slate-500 w-1/3">{key}:</span>
                      <div className="w-2/3 text-right">
                        <span className="font-semibold text-slate-900">{String(val ?? "null")}</span>
                        {provSource && (
                          <span className="block text-[10px] text-indigo-600 font-mono mt-0.5">
                            source &larr; {provSource}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Original Source Record(s) */}
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2 px-1">
                <History className="h-4 w-4 text-slate-500" />
                Raw Source Records ({lineage.original_records.length})
              </h3>

              {lineage.original_records.map((orig, idx) => {
                const origId = orig.person_id || orig.place_id || orig.event_id || orig.rel_id;
                return (
                  <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                      <span className="font-mono text-xs font-semibold text-slate-700">Source: {origId}</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                        System {orig.source_system || "Unknown"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {repairedKeys.map((key) => {
                        const rawVal = orig[key];
                        const repVal = lineage.repaired_record[key];
                        const isDifferent = String(rawVal) !== String(repVal);

                        return (
                          <div key={key} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-slate-400">{key}:</span>
                            <span
                              className={`font-medium ${
                                isDifferent
                                  ? "text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold"
                                  : "text-slate-700"
                              }`}
                            >
                              {String(rawVal ?? "null")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit Timeline for This Entity */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-semibold text-slate-900 text-sm mb-4 flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-600" />
              Audit Decision Timeline for Entity
            </h3>

            {lineage.audit_timeline.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No modifications or conflict resolutions recorded for this entity.</p>
            ) : (
              <div className="space-y-3">
                {lineage.audit_timeline.map((act) => (
                  <div
                    key={act.action_id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-800">{act.action_id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {act.action_type}
                        </span>
                        <span className="text-slate-400 capitalize">via {act.method}</span>
                      </div>
                      <p className="text-slate-600 mt-1 text-xs">{act.plain_English_reason}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 capitalize">
                        {act.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          Select an entity above to trace its provenance and lineage.
        </div>
      )}
    </div>
  );
}
