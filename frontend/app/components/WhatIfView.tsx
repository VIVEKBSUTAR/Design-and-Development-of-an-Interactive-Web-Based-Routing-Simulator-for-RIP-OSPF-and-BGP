"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import { WhatIfResponse, WhatIfFlowSummary } from "../types";

const API_BASE = "http://localhost:8000";

export default function WhatIfView() {
  const { currentNetwork, setActiveView } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const links = currentNetwork.links || [];

  const [targetType, setTargetType] = useState<"LINK" | "NODE">("LINK");
  const [targetComponent, setTargetComponent] = useState<string>("R2-R3");
  const [source, setSource] = useState<string>("PC1");
  const [destination, setDestination] = useState<string>("Server");

  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<WhatIfFlowSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runSimulation = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/resilience/what-if`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_component: targetComponent,
          target_type: targetType,
          source,
          destination,
        }),
      });
      if (res.ok) {
        const data: WhatIfResponse = await res.json();
        setResult(data);
        if (data.affected_flows.length > 0) {
          setSelectedFlow(data.affected_flows[0]);
        } else if (data.unaffected_flows.length > 0) {
          setSelectedFlow(data.unaffected_flows[0]);
        }
      } else {
        setErrorMessage("Failed to simulate what-if resilience scenario");
      }
    } catch {
      setErrorMessage("Network error connecting to resilience engine");
    } finally {
      setIsLoading(false);
    }
  }, [targetComponent, targetType, source, destination]);

  useEffect(() => {
    runSimulation();
  }, [runSimulation]);

  const highlightPath = selectedFlow
    ? selectedFlow.after_path || selectedFlow.before_path
    : result?.before_path || [];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
      {/* 1. TOP SUB-HEADER BAR */}
      <div className="h-11 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-10 select-none shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            RESILIENCE & WHAT-IF FAILURE SIMULATION
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Non-destructive prospective failure impact modeling (Module 4)
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView("history")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Investigation History ➔
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Configuration & Topology Preview (~46%) */}
        <div className="w-[46%] border-r border-slate-200 flex flex-col bg-white overflow-hidden relative">
          {/* Quick Scenario Config Bar */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70 grid grid-cols-4 gap-2 text-xs">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Target Type</label>
              <select
                value={targetType}
                onChange={(e) => {
                  const val = e.target.value as "LINK" | "NODE";
                  setTargetType(val);
                  setTargetComponent(val === "LINK" ? "R2-R3" : "R3");
                }}
                className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-mono text-xs font-semibold"
              >
                <option value="LINK">Link Failure</option>
                <option value="NODE">Node Failure</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Component</label>
              <select
                value={targetComponent}
                onChange={(e) => setTargetComponent(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-mono text-xs font-semibold"
              >
                {targetType === "LINK"
                  ? links.map((l) => {
                      const id = `${l.source}-${l.destination}`;
                      return <option key={id} value={id}>{id}</option>;
                    })
                  : nodes.map((n) => (
                      <option key={n.id} value={n.id}>{n.id} ({n.type})</option>
                    ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Flow</label>
              <div className="flex items-center gap-1">
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-1/2 bg-white border border-slate-200 rounded px-1.5 py-1 font-mono text-xs"
                >
                  {nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                </select>
                <span>➔</span>
                <select
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-1/2 bg-white border border-slate-200 rounded px-1.5 py-1 font-mono text-xs"
                >
                  {nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={runSimulation}
                disabled={isLoading}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold py-1 rounded text-xs transition cursor-pointer"
              >
                {isLoading ? "..." : "Simulate"}
              </button>
            </div>
          </div>

          <div className="flex-1 relative overflow-hidden bg-slate-50/40">
            <NetworkPreview
              network={currentNetwork}
              highlightedPath={highlightPath}
              highlightedFaultLinkId={targetType === "LINK" ? targetComponent : null}
              highlightedFaultNodeId={targetType === "NODE" ? targetComponent : null}
            />

            {/* Scope Badge Overlay */}
            {result && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-3 shadow-md text-xs w-72 z-20">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[10px] uppercase text-slate-500">
                    Blast Radius Scope
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                      result.failure_scope === "NONE"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : result.failure_scope === "LOCALIZED"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {result.failure_scope}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  {result.resilience_assessment}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: What-If Findings & Blast Radius (~54%) */}
        <div className="w-[54%] flex flex-col bg-white overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                WHAT-IF IMPACT ANALYSIS
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluation of {targetComponent} prospective failure
              </p>
            </div>
            {result && (
              <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                {result.affected_flows_count} Affected / {result.unaffected_flows_count} Unaffected Flows
              </span>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 mb-4 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMessage}
            </div>
          )}

          {!result ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <p>Simulating prospective failure scenario...</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 1. Primary Flow Before vs After Cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* BEFORE */}
                <div className="p-3.5 bg-emerald-50/50 rounded-lg border border-emerald-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wide">
                      BEFORE FAILURE (BASELINE)
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                      REACHABLE ✓
                    </span>
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900">
                    {result.before_path.join(" ➔ ")}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    Hops: {Math.max(0, result.before_path.length - 1)}
                  </div>
                </div>

                {/* AFTER */}
                <div
                  className={`p-3.5 rounded-lg border ${
                    result.after_reachable
                      ? "bg-blue-50/50 border-blue-200"
                      : "bg-rose-50/50 border-rose-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide ${
                        result.after_reachable ? "text-blue-800" : "text-rose-800"
                      }`}
                    >
                      AFTER {targetComponent} FAILS
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        result.after_reachable
                          ? "bg-blue-100 text-blue-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {result.after_reachable ? "REROUTED" : "UNREACHABLE ✕"}
                    </span>
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900">
                    {result.after_path ? result.after_path.join(" ➔ ") : "DROP / NO PATH"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    Alternate Paths: {result.has_alternate_path ? "AVAILABLE" : "NONE"}
                  </div>
                </div>
              </div>

              {/* 2. Flow Impact Breakdown Table */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  Network-Wide Host Communication Flows
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white text-xs font-mono">
                  <div className="p-2.5 flex justify-between bg-slate-50 font-sans font-semibold text-slate-600 text-[11px]">
                    <span>Flow Endpoints</span>
                    <span>Path Status Under Failure</span>
                    <span>Action</span>
                  </div>

                  {/* Affected Flows */}
                  {result.affected_flows.map((f) => (
                    <div
                      key={`${f.source}-${f.destination}`}
                      onClick={() => setSelectedFlow(f)}
                      className={`p-2.5 flex justify-between items-center transition cursor-pointer ${
                        selectedFlow?.source === f.source && selectedFlow?.destination === f.destination
                          ? "bg-rose-50/70"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-bold text-slate-900">
                        {f.source} ➔ {f.destination}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                        {f.status}
                      </span>
                      <span className="text-[11px] text-blue-600 font-sans font-medium">
                        Highlight Path
                      </span>
                    </div>
                  ))}

                  {/* Unaffected Flows */}
                  {result.unaffected_flows.map((f) => (
                    <div
                      key={`${f.source}-${f.destination}`}
                      onClick={() => setSelectedFlow(f)}
                      className={`p-2.5 flex justify-between items-center transition cursor-pointer ${
                        selectedFlow?.source === f.source && selectedFlow?.destination === f.destination
                          ? "bg-emerald-50/70"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-bold text-slate-900">
                        {f.source} ➔ {f.destination}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        HEALTHY
                      </span>
                      <span className="text-[11px] text-blue-600 font-sans font-medium">
                        Highlight Path
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
