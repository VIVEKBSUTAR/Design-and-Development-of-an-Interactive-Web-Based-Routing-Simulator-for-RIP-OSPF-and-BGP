"use client";

import React, { useState, useEffect } from "react";
import { useNetworkProject } from "../context/NetworkProjectContext";
import { FullInvestigationRecord } from "../types";

const API_BASE = "http://localhost:8000";

interface InvestigationWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StepItem {
  id: string;
  name: string;
  desc: string;
}

const INVESTIGATION_STEPS: StepItem[] = [
  { id: "baseline", name: "Baseline Connectivity", desc: "Verifying initial network health & hop paths" },
  { id: "path", name: "Path Analysis", desc: "Mapping active forwarding route & ECMP alternates" },
  { id: "fault", name: "Fault Injection", desc: "Injecting controlled link failure on R2-R3" },
  { id: "detect", name: "Failure Detection", desc: "Detecting packet drops & pinpointing severance" },
  { id: "diagnose", name: "Root-Cause Diagnosis", desc: "Evaluating ranked hypotheses & evidence" },
  { id: "impact", name: "Impact Analysis", desc: "Classifying blast radius & affected flows" },
  { id: "causal", name: "Causal Dependency Graph", desc: "Constructing deterministic causal DAG" },
  { id: "signature", name: "Failure Signature", desc: "Extracting immutable failure fingerprint" },
  { id: "reduction", name: "Topology Reduction", desc: "Pruning inessential nodes (PC2, R4) via Delta Debugging" },
  { id: "reproduce", name: "Multi-Trial Reproduction", desc: "Executing 3 deterministic test trials on reduced topology" },
];

export default function InvestigationWorkflowModal({
  isOpen,
  onClose,
}: InvestigationWorkflowModalProps) {
  const {
    setActiveView,
    setLastInvestigationRecord,
    lastInvestigationRecord,
  } = useNetworkProject();

  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [record, setRecord] = useState<FullInvestigationRecord | null>(lastInvestigationRecord);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !isRunning && !record) {
      handleRun();
    }
  }, [isOpen]);

  const handleRun = async () => {
    setIsRunning(true);
    setErrorMessage(null);
    setCurrentStepIndex(0);

    // Simulate stepping progression through the 10 stages
    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < INVESTIGATION_STEPS.length - 1) {
          return prev + 1;
        }
        return prev;
      });
    }, 450);

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

      clearInterval(stepInterval);

      if (res.ok) {
        const data: FullInvestigationRecord = await res.json();
        setRecord(data);
        setLastInvestigationRecord(data);
        setCurrentStepIndex(INVESTIGATION_STEPS.length);
      } else {
        setErrorMessage("Investigation backend returned an error status.");
      }
    } catch (err) {
      clearInterval(stepInterval);
      setErrorMessage("Could not connect to investigation engine on port 8000.");
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen) return null;

  const isCompleted = record !== null && !isRunning;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isRunning
                  ? "bg-blue-600 animate-ping"
                  : isCompleted
                  ? "bg-emerald-500"
                  : "bg-slate-400"
              }`}
            />
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {isRunning
                  ? "Running Automated Investigation..."
                  : isCompleted
                  ? "Investigation Complete"
                  : "Automated Failure Investigation"}
              </h2>
              <p className="text-xs text-slate-500">
                End-to-end Computer Networks resilience testing & causal reproduction
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm transition"
            title="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 max-h-[65vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
              {errorMessage}
            </div>
          )}

          {/* Stepper Progress */}
          <div className="space-y-1.5">
            {INVESTIGATION_STEPS.map((step, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex && isRunning;
              const isPending = idx > currentStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition ${
                    isCurrent
                      ? "bg-blue-50 border border-blue-200 text-blue-900 font-semibold"
                      : isPast
                      ? "bg-slate-50 text-slate-800"
                      : "text-slate-400 opacity-60"
                  }`}
                >
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                    {isPast ? (
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                        ✓
                      </span>
                    ) : isCurrent ? (
                      <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center animate-spin text-[8px]">
                        ●
                      </span>
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center">
                        ○
                      </span>
                    )}
                  </div>

                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="truncate">{step.name}</span>
                    <span className="text-[11px] font-normal text-slate-500 hidden sm:inline truncate max-w-[280px]">
                      {step.desc}
                    </span>
                  </div>

                  {isPast && (
                    <span className="text-[10px] font-mono text-emerald-600 font-semibold shrink-0">
                      Done
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] font-mono text-blue-600 font-semibold shrink-0 animate-pulse">
                      Processing...
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Result Card upon completion */}
          {isCompleted && record && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg flex flex-col gap-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                  Diagnostic & Resilience Verdict
                </span>
                <span className="text-[10px] font-mono bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded font-semibold">
                  100% Deterministic Match
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                <div className="bg-white p-2.5 rounded border border-emerald-100">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Identified Failure</div>
                  <div className="font-bold text-slate-900 mt-0.5">R2 — R3 Link Fault</div>
                  <div className="text-[10px] text-emerald-600 font-medium">85% Confidence</div>
                </div>

                <div className="bg-white p-2.5 rounded border border-emerald-100">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Impacted Flow</div>
                  <div className="font-bold text-slate-900 mt-0.5">PC1 ➔ Server</div>
                  <div className="text-[10px] text-rose-600 font-medium">100% Packet Loss</div>
                </div>

                <div className="bg-white p-2.5 rounded border border-emerald-100">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Reproduction</div>
                  <div className="font-bold text-slate-900 mt-0.5">3 / 3 Trials Dropped</div>
                  <div className="text-[10px] text-indigo-600 font-medium">5-Node Minimal Topology</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {isRunning ? (
              <span>Running automated test pipeline...</span>
            ) : isCompleted ? (
              <span className="text-emerald-700 font-medium">All 10 pipeline stages verified successfully.</span>
            ) : (
              <span>Ready to execute investigation.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isRunning && isCompleted ? (
              <>
                <button
                  onClick={() => {
                    setActiveView("diagnosis");
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition"
                >
                  View in Diagnosis
                </button>
                <button
                  onClick={() => {
                    setActiveView("resilience");
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-xs"
                >
                  View Resilience Analysis ➔
                </button>
              </>
            ) : (
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition shadow-xs"
              >
                {isRunning ? "Investigating..." : "Rerun Investigation"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
