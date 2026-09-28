"use client";

import React, { useState, useEffect } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  ReductionExperimentResponse,
  CandidateEvaluationResult,
  TopologyData,
} from "../types";

const API_BASE = "http://localhost:8000";

export default function ReductionView() {
  const { currentNetwork, setActiveView } = useNetworkProject();

  const [reductionData, setReductionData] = useState<ReductionExperimentResponse | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateEvaluationResult | null>(null);
  const [displayTopology, setDisplayTopology] = useState<"original" | "reduced">("reduced");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runReduction = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/reduction/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: ["PC2", "R4", "R1"] }),
      });
      if (res.ok) {
        const data: ReductionExperimentResponse = await res.json();
        setReductionData(data);
        if (data.candidate_evaluations && data.candidate_evaluations.length > 0) {
          setSelectedCandidate(data.candidate_evaluations[0]);
        }
      } else {
        setErrorMessage("Failed to run failure reduction");
      }
    } catch {
      setErrorMessage("Network error connecting to reduction engine");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runReduction();
  }, []);

  const activeTopology: TopologyData =
    displayTopology === "reduced" && reductionData?.final_topology
      ? reductionData.final_topology
      : reductionData?.original_topology || currentNetwork;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
      {/* 1. TOP SUB-HEADER BAR */}
      <div className="h-11 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-10 select-none shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            DEPENDENCY-AWARE FAILURE REDUCTION
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Prunes inessential topology elements while strictly preserving target failure & causal dependencies (Module 4)
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={runReduction}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            {isLoading ? "Pruning Elements..." : "⚡ Run Reduction Experiment"}
          </button>

          <button
            onClick={() => setActiveView("reproduction")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Proceed to Reproduction ➔
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Topology Comparison (~46%) */}
        <div className="w-[46%] border-r border-slate-200 flex flex-col bg-white overflow-hidden relative">
          <div className="h-9 px-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
            {/* View Switcher: Original vs Reduced */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">TOPOLOGY PREVIEW:</span>
              <div className="flex items-center bg-slate-200/80 p-0.5 rounded text-[11px]">
                <button
                  onClick={() => setDisplayTopology("original")}
                  className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                    displayTopology === "original"
                      ? "bg-white text-slate-900 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Original (7 Nodes, 6 Links)
                </button>
                <button
                  onClick={() => setDisplayTopology("reduced")}
                  className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                    displayTopology === "reduced"
                      ? "bg-white text-blue-700 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Reduced (5 Nodes, 4 Links)
                </button>
              </div>
            </div>

            {reductionData && (
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                -2 NODES PRUNED
              </span>
            )}
          </div>

          <div className="flex-1 relative overflow-hidden bg-slate-50/40">
            <NetworkPreview
              network={activeTopology}
              highlightedFaultLinkId="R2-R3"
              highlightedPath={reductionData?.target_failure.baseline_path || []}
            />

            {/* Reduction Summary Overlay Card */}
            {reductionData && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-3 shadow-md text-xs w-72 z-20">
                <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-100">
                  <span className="font-semibold text-[10px] uppercase text-slate-500">
                    Active Preview Mode
                  </span>
                  <span className="font-mono text-[10px] font-bold text-blue-700">
                    {displayTopology.toUpperCase()}
                  </span>
                </div>
                <div className="font-mono text-xs font-bold text-slate-900">
                  {activeTopology.nodes.length} Nodes • {activeTopology.links.length} Links
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {displayTopology === "reduced"
                    ? "Inessential branch (PC2, R4) removed. Core failure behavior fully preserved."
                    : "Complete 7-node baseline network before candidate pruning."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Candidate Evaluations & Equivalence Verification (~54%) */}
        <div className="w-[54%] flex flex-col bg-white overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                CANDIDATE PRUNING EVALUATION LOG
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic trial-and-validation steps verifying failure and causal preservation
              </p>
            </div>
            {reductionData && (
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                FAILURE-PRESERVING SCENARIO
              </span>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 mb-4 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMessage}
            </div>
          )}

          {!reductionData ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <p className="font-medium text-slate-600 mb-1">Click &quot;Run Reduction Experiment&quot; to begin</p>
              <p>The engine will test candidate element removals against the target failure signature.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 1. Candidate Steps List */}
              <div className="space-y-2.5">
                {reductionData.candidate_evaluations.map((evalItem, idx) => {
                  const isSelected = selectedCandidate?.candidate === evalItem.candidate;
                  const isAccepted = evalItem.status === "ACCEPTED";

                  return (
                    <div
                      key={evalItem.candidate}
                      onClick={() => setSelectedCandidate(evalItem)}
                      className={`p-3.5 rounded-lg border transition cursor-pointer ${
                        isSelected
                          ? "border-blue-500 bg-blue-50/50 shadow-xs"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                            STEP {idx + 1}
                          </span>
                          <span className="font-mono text-sm font-bold text-slate-900">
                            Candidate: {evalItem.candidate} ({evalItem.candidate_type})
                          </span>
                        </div>
                        <span
                          className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                            isAccepted
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {evalItem.status} {isAccepted ? "✓" : "✕ RESTORED"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {evalItem.message}
                      </p>

                      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-slate-100 text-[11px] font-mono">
                        <span className="flex items-center gap-1">
                          <span className="text-slate-400 font-sans">Signature Equivalence:</span>
                          <strong className={evalItem.signature_match ? "text-emerald-600" : "text-rose-600"}>
                            {evalItem.signature_match ? "MATCH" : "VIOLATED"}
                          </strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-slate-400 font-sans">Causal Dependencies:</span>
                          <strong className={evalItem.dependency_match ? "text-emerald-600" : "text-rose-600"}>
                            {evalItem.dependency_match ? "PRESERVED" : "BROKEN"}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 2. Selected Candidate Deep-Dive Comparison */}
              {selectedCandidate && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
                    <span className="font-bold text-slate-800 uppercase tracking-wide">
                      Validation Inspector: {selectedCandidate.candidate}
                    </span>
                    <span className="font-mono text-slate-500">
                      Action: {selectedCandidate.action}
                    </span>
                  </div>

                  {/* Equivalence Comparison Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="bg-white p-3 rounded border border-slate-200">
                      <div className="font-sans font-semibold text-slate-700 mb-1">
                        Preserved Properties ({selectedCandidate.preserved_fields.length})
                      </div>
                      <div className="text-[11px] text-emerald-700 space-y-0.5">
                        {selectedCandidate.preserved_fields.map((f) => (
                          <div key={f}>✓ {f}</div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded border border-slate-200">
                      <div className="font-sans font-semibold text-slate-700 mb-1">
                        Changed / Violated Fields ({selectedCandidate.changed_fields.length})
                      </div>
                      <div className="text-[11px] text-rose-600 space-y-0.5">
                        {selectedCandidate.changed_fields.length === 0 ? (
                          <span className="text-slate-400 font-sans italic">None (Identical)</span>
                        ) : (
                          selectedCandidate.changed_fields.map((f) => (
                            <div key={f}>✕ {f}</div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Causal Relationship Preservation */}
                  <div className="bg-white p-3 rounded border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-700 mb-1">
                      Causal Relationship Status
                    </div>
                    <div className="font-mono text-[11px] text-slate-600">
                      {selectedCandidate.dependency_match ? (
                        <span className="text-emerald-700 font-bold">
                          ✓ All 5 target causal dependencies preserved in candidate topology.
                        </span>
                      ) : (
                        <span className="text-rose-600 font-bold">
                          ✕ Removal destroyed baseline transit path; candidate rejected to preserve causal validity.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
