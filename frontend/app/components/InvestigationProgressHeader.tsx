"use client";

import React, { useState } from "react";
import { NavViewId, useNetworkProject } from "../context/NetworkProjectContext";
import { FullInvestigationRecord } from "../types";

const API_BASE = "http://localhost:8000";

interface Milestone {
  id: string;
  stepNum: string;
  label: string;
  viewId: NavViewId;
}

const MILESTONES: Milestone[] = [
  { id: "m1", stepNum: "01", label: "Baseline", viewId: "network-builder" },
  { id: "m2", stepNum: "02", label: "Paths", viewId: "network-intelligence" },
  { id: "m3", stepNum: "03", label: "Faults", viewId: "fault-injection" },
  { id: "m4", stepNum: "04", label: "Detection", viewId: "failure-detection" },
  { id: "m5", stepNum: "05", label: "Diagnosis", viewId: "diagnosis" },
  { id: "m6", stepNum: "06", label: "Impact", viewId: "diagnosis" },
  { id: "m7", stepNum: "07", label: "Causal", viewId: "causal-analysis" },
  { id: "m8", stepNum: "08", label: "Signature", viewId: "failure-signature" },
  { id: "m9", stepNum: "09", label: "Reduction", viewId: "reduction" },
  { id: "m10", stepNum: "10", label: "Reproduction", viewId: "reproduction" },
  { id: "m11", stepNum: "11", label: "What-If", viewId: "what-if" },
];

export default function InvestigationProgressHeader() {
  const {
    activeView,
    setActiveView,
    lastInvestigationRecord,
    setLastInvestigationRecord,
  } = useNetworkProject();
  const [isRunning, setIsRunning] = useState(false);

  const handleRunFullInvestigation = async () => {
    setIsRunning(true);
    try {
      const res = await fetch(`${API_BASE}/api/investigation/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "PC1",
          destination: "Server",
          fault_target: "R2-R3",
          fault_type: "LINK_FAILURE",
          reproduction_runs: 3,
        }),
      });
      if (res.ok) {
        const record: FullInvestigationRecord = await res.json();
        setLastInvestigationRecord(record);
        // Navigate user to Causal Analysis
        setActiveView("causal-analysis");
      }
    } catch {
      // Handle error
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="h-9 bg-slate-900 text-slate-300 px-4 flex items-center justify-between border-b border-slate-800 text-[11px] shrink-0 select-none z-20">
      {/* Left: Workflow Progress Chain */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
          PIPELINE:
        </span>
        {MILESTONES.map((m, idx) => {
          const isActive = activeView === m.viewId;
          const isComplete = lastInvestigationRecord !== null;

          return (
            <React.Fragment key={m.id}>
              <button
                onClick={() => setActiveView(m.viewId)}
                className={`px-2 py-0.5 rounded font-mono transition cursor-pointer flex items-center gap-1 ${
                  isActive
                    ? "bg-blue-600 text-white font-bold"
                    : isComplete
                    ? "bg-slate-800 text-emerald-400 hover:bg-slate-700"
                    : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                }`}
                title={`Jump to ${m.label} (${m.viewId})`}
              >
                <span className="text-[9px] opacity-75">{m.stepNum}</span>
                <span>{m.label}</span>
                {isComplete && <span className="text-[9px] text-emerald-400">✓</span>}
              </button>
              {idx < MILESTONES.length - 1 && (
                <span className="text-slate-600 text-[10px]">➔</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Right: Master 1-Click Run Button */}
      <div className="flex items-center gap-2 pl-3 shrink-0">
        {lastInvestigationRecord && (
          <span className="text-emerald-400 font-mono text-[10px]">
            {lastInvestigationRecord.investigation_id} (Validated)
          </span>
        )}
        <button
          onClick={handleRunFullInvestigation}
          disabled={isRunning}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold px-2.5 py-0.5 rounded text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
          title="Executes the full 11-stage automated investigation from Baseline to Reproduction"
        >
          {isRunning ? (
            <>
              <svg className="w-3 h-3 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Investigating...</span>
            </>
          ) : (
            <>
              <span>⚡ Run Full Investigation</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
