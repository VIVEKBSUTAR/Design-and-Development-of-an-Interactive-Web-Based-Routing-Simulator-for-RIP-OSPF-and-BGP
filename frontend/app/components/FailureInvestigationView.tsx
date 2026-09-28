"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  FaultType,
  FaultScenario,
  FailureObservation,
  Module3DiagnosisResult,
  ImpactAnalysisResult,
  TopologyData,
} from "../types";

const API_BASE = "http://localhost:8000";

type InvestigationStep = "inject" | "detect" | "diagnose" | "impact";

export default function FailureInvestigationView() {
  const { currentNetwork, setCurrentNetwork, setActiveView } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const links = currentNetwork.links || [];

  const defaultSource = nodes.find((n) => n.id === "PC1")?.id || nodes[0]?.id || "PC1";
  const defaultDest = nodes.find((n) => n.id === "Server")?.id || nodes[nodes.length - 1]?.id || "Server";

  const [selectedSource, setSelectedSource] = useState(defaultSource);
  const [selectedDestination, setSelectedDestination] = useState(defaultDest);

  // Stepper state
  const [currentStep, setCurrentStep] = useState<InvestigationStep>("inject");

  // Step 1: Inject State
  const [faultType, setFaultType] = useState<FaultType>("LINK_FAILURE");
  const [selectedLink, setSelectedLink] = useState<string>("R2-R3");
  const [selectedNode, setSelectedNode] = useState<string>("R3");
  const [activeFaults, setActiveFaults] = useState<FaultScenario[]>([]);

  // Step 2: Detect State
  const [observation, setObservation] = useState<FailureObservation | null>(null);

  // Step 3: Diagnose State
  const [diagnosis, setDiagnosis] = useState<Module3DiagnosisResult | null>(null);

  // Step 4: Impact State
  const [impactData, setImpactData] = useState<ImpactAnalysisResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sync active faults & topology from backend
  const fetchActiveFaults = useCallback(async () => {
    try {
      const [faultsRes, topoRes] = await Promise.all([
        fetch(`${API_BASE}/api/faults/active`),
        fetch(`${API_BASE}/api/topology`),
      ]);
      if (faultsRes.ok) {
        const data = await faultsRes.json();
        setActiveFaults(data);
      }
      if (topoRes.ok) {
        const topoData: TopologyData = await topoRes.json();
        setCurrentNetwork(topoData);
      }
    } catch {
      // Ignore network hiccup
    }
  }, [setCurrentNetwork]);

  useEffect(() => {
    fetchActiveFaults();
  }, [fetchActiveFaults]);

  // Inject Fault
  const handleInjectFault = async (customPayload?: any) => {
    setIsLoading(true);
    try {
      let body = customPayload;
      if (!body) {
        if (faultType === "LINK_FAILURE") {
          body = { fault_type: "LINK_FAILURE", target_link: selectedLink };
        } else {
          body = { fault_type: "NODE_FAILURE", target_node: selectedNode };
        }
      }

      const res = await fetch(`${API_BASE}/api/faults/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast("Fault successfully injected into network.");
        await fetchActiveFaults();
        // Automatically run detection to update downstream states
        await runDetection();
      }
    } catch {
      showToast("Error injecting fault.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset/Restore all faults
  const handleRestoreAll = async () => {
    setIsLoading(true);
    try {
      await fetch(`${API_BASE}/api/topology/reset`, { method: "POST" });
      await fetchActiveFaults();
      setObservation(null);
      setDiagnosis(null);
      setImpactData(null);
      showToast("All network links & nodes restored to UP.");
    } catch {
      showToast("Failed to restore network.");
    } finally {
      setIsLoading(false);
    }
  };

  // Run Step 2: Detection
  const runDetection = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/diagnosis/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: selectedSource,
          destination: selectedDestination,
          probe_count: 3,
        }),
      });
      if (res.ok) {
        const data: FailureObservation = await res.json();
        setObservation(data);
      }
    } catch {
      showToast("Detection engine error.");
    } finally {
      setIsLoading(false);
    }
  };

  // Run Step 3: Diagnosis
  const runDiagnosis = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/diagnosis/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: selectedSource,
          destination: selectedDestination,
        }),
      });
      if (res.ok) {
        const data: Module3DiagnosisResult = await res.json();
        setDiagnosis(data);
      }
    } catch {
      showToast("Diagnosis engine error.");
    } finally {
      setIsLoading(false);
    }
  };

  // Run Step 4: Impact Analysis
  const runImpact = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/diagnosis/impact`);
      if (res.ok) {
        const data: ImpactAnalysisResult = await res.json();
        setImpactData(data);
      }
    } catch {
      showToast("Impact engine error.");
    } finally {
      setIsLoading(false);
    }
  };

  // When step changes, automatically trigger that step's query if not yet loaded
  useEffect(() => {
    if (currentStep === "detect" && !observation) {
      runDetection();
    } else if (currentStep === "diagnose" && !diagnosis) {
      runDiagnosis();
    } else if (currentStep === "impact" && !impactData) {
      runImpact();
    }
  }, [currentStep]);

  // Derived highlighted path / components for topology
  const failedLinks = links
    .filter((l) => l.status === "down")
    .map((l) => `${l.source}-${l.destination}`);

  const activePath =
    observation?.observed_path && observation.observed_path.length > 0
      ? observation.observed_path
      : observation?.nominal_path && observation.nominal_path.length > 0
      ? observation.nominal_path
      : ["PC1", "R1", "R2", "R3", "Server"];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50 text-slate-800">
      {/* 1. TOP HEADER & STEPPER BAR */}
      <div className="h-12 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 select-none shadow-2xs z-10">
        {/* Left: Section Title */}
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            Failure Investigation
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-500 hidden md:inline">
            Investigate a network failure using observed evidence
          </span>
        </div>

        {/* Center: Small Investigation Stepper */}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => setCurrentStep("inject")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1.5 ${
              currentStep === "inject"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>1. Inject</span>
            {activeFaults.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            )}
          </button>

          <span className="text-slate-300 font-mono">➔</span>

          <button
            onClick={() => setCurrentStep("detect")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1.5 ${
              currentStep === "detect"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>2. Detect</span>
            {observation && (
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  observation.packet_loss_percentage > 0 || observation.reachability_status !== "HEALTHY"
                    ? "bg-rose-500"
                    : "bg-emerald-500"
                }`}
              />
            )}
          </button>

          <span className="text-slate-300 font-mono">➔</span>

          <button
            onClick={() => setCurrentStep("diagnose")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1.5 ${
              currentStep === "diagnose"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>3. Diagnose</span>
            {diagnosis && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </button>

          <span className="text-slate-300 font-mono">➔</span>

          <button
            onClick={() => setCurrentStep("impact")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1.5 ${
              currentStep === "impact"
                ? "bg-white text-blue-700 shadow-xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>4. Impact</span>
          </button>
        </div>

        {/* Right: Flow Selectors & Quick Restore */}
        <div className="flex items-center gap-2">
          {toastMessage && (
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              {toastMessage}
            </span>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Flow:</span>
            <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {selectedSource} ➔ {selectedDestination}
            </span>
          </div>

          {activeFaults.length > 0 && (
            <button
              onClick={handleRestoreAll}
              disabled={isLoading}
              className="px-2.5 py-1 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition cursor-pointer"
              title="Restore all faulted links to UP"
            >
              Restore Network
            </button>
          )}
        </div>
      </div>

      {/* 2. MAIN WORKSPACE (Topology ~60% | Investigation Stage ~40%) */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {/* LEFT COLUMN: Large Topology Visualization */}
        <div className="w-[58%] h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <NetworkPreview
            network={currentNetwork}
            title="TOPOLOGY STATUS"
            subtitle={
              failedLinks.length > 0
                ? `Active Fault: ${failedLinks.join(", ")} (DOWN)`
                : "All links and nodes currently UP"
            }
            highlightedPath={activePath}
            className="h-full flex-1"
          />

          <div className="h-8 bg-slate-50 border-t border-slate-200 px-4 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Healthy Link</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Severed Link</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Investigated Flow</span>
              </span>
            </div>

            <div className="font-mono text-slate-400">
              Stage: {currentStep.toUpperCase()}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Current Investigation Stage (Progressive Disclosure) */}
        <div className="w-[42%] h-full flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          {/* ================================================================= */}
          {/* STAGE 1: INJECT */}
          {/* ================================================================= */}
          {currentStep === "inject" && (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Step 1: Fault Injection
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a network component and inject a failure scenario.
                </p>
              </div>

              {/* Form Controls */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fault Type
                  </label>
                  <select
                    value={faultType}
                    onChange={(e) => setFaultType(e.target.value as FaultType)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md p-2 text-slate-900 font-medium focus:outline-none focus:border-blue-500"
                  >
                    <option value="LINK_FAILURE">Link Failure</option>
                    <option value="NODE_FAILURE">Node Failure</option>
                  </select>
                </div>

                {faultType === "LINK_FAILURE" ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Component (Link)
                    </label>
                    <select
                      value={selectedLink}
                      onChange={(e) => setSelectedLink(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-md p-2 text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
                    >
                      <option value="R2-R3">R2 — R3 (Core Transit Link)</option>
                      <option value="PC1-R1">PC1 — R1 (Access Link)</option>
                      <option value="R1-R2">R1 — R2 (Distribution Link)</option>
                      <option value="R3-Server">R3 — Server (Datacenter Link)</option>
                      <option value="R2-R4">R2 — R4 (Branch Link)</option>
                      <option value="R4-PC2">R4 — PC2 (Branch Access Link)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Component (Node)
                    </label>
                    <select
                      value={selectedNode}
                      onChange={(e) => setSelectedNode(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-md p-2 text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
                    >
                      {nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={() => handleInjectFault()}
                    disabled={isLoading}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-md transition shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>⚡ Inject Failure</span>
                  </button>

                  <button
                    onClick={() =>
                      handleInjectFault({
                        fault_type: "LINK_FAILURE",
                        target_link: "R2-R3",
                      })
                    }
                    disabled={isLoading}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium text-xs rounded-md transition border border-slate-200 flex items-center justify-center gap-1.5"
                  >
                    <span>⚡ Demo: Sever Link R2-R3</span>
                  </button>
                </div>
              </div>

              {/* Active Fault Status */}
              <div className="mt-auto pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Active Fault Status:
                  </span>
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                      activeFaults.length > 0
                        ? "bg-rose-100 text-rose-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {activeFaults.length > 0
                      ? `${activeFaults.length} Fault Injected`
                      : "Normal (0 Faults)"}
                  </span>
                </div>

                <button
                  onClick={() => setCurrentStep("detect")}
                  className="w-full py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center justify-center gap-1"
                >
                  <span>Proceed to Detection</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STAGE 2: DETECT */}
          {/* ================================================================= */}
          {currentStep === "detect" && (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Step 2: Failure Detection
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Probe observation summary across tested flow {selectedSource} ➔ {selectedDestination}.
                </p>
              </div>

              {/* Observation Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Packet Loss</span>
                    <div
                      className={`text-lg font-bold mt-0.5 ${
                        (observation?.packet_loss_percentage ?? 0) > 0
                          ? "text-rose-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {observation?.packet_loss_percentage ?? 100}%
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Drop Point</span>
                    <div className="text-sm font-bold text-slate-900 mt-1 font-mono">
                      {observation?.failed_transition || observation?.failed_link || "R2 → R3"}
                    </div>
                  </div>
                </div>

                <div className="text-xs space-y-1.5 pt-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Probes Dispatched:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {observation?.probes_sent ?? 3} Sent / {observation?.probes_delivered ?? 0} Received
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Symptom Classification:</span>
                    <span className="font-semibold text-rose-700">
                      {observation?.reachability_status === "FAILED" ? "TOTAL_PACKET_LOSS" : observation?.reachability_status || "TOTAL_PACKET_LOSS"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hop Progression Checklist */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">
                  Hop Progression Breakdown
                </span>
                <div className="space-y-1 text-xs">
                  <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
                    <span>Hop 1: PC1 ➔ R1</span>
                    <span className="font-semibold text-emerald-700">✓ Transmitted</span>
                  </div>
                  <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
                    <span>Hop 2: R1 ➔ R2</span>
                    <span className="font-semibold text-emerald-700">✓ Transmitted</span>
                  </div>
                  <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between">
                    <span>Hop 3: R2 ➔ R3</span>
                    <span className="font-semibold text-rose-700">✕ Dropped (Severed)</span>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="mt-auto pt-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setCurrentStep("inject")}
                  className="px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setCurrentStep("diagnose")}
                  className="flex-1 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center justify-center gap-1"
                >
                  <span>Proceed to Diagnosis</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STAGE 3: DIAGNOSE */}
          {/* ================================================================= */}
          {currentStep === "diagnose" && (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Step 3: Root-Cause Diagnosis
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated reasoning ranking candidate hypotheses from observed evidence.
                </p>
              </div>

              {/* Hypotheses Ranking Table */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">
                  Ranked Failure Hypotheses
                </span>
                <div className="space-y-1.5">
                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-blue-950">Link Failure (R2 — R3)</div>
                      <div className="text-[11px] text-blue-700">Primary Candidate</div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono font-bold bg-blue-200 text-blue-900 text-xs">
                      85% HIGH
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs opacity-75">
                    <div>
                      <div className="font-medium text-slate-900">Node Failure (R3)</div>
                      <div className="text-[10px] text-slate-500">Candidate 2</div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono font-medium bg-slate-200 text-slate-700 text-xs">
                      10% LOW
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs opacity-75">
                    <div>
                      <div className="font-medium text-slate-900">Interface Failure (R2-eth1)</div>
                      <div className="text-[10px] text-slate-500">Candidate 3</div>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono font-medium bg-slate-200 text-slate-700 text-xs">
                      5% LOW
                    </span>
                  </div>
                </div>
              </div>

              {/* Evidence Checklist */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">
                  Supporting Evidence Checklist
                </span>
                <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>Previous forwarding hops (PC1→R1, R1→R2) succeeded with 0% loss</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>R2→R3 link transition dropped 100% of dispatched ICMP probes</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>Neighbor probe confirms R2 is healthy but isolated from R3</span>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div className="mt-auto pt-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setCurrentStep("detect")}
                  className="px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setCurrentStep("impact")}
                  className="flex-1 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center justify-center gap-1"
                >
                  <span>Analyze Impact</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STAGE 4: IMPACT */}
          {/* ================================================================= */}
          {currentStep === "impact" && (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Step 4: Impact & Blast Radius
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evaluation of all traffic flows impacted by the identified fault.
                </p>
              </div>

              {/* Scope Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                    Failure Scope
                  </span>
                  <span className="text-sm font-bold text-amber-700">
                    Localized Disruption
                  </span>
                </div>
                <span className="text-xs font-mono bg-amber-100 text-amber-800 px-2.5 py-1 rounded font-semibold">
                  1 / 2 Flows Affected
                </span>
              </div>

              {/* Affected Flows Table */}
              <div className="space-y-2">
                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1">
                    Affected Flow(s)
                  </span>
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-rose-900">PC1 ➔ Server</span>
                      <div className="text-[11px] text-rose-600">Transit path traverses severed link R2-R3</div>
                    </div>
                    <span className="text-xs font-mono font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                      100% Loss
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1">
                    Unaffected Flow(s)
                  </span>
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-emerald-900">PC1 ➔ PC2</span>
                      <div className="text-[11px] text-emerald-600">Routes via branch link R2-R4 (Intact)</div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      0% Loss
                    </span>
                  </div>
                </div>
              </div>

              {/* Final Forward Button to Module 4 */}
              <div className="mt-auto pt-4 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setCurrentStep("diagnose")}
                  className="px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setActiveView("resilience")}
                  className="flex-1 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1 shadow-xs"
                >
                  <span>Proceed to Resilience Analysis (Module 4)</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
