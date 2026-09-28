"use client";

import React, { useState, useEffect } from "react";
import { FullInvestigationRecord } from "../types";

const API_BASE = "http://localhost:8000";

interface HistoryViewProps {
  onRunNewInvestigation?: () => void;
}

export default function HistoryView({ onRunNewInvestigation }: HistoryViewProps) {
  const [history, setHistory] = useState<FullInvestigationRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<FullInvestigationRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/investigation/history`);
      if (res.ok) {
        const data: FullInvestigationRecord[] = await res.json();
        setHistory(data);
        if (data.length > 0) {
          setSelectedRecord(data[data.length - 1]);
        }
      }
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDownloadJson = (record: FullInvestigationRecord) => {
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investigation-${record.investigation_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
      {/* 1. TOP SUB-HEADER BAR */}
      <div className="h-11 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-10 select-none shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            EXPERIMENT & INVESTIGATION HISTORY
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Audit log of executed end-to-end failure investigations & structured JSON exports
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchHistory}
            disabled={isLoading}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer"
          >
            {isLoading ? "Refreshing..." : "↻ Refresh History"}
          </button>

          {onRunNewInvestigation && (
            <button
              onClick={onRunNewInvestigation}
              className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
            >
              + Run New Investigation
            </button>
          )}
        </div>
      </div>

      {/* 2. MAIN SPLIT CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: History List (~40%) */}
        <div className="w-[40%] border-r border-slate-200 flex flex-col bg-white overflow-y-auto">
          <div className="h-9 px-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
            <span className="font-semibold text-slate-700">COMPLETED INVESTIGATIONS</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {history.length} Record{history.length !== 1 ? "s" : ""}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs px-6">
              <p className="font-medium text-slate-600 mb-1">No investigations recorded yet</p>
              <p>Run a full investigation using the top progress header to create your first record.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((record) => {
                const isSelected = selectedRecord?.investigation_id === record.investigation_id;
                const dateStr = new Date(record.timestamp * 1000).toLocaleTimeString();

                return (
                  <div
                    key={record.investigation_id}
                    onClick={() => setSelectedRecord(record)}
                    className={`p-4 transition cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/70 border-l-4 border-l-blue-600"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {record.investigation_id}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {dateStr}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 mb-2">
                      Target: <strong className="text-slate-900 font-mono">{record.fault_target}</strong> ({record.source} ➔ {record.destination})
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        11 Stages ✓
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {record.reproduction.successful_runs}/{record.reproduction.total_runs} Reprod
                      </span>
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                        {record.stages.length} Milestones
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Investigation Detail View (~60%) */}
        <div className="w-[60%] flex flex-col bg-white overflow-y-auto p-6">
          {!selectedRecord ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              Select an investigation record from the left to view detailed results.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header Card */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono font-bold text-base text-slate-900">
                      {selectedRecord.investigation_id}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                      COMPLETED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Target Failure: {selectedRecord.fault_target} • Flow: {selectedRecord.source} ➔ {selectedRecord.destination}
                  </p>
                </div>

                <button
                  onClick={() => handleDownloadJson(selectedRecord)}
                  className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <span>⬇ Download JSON Export</span>
                </button>
              </div>

              {/* Summary Verdict */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900 font-semibold block mb-1">
                  Investigation Summary Verdict:
                </strong>
                {selectedRecord.summary_verdict}
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-4 gap-2.5 text-center">
                <div className="p-3 bg-white rounded border border-slate-200 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Diagnosis</div>
                  <div className="text-xs font-bold font-mono text-slate-900 mt-1">
                    {selectedRecord.diagnosis.primary_cause?.target || selectedRecord.fault_target}
                  </div>
                </div>

                <div className="p-3 bg-white rounded border border-slate-200 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Reduced Size</div>
                  <div className="text-xs font-bold font-mono text-sky-600 mt-1">
                    {selectedRecord.reduction.final_topology.nodes.length} Nodes / {selectedRecord.reduction.final_topology.links.length} Links
                  </div>
                </div>

                <div className="p-3 bg-white rounded border border-slate-200 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Reproduction</div>
                  <div className="text-xs font-bold font-mono text-emerald-600 mt-1">
                    {selectedRecord.reproduction.successful_runs}/{selectedRecord.reproduction.total_runs} (100%)
                  </div>
                </div>

                <div className="p-3 bg-white rounded border border-slate-200 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Blast Scope</div>
                  <div className="text-xs font-bold font-mono text-amber-600 mt-1">
                    {selectedRecord.impact.failure_scope}
                  </div>
                </div>
              </div>

              {/* 11-Stage Workflow Execution Progression */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">
                  Workflow Execution Stages
                </h4>
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                  {selectedRecord.stages.map((stage) => (
                    <div
                      key={stage.stage_id}
                      className="p-3 rounded border border-slate-200 bg-white flex items-start justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center font-mono">
                            {stage.stage_number}
                          </span>
                          <span className="font-bold text-slate-900">
                            {stage.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 pl-7">
                          {stage.summary}
                        </p>
                      </div>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {stage.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
