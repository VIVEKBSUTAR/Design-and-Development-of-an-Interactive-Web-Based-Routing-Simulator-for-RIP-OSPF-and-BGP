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

  const [selectedSource, setSelectedSource] = useState(defaultSource);
  const [selectedDestination, setSelectedDestination] = useState(defaultDest);
  const [mode, setMode] = useState<"automated" | "manual">("automated");
  const [activeTab, setActiveTab] = useState<"campaign" | "library">("campaign");

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
      // Smooth pacing interval between test executions for visual presentation
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
        showToast(isR2R3Down ? "Link R2-R3 restored to UP." : "FAULT INJECTED: Link R2-R3 severed (DOWN).");
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

  // Inspect selected test result (or the latest executed)
  const currentTestResult: TestResult | null =
    campaign && campaign.executed_tests.length > 0
      ? selectedTestIndex !== null && campaign.executed_tests[selectedTestIndex]
        ? campaign.executed_tests[selectedTestIndex]
        : campaign.executed_tests[campaign.executed_tests.length - 1]
      : null;

  // Active events from selected test simulation
  const timelineEvents: ProbeEvent[] = currentTestResult?.simulation_result?.all_events || [];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
      {/* --------------------------------------------------------------------- */}
      {/* TOP HEADER BAR */}
      {/* --------------------------------------------------------------------- */}
      <div className="h-12 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 select-none shadow-2xs z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <span className="font-bold text-sm text-slate-900 tracking-tight">
              Test & Observe
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] font-medium text-slate-500 hidden md:inline">
            Run network tests and observe system behavior
          </span>
        </div>

        {/* Center: Mode Switch & Flow */}
        <div className="flex items-center gap-3">
          {/* Mode Pill Toggle */}
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
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
          {toastMessage && (
            <div className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded animate-in fade-in duration-150">
              {toastMessage}
            </div>
          )}

          {/* Controlled Fault Injector Toggle */}
          <button
            onClick={handleToggleR2R3Fault}
            disabled={isLoading}
            className={`px-3 py-1.5 text-xs font-medium rounded border transition cursor-pointer flex items-center gap-1.5 ${
              isR2R3Down
                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                : "bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200"
            }`}
            title="Toggle R2-R3 link fault status for scenario testing"
          >
            <span className={`w-2 h-2 rounded-full ${isR2R3Down ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span>{isR2R3Down ? "Restore Link R2-R3" : "Sever Link R2-R3"}</span>
          </button>

          <button
            onClick={() => setActiveView("diagnosis")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Investigate Failure ➔
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MAIN TWO-COLUMN WORKSPACE */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {/* =================================================================== */}
        {/* LEFT COLUMN (62%): Network Preview & Live Simulation Timeline */}
        {/* =================================================================== */}
        <div className="w-[62%] h-full flex flex-col gap-3 min-w-0">
          {/* Reusable Network Preview Container */}
          <div className="flex-1 min-h-[280px] bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs flex flex-col">
            <NetworkPreview
              network={currentNetwork}
              title="NETWORK TOPOLOGY PREVIEW"
              subtitle={
                currentTestResult
                  ? `Active Path: ${currentTestResult.observed_path.join(" → ")}`
                  : "Read-Only Topology Consumer"
              }
              className="h-full flex-1"
            />
          </div>

          {/* Bottom Left: Live Probe Simulation Event Timeline */}
          <div className="h-[260px] bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col min-h-0 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-bold text-slate-900 tracking-tight">
                  LIVE PACKET / PROBE EVENT TIMELINE
                </span>
              </div>
              {currentTestResult && (
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      currentTestResult.status === "PASSED"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {currentTestResult.status} ({currentTestResult.actual_result})
                  </span>
                </div>
              )}
            </div>

            {/* Event List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
              {timelineEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs italic gap-1.5">
                  <svg className="w-5 h-5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>No probe simulation events yet. Execute a test to observe packets.</span>
                </div>
              ) : (
                timelineEvents.map((evt) => (
                  <div
                    key={`${evt.sequence}-${evt.packet_id}`}
                    className={`p-2 rounded border flex items-start gap-2.5 transition ${
                      evt.event_type === "DROPPED"
                        ? "bg-rose-50/70 border-rose-200 text-rose-900"
                        : evt.event_type === "RECEIVED"
                        ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                        : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 w-12 shrink-0">
                      +{evt.timestamp_ms}ms
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
                      {evt.event_type}
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="font-semibold text-slate-900 truncate">
                        {evt.packet_id}: {evt.current_node} {evt.next_node ? `→ ${evt.next_node}` : ""}
                      </span>
                      <span className="text-[10px] text-slate-500 leading-tight">
                        {evt.details}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN (56%): Intelligent Test Campaign & Orchestration */}
        {/* =================================================================== */}
        <div className="flex-1 h-full bg-white border border-slate-200 rounded-lg flex flex-col min-w-0 overflow-hidden shadow-2xs">
          {/* Top Campaign Control Header */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-sm text-slate-900">
                  {campaign?.name || "Campus Network Resilience Campaign"}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
                    campaign?.status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : campaign?.status === "RUNNING"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-100 text-slate-600 border-slate-300"
                  }`}
                >
                  {campaign?.status || "NOT_STARTED"}
                </span>
              </div>

              {/* Campaign Control Buttons */}
              <div className="flex items-center gap-2">
                {/* Execute Next Step (Single Step) */}
                <button
                  onClick={() => handleExecuteStep()}
                  disabled={isLoading || isAutoRunning || campaign?.status === "COMPLETED"}
                  className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  title="Execute the next system-selected test"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Execute Next Test</span>
                </button>

                {/* Auto Run All */}
                <button
                  onClick={isAutoRunning ? handleStopAutoRun : handleStartAutoRun}
                  disabled={isLoading || campaign?.status === "COMPLETED"}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                    isAutoRunning
                      ? "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200"
                  }`}
                  title="Step through all recommended tests automatically"
                >
                  {isAutoRunning ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping" />
                      <span>Pause Auto-Run</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      <span>Auto Run All</span>
                    </>
                  )}
                </button>

                {/* Reset Campaign */}
                <button
                  onClick={handleResetCampaign}
                  disabled={isLoading || isAutoRunning}
                  className="px-2.5 py-1.5 rounded-md bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-medium transition cursor-pointer"
                  title="Clear executed tests and start over"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Endpoints & Subtabs */}
            <div className="flex items-center justify-between text-xs pt-1">
              <div className="flex items-center gap-3 text-slate-600">
                <span className="font-semibold text-slate-700">Probe Endpoints:</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-900">
                  {campaign?.source || selectedSource} ➔ {campaign?.destination || selectedDestination}
                </span>
                <span className="text-slate-400">
                  Tests Completed:{" "}
                  <span className="font-bold text-slate-800 font-mono">
                    {campaign?.executed_tests.length || 0}
                  </span>
                </span>
              </div>

              {/* View Subtabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
                <button
                  onClick={() => setActiveTab("campaign")}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    activeTab === "campaign"
                      ? "bg-white text-slate-900 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Campaign Progression
                </button>
                <button
                  onClick={() => setActiveTab("library")}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    activeTab === "library"
                      ? "bg-white text-slate-900 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Test Library ({testLibrary.length})
                </button>
              </div>
            </div>
          </div>

          {/* Central Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* --------------------------------------------------------------- */}
            {/* "WHY WAS THIS TEST SELECTED?" PANEL */}
            {/* --------------------------------------------------------------- */}
            {campaign?.next_test_recommendation && campaign.status !== "COMPLETED" ? (
              <div className="bg-gradient-to-r from-blue-50/90 to-indigo-50/50 border border-blue-200 rounded-lg p-3.5 flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span className="text-[11px] font-bold text-blue-900 uppercase font-mono tracking-wider">
                      SYSTEM-SELECTED NEXT TEST
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold border border-blue-200">
                      {campaign.next_test_recommendation.category}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-blue-700 bg-white/70 px-2 py-0.5 rounded border border-blue-100 font-medium">
                    Confidence: {campaign.next_test_recommendation.confidence}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <h4 className="text-sm font-bold text-slate-900">
                    {campaign.next_test_recommendation.name}
                  </h4>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <strong>Selection Rationale:</strong> {campaign.next_test_recommendation.reason}
                  </p>
                </div>

                {/* Evidence Chips */}
                {campaign.next_test_recommendation.evidence.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase text-slate-500 font-mono">
                      Empirical Evidence Base:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {campaign.next_test_recommendation.evidence.map((ev, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] bg-white border border-blue-200 text-blue-900 px-2.5 py-1 rounded font-medium shadow-2xs flex items-center gap-1.5"
                        >
                          <span className="text-blue-600">✓</span>
                          <span>{ev}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : campaign?.status === "COMPLETED" ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 flex items-center justify-between text-xs text-emerald-900 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-950">
                      Test Campaign Successfully Completed
                    </h4>
                    <p className="text-[11px] text-emerald-800">
                      {campaign.summary || "All recommended tests executed and analyzed."}
                    </p>
                  </div>
                </div>

                {campaign.failure_handoff && (
                  <button
                    onClick={handleRunFullExperiment}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>Inspect Causal Signature</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            ) : null}

            {/* --------------------------------------------------------------- */}
            {/* FAILURE HANDOFF CARD (If Failure Isolated) */}
            {/* --------------------------------------------------------------- */}
            {campaign?.failure_handoff && (
              <div className="bg-amber-50/70 border border-amber-300 rounded-lg p-3.5 flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                    <span className="text-xs font-bold text-amber-950 uppercase font-mono">
                      FAILURE ISOLATION HANDOFF READY (MODULE 3/4)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                    Target: {campaign.failure_handoff.recommended_diagnosis_target || "Link Failure"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">Suspected Egress Point:</span>
                    <span className="font-bold text-slate-900 font-mono">
                      Node {campaign.failure_handoff.drop_node} (Link {campaign.failure_handoff.drop_link})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">Unaffected Operational Subnets:</span>
                    <span className="font-bold text-emerald-800 font-mono">
                      {campaign.failure_handoff.isolated_healthy_branches.join(", ") || "None"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-amber-900 italic">
                    Empirical data packaged for causal dependency reduction and deterministic reproduction.
                  </span>
                  <button
                    onClick={handleRunFullExperiment}
                    disabled={isRunningExperiment}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>Hand Off to Failure Diagnosis</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            )}

            {/* --------------------------------------------------------------- */}
            {/* SUBTAB 1: CAMPAIGN PROGRESSION */}
            {/* --------------------------------------------------------------- */}
            {activeTab === "campaign" ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase font-mono tracking-wider">
                    Sequential Test Pipeline ({campaign?.executed_tests.length || 0} executed)
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Click any test to inspect detailed observations
                  </span>
                </div>

                {campaign?.executed_tests.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-200 rounded-lg text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <p className="font-medium text-slate-600">No tests executed yet.</p>
                    <p className="text-[11px]">
                      Click <strong>"Execute Next Test"</strong> to run the system-recommended baseline probe.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {campaign?.executed_tests.map((t, idx) => {
                      const isSelected = selectedTestIndex === idx;
                      return (
                        <div
                          key={`${t.test_id}-${t.sequence_number}`}
                          onClick={() => setSelectedTestIndex(idx)}
                          className={`p-3 rounded-lg border transition cursor-pointer ${
                            isSelected
                              ? "bg-blue-50/50 border-blue-300 shadow-2xs"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-xs text-slate-400 font-bold">
                                #{String(t.sequence_number).padStart(2, "0")}
                              </span>
                              <span className="font-bold text-xs text-slate-900">
                                {t.name}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                                {t.category}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                  t.status === "PASSED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {t.status}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {t.duration_ms}ms
                              </span>
                            </div>
                          </div>

                          {/* Expanded Result Details */}
                          {isSelected && (
                            <div className="mt-2.5 pt-2.5 border-t border-slate-200/70 flex flex-col gap-2 text-xs animate-in fade-in duration-100">
                              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                                <div>
                                  <span className="text-slate-400 block text-[10px]">Expected:</span>
                                  <span className="text-slate-700">{t.expected_result}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block text-[10px]">Actual Observation:</span>
                                  <span className={t.failure_detected ? "text-rose-700 font-bold" : "text-emerald-700 font-bold"}>
                                    {t.actual_result}
                                  </span>
                                </div>
                              </div>

                              {t.observations.length > 0 && (
                                <div className="bg-slate-50 border border-slate-200 rounded p-2 flex flex-col gap-1 text-[11px]">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">
                                    Observations:
                                  </span>
                                  <ul className="list-disc list-inside space-y-0.5 text-slate-700 font-mono text-[10px]">
                                    {t.observations.map((obs, oIdx) => (
                                      <li key={oIdx}>{obs}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {t.follow_up_recommendations.length > 0 && (
                                <div className="text-[10px] text-blue-900 bg-blue-50/70 border border-blue-100 rounded px-2.5 py-1.5">
                                  <strong>Follow-up:</strong> {t.follow_up_recommendations.join(" ")}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* --------------------------------------------------------------- */
              /* SUBTAB 2: TEST LIBRARY (For Manual Test Execution) */
              /* --------------------------------------------------------------- */
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase font-mono tracking-wider">
                    Available Network Tests
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Execute on-demand tests against active topology
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {testLibrary.map((libTest) => (
                    <div
                      key={libTest.test_id}
                      className="p-3 bg-white border border-slate-200 rounded-lg flex flex-col justify-between gap-2.5 hover:border-blue-300 transition shadow-2xs"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900">
                            {libTest.name}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                            {libTest.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug">
                          {libTest.purpose}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Target: {selectedSource} ➔ {selectedDestination}
                        </span>
                        <button
                          onClick={() => handleExecuteStep(libTest.test_id)}
                          disabled={isLoading}
                          className="px-2.5 py-1 bg-slate-50 hover:bg-blue-50 text-blue-700 border border-slate-200 hover:border-blue-200 rounded font-semibold text-[11px] transition cursor-pointer flex items-center gap-1"
                        >
                          <span>Run Test</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
