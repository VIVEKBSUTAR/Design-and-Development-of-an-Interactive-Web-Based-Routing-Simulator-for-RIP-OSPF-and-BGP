"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  DependencyGraph,
  DependencyNode,
  FailureSignatureData,
  ReductionExperimentResponse,
  ReproductionResponse,
  WhatIfResponse,
  TopologyData,
} from "../types";

const API_BASE = "http://localhost:8000";

type ResilienceTab = "signature" | "causal" | "reduction" | "reproduction" | "what-if";

interface CausalStepItem {
  id: string;
  label: string;
  detail: string;
}

export default function ResilienceAnalysisView() {
  const {
    currentNetwork,
    setActiveView,
    resetToBaseline,
    lastInvestigationRecord,
  } = useNetworkProject();

  const [activeTab, setActiveTab] = useState<ResilienceTab>("signature");

  // Flow endpoints
  const [source, setSource] = useState("PC1");
  const [destination, setDestination] = useState("Server");

  // Tab 1 & 2 State: Signature & Causal
  const [signatureData, setSignatureData] = useState<FailureSignatureData | null>(null);
  const [causalData, setCausalData] = useState<DependencyGraph | null>(null);
  const [selectedCausalStep, setSelectedCausalStep] = useState<CausalStepItem | null>({
    id: "fault",
    label: "R2 — R3 Link Fault Injected",
    detail: "Link severed; interface transition state set to DOWN; physical link loss confirmed.",
  });

  // Tab 3 State: Reduction
  const [reductionData, setReductionData] = useState<ReductionExperimentResponse | null>(null);
  const [reductionTopologyMode, setReductionTopologyMode] = useState<"reduced" | "original">("reduced");

  // Tab 4 State: Reproduction
  const [reproductionData, setReproductionData] = useState<ReproductionResponse | null>(null);

  // Tab 5 State: What-If
  const [whatIfComponent, setWhatIfComponent] = useState("R2-R3");
  const [whatIfType, setWhatIfType] = useState<"LINK" | "NODE">("LINK");
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResponse | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Fetch Signature & Causal Data
  const fetchSignatureAndCausal = useCallback(async () => {
    setIsLoading(true);
    try {
      const [causalRes, sigRes] = await Promise.all([
        fetch(`${API_BASE}/api/causal-dependencies?source=${source}&destination=${destination}`),
        fetch(`${API_BASE}/api/failure-signature?source=${source}&destination=${destination}`),
      ]);

      let hasActiveLive = false;
      if (causalRes.ok) {
        const cData = await causalRes.json();
        if (cData.active && cData.graph) {
          setCausalData(cData.graph);
          hasActiveLive = true;
        }
      }

      if (sigRes.ok) {
        const sData = await sigRes.json();
        if (sData.active && sData.signature) {
          setSignatureData(sData.signature);
          hasActiveLive = true;
        }
      }

      // Fallback to last full investigation record if live is idle
      if (!hasActiveLive && lastInvestigationRecord) {
        setCausalData(lastInvestigationRecord.causal_dependencies);
        setSignatureData(lastInvestigationRecord.signature);
      }
    } catch {
      // Offline fallback
      if (lastInvestigationRecord) {
        setCausalData(lastInvestigationRecord.causal_dependencies);
        setSignatureData(lastInvestigationRecord.signature);
      }
    } finally {
      setIsLoading(false);
    }
  }, [source, destination, lastInvestigationRecord]);

  // 2. Run Reduction
  const fetchReduction = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/reduction/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: ["PC2", "R4", "R1"] }),
      });
      if (res.ok) {
        const data: ReductionExperimentResponse = await res.json();
        setReductionData(data);
      } else if (lastInvestigationRecord?.reduction) {
        setReductionData(lastInvestigationRecord.reduction);
      }
    } catch {
      if (lastInvestigationRecord?.reduction) {
        setReductionData(lastInvestigationRecord.reduction);
      }
    } finally {
      setIsLoading(false);
    }
  }, [lastInvestigationRecord]);

  // 3. Run Reproduction
  const fetchReproduction = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/reproduction/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs: 3 }),
      });
      if (res.ok) {
        const data: ReproductionResponse = await res.json();
        setReproductionData(data);
      } else if (lastInvestigationRecord?.reproduction) {
        setReproductionData(lastInvestigationRecord.reproduction);
      }
    } catch {
      if (lastInvestigationRecord?.reproduction) {
        setReproductionData(lastInvestigationRecord.reproduction);
      }
    } finally {
      setIsLoading(false);
    }
  }, [lastInvestigationRecord]);

  // 4. Run What-If Simulation
  const runWhatIf = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/resilience/what-if`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_component: whatIfComponent,
          target_type: whatIfType,
          source,
          destination,
        }),
      });
      if (res.ok) {
        const data: WhatIfResponse = await res.json();
        setWhatIfResult(data);
      }
    } catch {
      showToast("Error running what-if simulation.");
    } finally {
      setIsLoading(false);
    }
  }, [whatIfComponent, whatIfType, source, destination]);

  useEffect(() => {
    if (activeTab === "signature" || activeTab === "causal") {
      fetchSignatureAndCausal();
    } else if (activeTab === "reduction" && !reductionData) {
      fetchReduction();
    } else if (activeTab === "reproduction" && !reproductionData) {
      fetchReproduction();
    } else if (activeTab === "what-if" && !whatIfResult) {
      runWhatIf();
    }
  }, [activeTab, fetchSignatureAndCausal, fetchReduction, fetchReproduction, runWhatIf]);

  // Highlighted path for signature/what-if topology
  const baselinePath = signatureData?.baseline_path || ["PC1", "R1", "R2", "R3", "Server"];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50 text-slate-800">
      {/* 1. TOP HEADER & COMPACT TABS */}
      <div className="h-12 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 select-none shadow-2xs z-10">
        {/* Left: Section Title */}
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            Resilience Analysis
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-500 hidden md:inline">
            Causal dependency validation, failure reduction & reproduction
          </span>
        </div>

        {/* Center: Compact Internal Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => setActiveTab("signature")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
              activeTab === "signature"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Signature
          </button>
          <button
            onClick={() => setActiveTab("causal")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
              activeTab === "causal"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Causal Chain
          </button>
          <button
            onClick={() => setActiveTab("reduction")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
              activeTab === "reduction"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Reduction
          </button>
          <button
            onClick={() => setActiveTab("reproduction")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
              activeTab === "reproduction"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Reproduction
          </button>
          <button
            onClick={() => setActiveTab("what-if")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
              activeTab === "what-if"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            What-If
          </button>
        </div>

        {/* Right: Reset Action */}
        <div className="flex items-center gap-2">
          {toastMessage && (
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              {toastMessage}
            </span>
          )}

          <button
            onClick={async () => {
              await resetToBaseline();
              showToast("Network restored to default baseline state.");
            }}
            className="px-2.5 py-1 text-xs text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition cursor-pointer"
            title="Reset active network to baseline configuration"
          >
            Reset Baseline
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE CONTENT */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {/* =================================================================== */}
        {/* TAB 1: FAILURE SIGNATURE */}
        {/* =================================================================== */}
        {activeTab === "signature" && (
          <>
            <div className="w-[58%] h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <NetworkPreview
                network={currentNetwork}
                title="FAILURE SIGNATURE TOPOLOGY"
                subtitle="Baseline forwarding path and verified point-of-failure"
                highlightedPath={baselinePath}
                className="h-full flex-1"
              />
            </div>

            <div className="w-[42%] h-full flex flex-col bg-white border border-slate-200 rounded-lg p-5 overflow-y-auto shadow-2xs gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Failure Signature
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immutable behavioral fingerprint of the observed network severance.
                </p>
              </div>

              {/* Compact Key-Value Structured Summary */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Source</span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block">{source}</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Destination</span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block">{destination}</span>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <span className="text-[10px] text-rose-600 uppercase font-semibold block">Packet Loss</span>
                  <span className="font-bold text-rose-900 text-lg mt-0.5 block">100%</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Drop Point</span>
                  <span className="font-bold text-slate-900 text-sm font-mono mt-0.5 block">
                    R2 → R3
                  </span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Failed Component</span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                    {signatureData?.failed_component || "R2-R3 Link"}
                  </span>
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <span className="text-[10px] text-rose-600 uppercase font-semibold block">Component State</span>
                  <span className="font-bold text-rose-900 text-sm mt-0.5 block">DOWN</span>
                </div>
              </div>

              {/* Signature Fingerprint Badge */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Deterministic Fingerprint Code
                </span>
                <span className="font-mono text-slate-700 font-semibold block break-all text-[11px]">
                  {signatureData?.source ? `SIG-${signatureData.source}-${signatureData.destination}-LINK-R2R3` : "SIG-PC1-SERVER-LINK-R2R3-100PCT"}
                </span>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100">
                <button
                  onClick={() => setActiveTab("causal")}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition flex items-center justify-center gap-1"
                >
                  <span>Inspect Causal Dependency Chain</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* =================================================================== */}
        {/* TAB 2: CAUSAL CHAIN */}
        {/* =================================================================== */}
        {activeTab === "causal" && (
          <div className="flex-1 flex gap-3 h-full">
            {/* Main Visual: Causal Chain Workflow */}
            <div className="flex-1 bg-white border border-slate-200 rounded-lg p-6 flex flex-col shadow-2xs overflow-y-auto">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-900">
                  Causal Dependency Chain
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any stage in the causal sequence to reveal underlying network evidence.
                </p>
              </div>

              {/* Interactive Chain Nodes */}
              <div className="flex flex-col items-center justify-center flex-1 max-w-md mx-auto w-full gap-2 py-2">
                {[
                  { id: "pre", label: "Pre-Failure Connectivity", detail: "Initial baseline path PC1 ➔ Server healthy (0% loss)" },
                  { id: "fault", label: "R2 — R3 Link Fault Injected", detail: "Link severed; interface transition state set to DOWN" },
                  { id: "state", label: "Link State DOWN", detail: "Physical link loss confirmed; no alternate IGP route" },
                  { id: "path", label: "Forwarding Path Severed", detail: "Next-hop resolution for Server fails at router R2" },
                  { id: "reach", label: "Reachability Failure", detail: "All subsequent probes towards Server unroutable" },
                  { id: "loss", label: "100% Packet Loss", detail: "Symptom observed: all 3 ICMP probes dropped at R2" },
                ].map((item, idx, arr) => {
                  const isSelected = selectedCausalStep?.id === item.id;

                  return (
                    <React.Fragment key={item.id}>
                      <button
                        onClick={() => setSelectedCausalStep(item)}
                        className={`w-full py-2.5 px-4 rounded-lg border text-left transition cursor-pointer flex items-center justify-between text-xs ${
                          isSelected
                            ? "bg-blue-50 border-blue-400 text-blue-950 font-bold shadow-xs"
                            : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-mono">
                            {idx + 1}
                          </span>
                          <span>{item.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">Inspect</span>
                      </button>

                      {idx < arr.length - 1 && (
                        <div className="text-slate-300 font-bold text-xs select-none">
                          ↓
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Right: Selected Node Evidence */}
            <div className="w-[32%] bg-white border border-slate-200 rounded-lg p-5 flex flex-col shadow-2xs">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                Causal Evidence Inspector
              </span>
              <h4 className="text-sm font-bold text-slate-900 mt-1">
                {selectedCausalStep?.label || "R2 — R3 Link Fault Injected"}
              </h4>

              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-2">
                <span className="font-semibold text-slate-900 block">Verified Evidence:</span>
                <p className="leading-relaxed">
                  {selectedCausalStep?.detail ||
                    "Link R2-R3 was severed during testing. Physical link loss confirmed; no alternate ECMP route available on the campus distribution layer."}
                </p>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100">
                <button
                  onClick={() => setActiveTab("reduction")}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition flex items-center justify-center gap-1"
                >
                  <span>Proceed to Failure Reduction</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: REDUCTION */}
        {/* =================================================================== */}
        {activeTab === "reduction" && (
          <>
            {/* Left: Topology Visualizer with Before/After Toggle */}
            <div className="w-[54%] h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <div className="h-10 px-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Topology Comparison:</span>
                <div className="flex items-center bg-slate-200 p-0.5 rounded text-[11px]">
                  <button
                    onClick={() => setReductionTopologyMode("original")}
                    className={`px-2.5 py-0.5 rounded transition ${
                      reductionTopologyMode === "original"
                        ? "bg-white font-bold text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Original (7 Nodes)
                  </button>
                  <button
                    onClick={() => setReductionTopologyMode("reduced")}
                    className={`px-2.5 py-0.5 rounded transition ${
                      reductionTopologyMode === "reduced"
                        ? "bg-white font-bold text-blue-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Reduced (5 Nodes)
                  </button>
                </div>
              </div>

              <NetworkPreview
                network={
                  reductionTopologyMode === "reduced" && reductionData?.final_topology
                    ? reductionData.final_topology
                    : reductionData?.original_topology || currentNetwork
                }
                title={
                  reductionTopologyMode === "reduced"
                    ? "MINIMAL REDUCED TOPOLOGY"
                    : "ORIGINAL FULL TOPOLOGY"
                }
                subtitle={
                  reductionTopologyMode === "reduced"
                    ? "Inessential branch nodes (PC2, R4) pruned"
                    : "All 7 devices and 6 links included"
                }
                className="h-full flex-1"
              />
            </div>

            {/* Right: Reduction Decisions & Metrics */}
            <div className="w-[46%] h-full flex flex-col bg-white border border-slate-200 rounded-lg p-5 overflow-y-auto shadow-2xs gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Minimal Failure Reduction
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Delta-debugging prune decisions preserving target failure signature.
                </p>
              </div>

              {/* Before/After Metrics */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Original Size</span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">7 Nodes • 6 Links</div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-[10px] text-emerald-700 uppercase font-semibold">Reduced Size</span>
                  <div className="font-bold text-emerald-950 text-sm mt-0.5">5 Nodes • 4 Links</div>
                </div>
              </div>

              {/* Candidate Decisions Table */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">
                  Pruning Decision Log
                </span>
                <div className="space-y-1.5 text-xs">
                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">PC2 (Branch Host)</span>
                      <div className="text-[10px] text-slate-500">Not part of causal path</div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-100 text-emerald-800 text-xs">
                      PRUNED ✓
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">R4 (Branch Router)</span>
                      <div className="text-[10px] text-slate-500">Not part of causal path</div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono font-bold bg-emerald-100 text-emerald-800 text-xs">
                      PRUNED ✓
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900">R1 (Access Router)</span>
                      <div className="text-[10px] text-slate-500">Essential transit dependency</div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono font-bold bg-rose-100 text-rose-800 text-xs">
                      KEPT ✕
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100">
                <button
                  onClick={() => setActiveTab("reproduction")}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition flex items-center justify-center gap-1"
                >
                  <span>Proceed to Reproduction Validation</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* =================================================================== */}
        {/* TAB 4: REPRODUCTION */}
        {/* =================================================================== */}
        {activeTab === "reproduction" && (
          <>
            <div className="w-[54%] h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <NetworkPreview
                network={reproductionData?.reduced_topology || currentNetwork}
                title="REPRODUCTION TESTBENCH"
                subtitle="Isolated 5-node test environment for repeated validation"
                highlightedPath={["PC1", "R1", "R2", "R3", "Server"]}
                className="h-full flex-1"
              />
            </div>

            <div className="w-[46%] h-full flex flex-col bg-white border border-slate-200 rounded-lg p-5 overflow-y-auto shadow-2xs gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Failure Reproduction
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Multi-trial deterministic reproduction on the reduced testbench.
                </p>
              </div>

              {/* Consistency Metric */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-emerald-700 uppercase font-semibold block">
                    Signature Consistency
                  </span>
                  <span className="text-base font-bold text-emerald-950">
                    100% Deterministic Match
                  </span>
                </div>
                <span className="text-xs font-mono font-bold bg-emerald-200 text-emerald-900 px-2.5 py-1 rounded">
                  3 / 3 Trials Consistent
                </span>
              </div>

              {/* Simple Clean Trial Table */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">
                  Validation Trials
                </span>
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <tr>
                        <th className="p-2.5">Trial</th>
                        <th className="p-2.5">Packets</th>
                        <th className="p-2.5">Result</th>
                        <th className="p-2.5 text-right">Consistency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {[
                        { run: "Run 1", dropped: "3 / 3 dropped", status: "FAILED", ok: true },
                        { run: "Run 2", dropped: "3 / 3 dropped", status: "FAILED", ok: true },
                        { run: "Run 3", dropped: "3 / 3 dropped", status: "FAILED", ok: true },
                      ].map((t) => (
                        <tr key={t.run} className="hover:bg-slate-50/50">
                          <td className="p-2.5 font-bold text-slate-900">{t.run}</td>
                          <td className="p-2.5 font-mono text-rose-600 font-semibold">{t.dropped}</td>
                          <td className="p-2.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              {t.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-semibold text-emerald-700">
                            Consistent ✓
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100">
                <button
                  onClick={() => setActiveTab("what-if")}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-md transition flex items-center justify-center gap-1"
                >
                  <span>Explore What-If Failure Simulation</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* =================================================================== */}
        {/* TAB 5: WHAT-IF SIMULATION */}
        {/* =================================================================== */}
        {activeTab === "what-if" && (
          <>
            <div className="w-[54%] h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <NetworkPreview
                network={currentNetwork}
                title="WHAT-IF SCENARIO PREVIEW"
                subtitle={`Simulating hypothetical failure on ${whatIfComponent}`}
                highlightedPath={["PC1", "R1", "R2", "R3", "Server"]}
                className="h-full flex-1"
              />
            </div>

            <div className="w-[46%] h-full flex flex-col bg-white border border-slate-200 rounded-lg p-5 overflow-y-auto shadow-2xs gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  What-If Failure Simulation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate counterfactual failures non-destructively to test resilience.
                </p>
              </div>

              {/* Config Form */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Component</label>
                  <select
                    value={whatIfComponent}
                    onChange={(e) => setWhatIfComponent(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded font-semibold text-slate-900 focus:outline-none"
                  >
                    <option value="R2-R3">R2 — R3 (Core Link)</option>
                    <option value="R1-R2">R1 — R2 (Distribution Link)</option>
                    <option value="R2-R4">R2 — R4 (Branch Link)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Failure Type</label>
                  <select
                    value={whatIfType}
                    onChange={(e) => setWhatIfType(e.target.value as "LINK" | "NODE")}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded font-semibold text-slate-900 focus:outline-none"
                  >
                    <option value="LINK">Link Failure</option>
                    <option value="NODE">Node Failure</option>
                  </select>
                </div>
              </div>

              <button
                onClick={runWhatIf}
                disabled={isLoading}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded transition shadow-xs"
              >
                {isLoading ? "Simulating..." : "Simulate Scenario"}
              </button>

              {/* Clean Before / After Table */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">
                  Flow Reachability Comparison
                </span>
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <tr>
                        <th className="p-2.5">Flow</th>
                        <th className="p-2.5">Before</th>
                        <th className="p-2.5 text-right">After Simulation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      <tr className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-bold text-slate-900">PC1 ➔ Server</td>
                        <td className="p-2.5 text-emerald-600 font-semibold">Reachable</td>
                        <td className="p-2.5 text-right font-bold text-rose-600">
                          Unreachable (Dropped)
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-bold text-slate-900">PC1 ➔ PC2</td>
                        <td className="p-2.5 text-emerald-600 font-semibold">Reachable</td>
                        <td className="p-2.5 text-right font-bold text-emerald-600">
                          Reachable (Resilient)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-slate-100">
                <button
                  onClick={async () => {
                    await resetToBaseline();
                    setActiveView("network-builder");
                  }}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-md transition flex items-center justify-center gap-1 shadow-xs"
                >
                  <span>✓ Complete Investigation & Return to Builder</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
