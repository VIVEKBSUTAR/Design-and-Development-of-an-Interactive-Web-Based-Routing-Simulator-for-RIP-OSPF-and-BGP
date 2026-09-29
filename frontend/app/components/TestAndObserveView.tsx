"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import NetworkPreview from "./NetworkPreview";
import ResearchModal from "./ResearchModal";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  TestCampaign,
  NetworkTestDefinition,
  TestResult,
  CompleteExperimentResponse,
  ProbeEvent,
} from "../types";

const API_BASE = "http://localhost:8000";

export default function TestAndObserveView() {
  const { currentNetwork, currentRevision, setActiveView, setCurrentNetwork } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const links = currentNetwork.links || [];

  // Default endpoints
  const defaultSource = nodes.find((n) => n.id === "PC1")?.id || nodes[0]?.id || "PC1";
  const defaultDest = nodes.find((n) => n.id === "Server")?.id || nodes[nodes.length - 1]?.id || "Server";

  const [selectedSource] = useState(defaultSource);
  const [selectedDestination] = useState(defaultDest);
  const [mode, setMode] = useState<"automated" | "manual">("automated");

  // Secondary panel view: history vs library vs none
  const [secondaryTab, setSecondaryTab] = useState<"history" | "library">("history");
  const [showEvidenceDetails, setShowEvidenceDetails] = useState(false);

  // Campaign state
  const [campaign, setCampaign] = useState<TestCampaign | null>(null);
  const [testLibrary, setTestLibrary] = useState<NetworkTestDefinition[]>([]);
  const [selectedTestIndex, setSelectedTestIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const autoRunRef = useRef(false);

  // Research modal state
  const [isResearchModalOpen, setIsResearchModalOpen] = useState(false);
  const [experimentData, setExperimentData] = useState<CompleteExperimentResponse | null>(null);
  const [isRunningExperiment, setIsRunningExperiment] = useState(false);

  // Status feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Fetch Test Library
  const fetchLibrary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/orchestration/library`);
      if (res.ok) {
        const data = await res.json();
        setTestLibrary(data);
      }
    } catch (err) {
      console.error("Failed to fetch test library:", err);
    }
  }, []);

  // 2. Initialize or fetch current Campaign
  const initCampaign = useCallback(async (src = selectedSource, dst = selectedDestination) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/orchestration/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Campus Network Resilience",
          source: src,
          destination: dst,
          mode: mode,
        }),
      });
      if (res.ok) {
        const data: TestCampaign = await res.json();
        setCampaign(data);
        if (data.executed_tests.length > 0) {
          setSelectedTestIndex(data.executed_tests.length - 1);
        } else {
          setSelectedTestIndex(null);
        }
      }
    } catch (err) {
      console.error("Failed to initialize campaign:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSource, selectedDestination, mode]);

  useEffect(() => {
    fetchLibrary();
    initCampaign();
  }, [fetchLibrary, initCampaign]);

  // 3. Execute Next Campaign Step (Automated or Manual override)
  const handleExecuteStep = async (overrideTestId?: string, params?: Record<string, any>) => {
    if (!campaign) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/orchestration/campaigns/${campaign.id}/step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_id: overrideTestId || undefined,
          parameters: params || undefined,
        }),
      });

      if (res.ok) {
        const updated: TestCampaign = await res.json();
        setCampaign(updated);
        setSelectedTestIndex(updated.executed_tests.length - 1);
        const lastTest = updated.executed_tests[updated.executed_tests.length - 1];
        if (lastTest) {
          showToast(`Executed: ${lastTest.name} (${lastTest.status})`);
        }
        return updated;
      }
    } catch (err) {
      console.error("Error executing step:", err);
    } finally {
      setIsLoading(false);
    }
    return null;
  };

  // 4. Auto-Run Campaign (runs step-by-step with delay)
  const handleStartAutoRun = async () => {
    if (!campaign || isAutoRunning) return;
    setIsAutoRunning(true);
    autoRunRef.current = true;

    let currentCamp = campaign;
    while (autoRunRef.current && currentCamp && currentCamp.next_test_recommendation && currentCamp.status !== "COMPLETED") {
      const updated = await handleExecuteStep();
      if (!updated || !updated.next_test_recommendation || updated.status === "COMPLETED") {
        break;
      }
      currentCamp = updated;
      await new Promise((r) => setTimeout(r, 650));
    }

    setIsAutoRunning(false);
    autoRunRef.current = false;
  };

  const handleStopAutoRun = () => {
    autoRunRef.current = false;
    setIsAutoRunning(false);
  };

  // 5. Reset Campaign
  const handleResetCampaign = async () => {
    if (!campaign) return;
    handleStopAutoRun();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/orchestration/campaigns/${campaign.id}/reset`, {
        method: "POST",
      });
      if (res.ok) {
        const updated = await res.json();
        setCampaign(updated);
        setSelectedTestIndex(null);
        showToast("Campaign reset to initial baseline state.");
      }
    } catch (err) {
      console.error("Failed to reset campaign:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Controlled Fault Injection Toggle (Sever / Restore R2-R3 link)
  const isR2R3Down = links.some(
    (l) =>
      ((l.source === "R2" && l.destination === "R3") || (l.source === "R3" && l.destination === "R2")) &&
      l.status === "down"
  );

  const handleToggleR2R3Fault = async () => {
    setIsLoading(true);
    const endpoint = isR2R3Down ? "/api/topology/restore-link" : "/api/topology/fail-link";
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "R2", destination: "R3" }),
      });
      if (res.ok) {
        // Refresh active topology
        const topRes = await fetch(`${API_BASE}/api/topology`);
        if (topRes.ok) {
          const newTop = await topRes.json();
          setCurrentNetwork(newTop);
        }
        showToast(isR2R3Down ? "Link R2-R3 restored to UP." : "CONTROLLED FAULT: Link R2-R3 severed (DOWN).");
      }
    } catch (err) {
      console.error("Fault toggle failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 7. Research Pipeline Modal Handoff
  const handleRunFullExperiment = async () => {
    setIsRunningExperiment(true);
    setIsResearchModalOpen(true);
    try {
      const res = await fetch(`${API_BASE}/api/experiment/run`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setExperimentData(data);
      }
    } catch (err) {
      console.error("Experiment failed:", err);
    } finally {
      setIsRunningExperiment(false);
    }
  };

  // Current active / selected test result
  const executedCount = campaign?.executed_tests.length || 0;
  const currentTestResult: TestResult | null =
    campaign && executedCount > 0
      ? selectedTestIndex !== null && campaign.executed_tests[selectedTestIndex]
        ? campaign.executed_tests[selectedTestIndex]
        : campaign.executed_tests[executedCount - 1]
      : null;

  // Active events from selected test simulation
  const timelineEvents: ProbeEvent[] = currentTestResult?.simulation_result?.all_events || [];

  // Determine if failure was detected
  const isFailureDetected =
    currentTestResult?.failure_detected ||
    currentTestResult?.status === "FAILED" ||
    (currentTestResult?.simulation_result?.packet_loss_percentage ?? 0) > 0 ||
    Boolean(campaign?.failure_handoff);

  // Next recommendation from campaign or fallback
  const nextRec = campaign?.next_test_recommendation;

  // Next test display details
  const nextTestName = nextRec?.name || (executedCount === 0 ? "Baseline Connectivity" : "Primary Path Analysis");
  const nextTestReason = nextRec?.reason || (executedCount === 0
    ? "Establish baseline end-to-end connectivity and measure packet delivery and latency."
    : "Baseline connectivity succeeded. Analyze the active forwarding path.");

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-50 text-slate-800">
      {/* =================================================================== */}
      {/* 1. TOP HEADER BAR */}
      {/* =================================================================== */}
      <div className="h-12 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 select-none shadow-2xs z-10">
        {/* Left: View Identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span className="font-bold text-sm text-slate-900 tracking-tight">
              Test & Observe
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-500 hidden md:inline">
            Run network tests and observe system behavior
          </span>
        </div>

        {/* Center: Mode Switch (Automated / Manual) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
          <button
            onClick={() => setMode("automated")}
            className={`px-3 py-1 rounded font-medium text-[11px] transition cursor-pointer flex items-center gap-1.5 ${
              mode === "automated"
                ? "bg-white text-blue-700 font-semibold shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Automated</span>
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`px-3 py-1 rounded font-medium text-[11px] transition cursor-pointer flex items-center gap-1.5 ${
              mode === "manual"
                ? "bg-white text-blue-700 font-semibold shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Manual</span>
          </button>
        </div>

        {/* Right: Flow & Feedback */}
        <div className="flex items-center gap-3">
          {toastMessage && (
            <div className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded animate-in fade-in duration-150">
              {toastMessage}
            </div>
          )}

          <div className="text-xs text-slate-500 font-mono hidden sm:flex items-center gap-1.5">
            <span>Target:</span>
            <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {selectedSource} ➔ {selectedDestination}
            </span>
          </div>

          {/* Quick Handoff shortcut if failure observed */}
          {isFailureDetected && (
            <button
              onClick={() => setActiveView("diagnosis")}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded transition flex items-center gap-1 shadow-xs animate-pulse"
              title="Navigate to Failure Investigation module"
            >
              <span>Investigate Failure ➔</span>
            </button>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. MAIN WORKSPACE (Left ~62% Topology & Timeline | Right ~38% Focused Test) */}
      {/* =================================================================== */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {/* ================================================================= */}
        {/* LEFT COLUMN: Network Topology (Top) + Live Probe Timeline (Bottom) */}
        {/* ================================================================= */}
        <div className="w-[62%] h-full flex flex-col gap-3 min-w-0">
          {/* Top: Large Network Topology Preview */}
          <div className="flex-1 min-h-[300px] bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs flex flex-col">
            <div className="h-8 px-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-xs shrink-0 select-none">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 tracking-tight">Network Topology</span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {nodes.length} Devices • {links.length} Links
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                {isR2R3Down ? (
                  <span className="flex items-center gap-1.5 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                    <span>Link R2-R3 DOWN</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>All Up</span>
                  </span>
                )}
              </div>
            </div>

            <NetworkPreview
              network={currentNetwork}
              title=""
              subtitle=""
              highlightedPath={currentTestResult?.observed_path || ["PC1", "R1", "R2", "R3", "Server"]}
              className="h-full flex-1"
            />
          </div>

          {/* Bottom: Live Probe / Packet Events Timeline */}
          <div className="h-[210px] bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col min-h-0 shadow-2xs shrink-0">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span className="text-xs font-bold text-slate-900 tracking-tight">
                  LIVE PROBE / PACKET EVENTS
                </span>
              </div>

              {currentTestResult && (
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      currentTestResult.status === "PASSED"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {currentTestResult.status === "PASSED" ? "PASS" : "FAILURE DETECTED"} ({currentTestResult.actual_result})
                  </span>
                </div>
              )}
            </div>

            {/* Event List or Empty State */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
              {timelineEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs italic gap-1">
                  <span>No probe simulation events yet. Click &quot;Execute Test&quot; to observe packets.</span>
                </div>
              ) : (
                timelineEvents.map((evt) => (
                  <div
                    key={`${evt.sequence}-${evt.packet_id}`}
                    className={`p-1.5 px-2.5 rounded border flex items-center justify-between text-xs transition ${
                      evt.event_type === "DROPPED"
                        ? "bg-rose-50 border-rose-200 text-rose-900"
                        : evt.event_type === "RECEIVED"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 w-10 shrink-0">
                        +{evt.timestamp_ms}ms
                      </span>
                      <span className="font-semibold text-slate-900">
                        {evt.current_node} {evt.next_node ? `➔ ${evt.next_node}` : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 hidden sm:inline">
                        {evt.details}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                          evt.event_type === "DROPPED"
                            ? "bg-rose-200 text-rose-800"
                            : evt.event_type === "RECEIVED"
                            ? "bg-emerald-200 text-emerald-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {evt.event_type === "DROPPED" ? "✕ DROPPED" : evt.event_type === "RECEIVED" ? "✓ RECEIVED" : "➔ FORWARD"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN: Focused Next Test / Result Panel + Secondary Tabs */}
        {/* ================================================================= */}
        <div className="w-[38%] h-full flex flex-col gap-3 min-w-0">
          {/* --------------------------------------------------------------- */}
          {/* PRIMARY PANEL: NEXT TEST or TEST RESULT */}
          {/* --------------------------------------------------------------- */}
          <div className="flex-1 bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between shadow-2xs overflow-y-auto">
            <div className="flex flex-col gap-3.5">
              {/* Header Label: Test Result or Next Test */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      currentTestResult ? "bg-emerald-600" : "bg-blue-600"
                    }`}
                  />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                    {currentTestResult ? "CURRENT TEST RESULT" : "NEXT TEST"}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                    currentTestResult
                      ? currentTestResult.status === "PASSED"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                      : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {currentTestResult
                    ? currentTestResult.status === "PASSED"
                      ? "● PASS"
                      : "● FAILURE DETECTED"
                    : "READY"}
                </span>
              </div>

              {/* CASE A: SHOW TEST RESULT (If a test was executed) */}
              {currentTestResult ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {currentTestResult.name}
                    </h3>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      Flow: {currentTestResult.source} ➔ {currentTestResult.destination}
                    </div>
                  </div>

                  {/* Clean Result Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">Packets</span>
                      <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                        {currentTestResult.simulation_result?.probes_received ?? (currentTestResult.status === "PASSED" ? 3 : 0)} / {currentTestResult.simulation_result?.probes_sent ?? 3}
                      </span>
                    </div>

                    <div className={`p-2.5 rounded-lg border text-center ${
                      (currentTestResult.simulation_result?.packet_loss_percentage ?? (currentTestResult.status === "PASSED" ? 0 : 100)) > 0
                        ? "bg-rose-50 border-rose-200 text-rose-900"
                        : "bg-emerald-50 border-emerald-200 text-emerald-900"
                    }`}>
                      <span className="text-[10px] uppercase font-semibold block opacity-75">Packet Loss</span>
                      <span className="text-sm font-bold mt-0.5 block">
                        {currentTestResult.simulation_result?.packet_loss_percentage ?? (currentTestResult.status === "PASSED" ? 0 : 100)}%
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-500 block uppercase font-semibold">
                        {isFailureDetected ? "Drop Point" : "Avg RTT"}
                      </span>
                      <span className="text-sm font-bold text-slate-900 mt-0.5 block font-mono">
                        {isFailureDetected
                          ? (campaign?.failure_handoff?.drop_link || "R2 → R3")
                          : (currentTestResult.simulation_result?.avg_rtt_ms ? `~${Math.round(currentTestResult.simulation_result.avg_rtt_ms)}ms` : "~42ms")}
                      </span>
                    </div>
                  </div>

                  {/* Failure Handoff Banner (if failure occurred) */}
                  {isFailureDetected ? (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1 mt-1">
                      <div className="flex items-center justify-between font-bold">
                        <span>FAILURE DETECTED</span>
                        <span className="font-mono text-[10px] text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                          Link R2-R3
                        </span>
                      </div>
                      <p className="text-[11px] text-rose-800">
                        Communication severed at R2 ➔ R3 transition. Empirical evidence is ready for diagnosis.
                      </p>
                    </div>
                  ) : null}

                  {/* Transition to Next Test (if more tests exist in campaign) */}
                  {nextRec && campaign?.status !== "COMPLETED" && (
                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-semibold uppercase font-mono">
                          Up Next:
                        </span>
                        <span className="text-blue-700 font-medium font-mono text-[10px]">
                          Confidence: {nextRec.confidence}
                        </span>
                      </div>
                      <div className="font-bold text-xs text-slate-800">
                        {nextRec.name}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {nextRec.reason}
                      </p>

                      {/* Expandable Evidence toggle */}
                      {nextRec.evidence && nextRec.evidence.length > 0 && (
                        <div className="pt-0.5">
                          <button
                            onClick={() => setShowEvidenceDetails((prev) => !prev)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                          >
                            {showEvidenceDetails ? "Hide Evidence ▴" : "View Evidence ▾"}
                          </button>
                          {showEvidenceDetails && (
                            <div className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 space-y-0.5">
                              {nextRec.evidence.map((ev, i) => (
                                <div key={i}>✓ {ev}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* CASE B: INITIAL READY STATE (No test executed yet) */
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">
                      {nextTestName}
                    </h3>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      Target Flow: {selectedSource} ➔ {selectedDestination}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                    &quot;{nextTestReason}&quot;
                  </p>

                  <div className="text-[11px] text-slate-400 italic">
                    No previous tests executed in this session.
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions of Primary Panel */}
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              {/* If Failure Detected: Offer Direct Handoff to Diagnosis */}
              {isFailureDetected ? (
                <button
                  onClick={() => setActiveView("diagnosis")}
                  className="w-full py-2.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span>Investigate Failure</span>
                  <span>➔</span>
                </button>
              ) : null}

              {/* Main Execution Button */}
              {campaign?.status !== "COMPLETED" && (
                <button
                  onClick={() => handleExecuteStep()}
                  disabled={isLoading || isAutoRunning}
                  className="w-full py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>
                    {executedCount === 0 ? "Execute Test" : "Continue to Next Test"}
                  </span>
                </button>
              )}

              {/* Secondary Controls (Subtle & Compact) */}
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  onClick={isAutoRunning ? handleStopAutoRun : handleStartAutoRun}
                  disabled={isLoading || campaign?.status === "COMPLETED"}
                  className="text-slate-600 hover:text-slate-900 text-[11px] font-medium transition cursor-pointer"
                >
                  {isAutoRunning ? "⏸ Pause Auto-Run" : "▶ Auto Run All"}
                </button>

                <button
                  onClick={handleResetCampaign}
                  disabled={isLoading || isAutoRunning}
                  className="text-slate-400 hover:text-slate-700 text-[11px] transition cursor-pointer"
                >
                  Reset Campaign
                </button>
              </div>

              {/* Auto Run Progress Mini-Stepper (only if active) */}
              {isAutoRunning && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-900 flex items-center justify-between animate-pulse">
                  <span>Auto-stepping through campaign...</span>
                  <span className="font-mono font-bold">Step #{executedCount + 1}</span>
                </div>
              )}
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* CONTROLLED TEST CONDITION PANEL (Visually distinct fault action) */}
          {/* --------------------------------------------------------------- */}
          <div className="bg-slate-50/80 border border-dashed border-slate-300 rounded-lg p-3 flex items-center justify-between text-xs shrink-0 select-none">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider">
                CONTROLLED TEST CONDITION
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono font-bold text-slate-800">Link: R2 ↔ R3</span>
                <span className="text-slate-300">•</span>
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                    isR2R3Down
                      ? "bg-rose-100 text-rose-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {isR2R3Down ? "DOWN" : "UP"}
                </span>
              </div>
            </div>

            <button
              onClick={handleToggleR2R3Fault}
              disabled={isLoading}
              className={`px-3 py-1.5 rounded text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                isR2R3Down
                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                  : "bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isR2R3Down ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span>{isR2R3Down ? "Restore Link R2-R3" : "Sever Link R2-R3"}</span>
            </button>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECONDARY SECTION: TABS FOR TEST HISTORY & TEST LIBRARY */}
          {/* --------------------------------------------------------------- */}
          <div className="h-[210px] bg-white border border-slate-200 rounded-lg flex flex-col min-h-0 shadow-2xs shrink-0 overflow-hidden">
            {/* Tab Switcher */}
            <div className="h-8 border-b border-slate-200 bg-slate-50 px-3 flex items-center justify-between text-xs select-none shrink-0">
              <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded text-[11px]">
                <button
                  onClick={() => setSecondaryTab("history")}
                  className={`px-2.5 py-0.5 rounded transition cursor-pointer font-medium ${
                    secondaryTab === "history"
                      ? "bg-white text-slate-900 font-bold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Test History ({executedCount})
                </button>
                <button
                  onClick={() => setSecondaryTab("library")}
                  className={`px-2.5 py-0.5 rounded transition cursor-pointer font-medium ${
                    secondaryTab === "library"
                      ? "bg-white text-slate-900 font-bold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Test Library ({testLibrary.length})
                </button>
              </div>

              <span className="text-[10px] text-slate-400 font-mono">
                {secondaryTab === "history" ? "Click to inspect" : "On-demand execution"}
              </span>
            </div>

            {/* Subtab Content: Test History */}
            {secondaryTab === "history" && (
              <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
                {executedCount === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                    No tests executed yet.
                  </div>
                ) : (
                  campaign?.executed_tests.map((t, idx) => {
                    const isSelected = selectedTestIndex === idx;
                    const isPass = t.status === "PASSED";

                    return (
                      <div
                        key={`${t.test_id}-${t.sequence_number}`}
                        onClick={() => setSelectedTestIndex(idx)}
                        className={`p-2 rounded border flex items-center justify-between transition cursor-pointer text-xs ${
                          isSelected
                            ? "bg-blue-50 border-blue-300 font-semibold"
                            : "bg-slate-50/60 hover:bg-slate-100 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                            isPass ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
                            {isPass ? "✓" : "✗"}
                          </span>
                          <span className="truncate">{t.name}</span>
                        </div>

                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                            isPass ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {isPass ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Subtab Content: Test Library (All 6 Network Tests) */}
            {secondaryTab === "library" && (
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs">
                {testLibrary.map((libTest) => (
                  <div
                    key={libTest.test_id}
                    className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2 hover:border-slate-300 transition"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-900 truncate">
                        {libTest.name}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate">
                        {libTest.purpose}
                      </span>
                    </div>

                    <button
                      onClick={() => handleExecuteStep(libTest.test_id)}
                      disabled={isLoading}
                      className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-slate-200 hover:border-blue-300 rounded font-semibold text-[10px] shrink-0 transition cursor-pointer"
                    >
                      Run ➔
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* RESEARCH & CAUSAL PIPELINE MODAL */}
      {/* --------------------------------------------------------------------- */}
      <ResearchModal
        isOpen={isResearchModalOpen}
        onClose={() => setIsResearchModalOpen(false)}
        experimentData={experimentData}
        isRunningExperiment={isRunningExperiment}
        onRunExperiment={handleRunFullExperiment}
      />
    </div>
  );
}
