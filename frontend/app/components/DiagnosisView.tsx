"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  Module3DiagnosisResult,
  Hypothesis,
  ImpactAnalysisResult,
  ImpactedFlow,
} from "../types";

const API_BASE = "http://localhost:8000";

export default function DiagnosisView() {
  const { currentNetwork, currentRevision, setActiveView } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const links = currentNetwork.links || [];

  const defaultSource = nodes.find((n) => n.id === "PC1")?.id || nodes[0]?.id || "PC1";
  const defaultDest = nodes.find((n) => n.id === "Server")?.id || nodes[nodes.length - 1]?.id || "Server";

  const [selectedSource, setSelectedSource] = useState(defaultSource);
  const [selectedDestination, setSelectedDestination] = useState(defaultDest);

  // Subtabs: "diagnosis" vs "impact"
  const [activeSubtab, setActiveSubtab] = useState<"diagnosis" | "impact">("diagnosis");

  // Diagnosis data
  const [diagnosis, setDiagnosis] = useState<Module3DiagnosisResult | null>(null);
  const [selectedHypothesis, setSelectedHypothesis] = useState<Hypothesis | null>(null);

  // Impact analysis data
  const [impactData, setImpactData] = useState<ImpactAnalysisResult | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<ImpactedFlow | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Run full diagnosis workflow
  const runDiagnosis = useCallback(async (src = selectedSource, dst = selectedDestination) => {
    if (!src || !dst) return;
    setIsLoading(true);
    try {
      const [diagRes, impRes] = await Promise.all([
        fetch(`${API_BASE}/api/diagnosis/diagnose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: src, destination: dst }),
        }),
        fetch(`${API_BASE}/api/diagnosis/impact`),
      ]);

      if (diagRes.ok) {
        const diagData: Module3DiagnosisResult = await diagRes.json();
        setDiagnosis(diagData);
        if (diagData.primary_cause) {
          setSelectedHypothesis(diagData.primary_cause);
        } else if (diagData.candidate_hypotheses.length > 0) {
          setSelectedHypothesis(diagData.candidate_hypotheses[0]);
        }
      }

      if (impRes.ok) {
        const impData: ImpactAnalysisResult = await impRes.json();
        setImpactData(impData);
      }
    } catch (err) {
      showToast("Error running diagnostic investigation");
    } finally {
      setIsLoading(false);
    }
  }, [selectedSource, selectedDestination]);

  useEffect(() => {
    runDiagnosis();
  }, [runDiagnosis]);

  // Compute path to highlight in preview
  let previewHighlightPath: string[] = [];
  if (activeSubtab === "impact" && selectedFlow && selectedFlow.path.length > 0) {
    previewHighlightPath = selectedFlow.path;
  } else if (diagnosis && diagnosis.primary_cause) {
    // Highlight suspected component
    const target = diagnosis.primary_cause.target;
    if (target.includes("-")) {
      previewHighlightPath = target.split("-").map((s) => s.trim());
    } else if (nodes.some((n) => n.id === target)) {
      previewHighlightPath = [target];
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full overflow-hidden bg-slate-50">
      {/* Toast */}
      {toastMessage && (
        <div className="absolute top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2 rounded shadow-lg border border-slate-700 animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP HEADER BAR */}
      <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-slate-900">
              FAILURE DIAGNOSIS & IMPACT
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
              MODULE 3
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Subtab Navigation Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setActiveSubtab("diagnosis")}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                activeSubtab === "diagnosis"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Diagnostic Hypotheses
            </button>
            <button
              onClick={() => setActiveSubtab("impact")}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                activeSubtab === "impact"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Blast Radius Impact
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Source -> Destination */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Flow:</span>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-mono font-medium text-slate-800"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
            <span className="text-slate-400 font-medium">➔</span>
            <select
              value={selectedDestination}
              onChange={(e) => setSelectedDestination(e.target.value)}
              className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-mono font-medium text-slate-800"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => runDiagnosis()}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            {isLoading ? "Investigating..." : "↻ Re-Diagnose"}
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView("fault-injection")}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            ⚡ Injected Faults
          </button>
          <button
            onClick={() => setActiveView("failure-detection")}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            ◀ Detection
          </button>
          <button
            onClick={() => setActiveView("causal-analysis")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Proceed to Causal Analysis ➔
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Topology Visualization (~46%) */}
        <div className="w-[46%] border-r border-slate-200 flex flex-col bg-white overflow-hidden relative">
          <div className="h-9 px-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
            <span className="font-semibold text-slate-700">
              NETWORK TOPOLOGY & ISOLATION PREVIEW
            </span>
            {diagnosis?.primary_cause && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                ISOLATED CAUSE: {diagnosis.primary_cause.target}
              </span>
            )}
          </div>

          <div className="flex-1 relative overflow-hidden bg-slate-50/40">
            <NetworkPreview
              network={currentNetwork}
              highlightedPath={previewHighlightPath}
              highlightedFaultLinkId={
                diagnosis?.primary_cause?.category === "LINK"
                  ? diagnosis.primary_cause.target
                  : null
              }
              highlightedFaultNodeId={
                diagnosis?.primary_cause?.category === "NODE"
                  ? diagnosis.primary_cause.target
                  : null
              }
            />

            {/* Suspected Component Card Overlay */}
            {diagnosis?.primary_cause && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-3 shadow-md text-xs w-72 z-20">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-600 uppercase text-[10px]">
                    Suspected Component
                  </span>
                  <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-amber-100 text-amber-800">
                    {diagnosis.primary_cause.confidence_level} CONFIDENCE
                  </span>
                </div>
                <div className="font-mono text-sm font-bold text-slate-900">
                  {diagnosis.primary_cause.target}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {diagnosis.primary_cause.title}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Diagnostic Hypotheses & Evidence OR Impact (~54%) */}
        <div className="w-[54%] flex flex-col bg-white overflow-y-auto">
          {activeSubtab === "diagnosis" ? (
            /* SUBTAB A: DIAGNOSIS & HYPOTHESIS INVESTIGATION */
            <div className="p-6 space-y-6">
              {/* 1. Final Diagnostic Verdict Banner */}
              {diagnosis && (
                <div
                  className={`p-4 rounded-lg border text-xs ${
                    diagnosis.status === "FAILURE_CONFIRMED"
                      ? "bg-rose-50/50 border-rose-200"
                      : diagnosis.status === "AMBIGUOUS"
                      ? "bg-amber-50/50 border-amber-200"
                      : "bg-emerald-50/50 border-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-wide text-slate-900">
                        DIAGNOSTIC VERDICT
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          diagnosis.status === "FAILURE_CONFIRMED"
                            ? "bg-rose-100 text-rose-800"
                            : diagnosis.status === "AMBIGUOUS"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {diagnosis.status}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono font-bold text-slate-700">
                      CONFIDENCE: {diagnosis.confidence}
                    </div>
                  </div>

                  {diagnosis.primary_cause && (
                    <div className="mb-2">
                      <div className="text-base font-bold text-slate-900">
                        {diagnosis.primary_cause.title}
                      </div>
                      <div className="font-mono text-xs text-rose-700 font-semibold mt-0.5">
                        Target Component: {diagnosis.primary_cause.target} (Category: {diagnosis.primary_cause.category})
                      </div>
                    </div>
                  )}

                  <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                    {diagnosis.summary}
                  </p>

                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Recommended Action: <strong className="text-slate-800">{diagnosis.recommended_action}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* 2. Candidate Hypotheses List */}
              {diagnosis && (
                <div>
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide mb-3 flex items-center justify-between">
                    <span>COMPETING CANDIDATE CAUSES</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      Click hypothesis to inspect evidence base
                    </span>
                  </h4>

                  <div className="space-y-2.5">
                    {diagnosis.candidate_hypotheses.map((h) => {
                      const isSelected = selectedHypothesis?.hypothesis_id === h.hypothesis_id;
                      const scorePct = Math.round(h.confidence_score * 100);

                      return (
                        <div
                          key={h.hypothesis_id}
                          onClick={() => setSelectedHypothesis(h)}
                          className={`p-3.5 rounded-lg border transition cursor-pointer ${
                            isSelected
                              ? "border-blue-500 bg-blue-50/30 shadow-xs"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                {h.hypothesis_id}
                              </span>
                              <span className="font-bold text-xs text-slate-900">
                                {h.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                  h.status === "CONFIRMED"
                                    ? "bg-rose-100 text-rose-800"
                                    : h.status === "REFUTED"
                                    ? "bg-slate-100 text-slate-500 line-through"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {h.status} ({scorePct}%)
                              </span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-500 font-mono mt-1">
                            Target: {h.target} • Test: {h.targeted_test_conducted}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Detailed Evidence Breakdown for Selected Hypothesis */}
              {selectedHypothesis && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                    <span className="font-bold text-xs uppercase tracking-wide text-slate-800">
                      EVIDENCE & DEDUCTION: {selectedHypothesis.hypothesis_id}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-600">
                      Score: {Math.round(selectedHypothesis.confidence_score * 100)}%
                    </span>
                  </div>

                  {/* Targeted Test Conducted */}
                  <div className="mb-3 p-2.5 bg-white rounded border border-slate-200 text-xs">
                    <div className="font-semibold text-slate-700 text-[11px] uppercase tracking-wide mb-1">
                      Targeted Telemetry Check
                    </div>
                    <div className="font-mono text-slate-900 font-bold">
                      {selectedHypothesis.targeted_test_conducted}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Result: <strong className="text-slate-800">{selectedHypothesis.targeted_test_result}</strong>
                    </div>
                  </div>

                  {/* Supporting Evidence */}
                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <span>✓</span> Supporting Observations ({selectedHypothesis.supporting_evidence.length})
                    </div>
                    {selectedHypothesis.supporting_evidence.length === 0 ? (
                      <div className="text-slate-400 text-xs italic">No supporting evidence recorded</div>
                    ) : (
                      <ul className="space-y-1 text-xs text-emerald-950 bg-emerald-50/50 p-2.5 rounded border border-emerald-100">
                        {selectedHypothesis.supporting_evidence.map((ev, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-600 font-bold">•</span>
                            <span>{ev}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Contradicting Evidence */}
                  <div>
                    <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <span>✕</span> Contradicting Observations ({selectedHypothesis.contradicting_evidence.length})
                    </div>
                    {selectedHypothesis.contradicting_evidence.length === 0 ? (
                      <div className="text-slate-400 text-xs italic">No contradicting observations found</div>
                    ) : (
                      <ul className="space-y-1 text-xs text-rose-950 bg-rose-50/50 p-2.5 rounded border border-rose-100">
                        {selectedHypothesis.contradicting_evidence.map((ev, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-rose-600 font-bold">•</span>
                            <span>{ev}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* SUBTAB B: BLAST RADIUS IMPACT ANALYSIS (Consuming Module 1) */
            <div className="p-6 space-y-6">
              {impactData && (
                <>
                  {/* 1. Impact Scope KPIs */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">
                        Failure Scope
                      </div>
                      <div
                        className={`text-lg font-bold font-mono mt-1 ${
                          impactData.failure_scope === "WIDESPREAD"
                            ? "text-rose-600"
                            : impactData.failure_scope === "PARTITIONED"
                            ? "text-amber-600"
                            : impactData.failure_scope === "LOCALIZED"
                            ? "text-blue-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {impactData.failure_scope}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">
                        Affected Flows
                      </div>
                      <div className="text-lg font-bold font-mono text-rose-600 mt-1">
                        {impactData.affected_flows_count} / {impactData.total_flows_evaluated}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">
                        Surviving Healthy
                      </div>
                      <div className="text-lg font-bold font-mono text-emerald-600 mt-1">
                        {impactData.unaffected_flows_count} / {impactData.total_flows_evaluated}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-3 bg-slate-100 rounded border border-slate-200 text-xs text-slate-700">
                    {impactData.summary}
                  </div>

                  {/* 2. Affected Flows List */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide mb-2 flex items-center justify-between">
                      <span className="text-rose-700">
                        ● DISRUPTED FLOWS ({impactData.affected_flows_count})
                      </span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        Click flow to view severed route
                      </span>
                    </h4>

                    {impactData.affected_flows.length === 0 ? (
                      <div className="p-3 bg-emerald-50 text-emerald-800 rounded border border-emerald-200 text-xs">
                        No flows currently disrupted. All traffic delivered.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {impactData.affected_flows.map((flow, i) => (
                          <div
                            key={i}
                            onClick={() => setSelectedFlow(flow)}
                            className={`p-3 rounded border text-xs transition cursor-pointer flex items-center justify-between ${
                              selectedFlow === flow
                                ? "bg-rose-50 border-rose-400 shadow-xs"
                                : "bg-white border-slate-200 hover:border-rose-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">
                                {flow.source} ➔ {flow.destination}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800">
                              FAILED
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Surviving Healthy Flows List */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide mb-2 flex items-center justify-between">
                      <span className="text-emerald-700">
                        ✓ SURVIVING HEALTHY FLOWS ({impactData.unaffected_flows_count})
                      </span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        Click flow to view operational path
                      </span>
                    </h4>

                    <div className="space-y-2">
                      {impactData.unaffected_flows.map((flow, i) => (
                        <div
                          key={i}
                          onClick={() => setSelectedFlow(flow)}
                          className={`p-3 rounded border text-xs transition cursor-pointer flex items-center justify-between ${
                            selectedFlow === flow
                              ? "bg-emerald-50 border-emerald-400 shadow-xs"
                              : "bg-white border-slate-200 hover:border-emerald-300"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">
                              {flow.source} ➔ {flow.destination}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              ({flow.hops} hops: {flow.path.join(" ➔ ")})
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                            HEALTHY
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
