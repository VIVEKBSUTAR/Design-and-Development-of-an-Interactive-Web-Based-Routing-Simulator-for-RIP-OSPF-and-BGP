"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import { FailureObservation, TopologyData } from "../types";

const API_BASE = "http://localhost:8000";

export default function FailureDetectionView() {
  const { currentNetwork, currentRevision, setActiveView, setCurrentNetwork } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const links = currentNetwork.links || [];

  const defaultSource = nodes.find((n) => n.id === "PC1")?.id || nodes[0]?.id || "PC1";
  const defaultDest = nodes.find((n) => n.id === "Server")?.id || nodes[nodes.length - 1]?.id || "Server";

  const [selectedSource, setSelectedSource] = useState(defaultSource);
  const [selectedDestination, setSelectedDestination] = useState(defaultDest);
  const [probeCount, setProbeCount] = useState<number>(3);

  const [observation, setObservation] = useState<FailureObservation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Run Failure Detection
  const runDetection = useCallback(async (src = selectedSource, dst = selectedDestination) => {
    if (!src || !dst) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/diagnosis/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: src, destination: dst, probe_count: probeCount }),
      });

      if (res.ok) {
        const data: FailureObservation = await res.json();
        setObservation(data);
      } else {
        showToast("Failed to run failure detection");
      }
    } catch (err) {
      showToast("Error connecting to detection engine");
    } finally {
      setIsLoading(false);
    }
  }, [selectedSource, selectedDestination, probeCount]);

  // Initial detection run on mount
  useEffect(() => {
    runDetection();
  }, [runDetection]);

  return (
    <div className="flex flex-col flex-1 h-full w-full overflow-hidden bg-slate-50">
      {/* Toast */}
      {toastMessage && (
        <div className="absolute top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2 rounded shadow-lg border border-slate-700 animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP HEADER BAR */}
      <div className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-slate-900">
              FAILURE DETECTION
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 font-semibold">
              MODULE 3
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Flow Selectors */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Source:</span>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-mono font-medium text-slate-800 focus:outline-none"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} ({n.type})
                </option>
              ))}
            </select>

            <span className="text-slate-400 font-medium">➔</span>

            <span className="text-slate-500 font-medium">Destination:</span>
            <select
              value={selectedDestination}
              onChange={(e) => setSelectedDestination(e.target.value)}
              className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-mono font-medium text-slate-800 focus:outline-none"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} ({n.type})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => runDetection()}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            {isLoading ? "Probing..." : "▶ Run Detection"}
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveView("fault-injection")}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            ⚡ Manage Injected Faults
          </button>

          <button
            onClick={() => setActiveView("diagnosis")}
            className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Investigate Cause (Diagnosis) ➔
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Network Preview (~55%) */}
        <div className="w-[55%] border-r border-slate-200 flex flex-col bg-white overflow-hidden relative">
          <div className="h-9 px-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <span>ACTIVE PROBE TRANSIT TOPOLOGY</span>
            </span>
            {observation && (
              <span
                className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                  observation.reachability_status === "HEALTHY"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                STATUS: {observation.reachability_status} ({observation.packet_loss_percentage}% LOSS)
              </span>
            )}
          </div>

          <div className="flex-1 relative overflow-hidden bg-slate-50/40">
            <NetworkPreview
              network={currentNetwork}
              highlightedPath={observation ? observation.observed_path : []}
            />

            {/* Drop Overlay Banner */}
            {observation && observation.packet_loss_percentage > 0 && observation.failed_transition && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-rose-200 rounded-lg p-3 shadow-md text-xs w-80 z-20">
                <div className="flex items-center gap-1.5 text-rose-700 font-bold mb-1">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>
                  <span>PACKET DROP TRANSITION DETECTED</span>
                </div>
                <div className="font-mono text-sm font-bold text-slate-900 mb-1">
                  {observation.failed_transition}
                </div>
                <p className="text-[11px] text-slate-500">
                  Last reachable hop: <strong className="text-slate-800">{observation.last_reachable_node}</strong>
                </p>
                {observation.drop_reason && (
                  <p className="text-[11px] text-rose-600 mt-1 font-mono">
                    {observation.drop_reason}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Empirical Observations & Checklist (~45%) */}
        <div className="w-[45%] flex flex-col bg-white overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                EMPIRICAL OBSERVATIONS
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time discrete packet telemetry from source to destination
              </p>
            </div>

            {observation && (
              <div className="text-right">
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded ${
                    observation.reachability_status === "HEALTHY"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {observation.reachability_status}
                </span>
              </div>
            )}
          </div>

          {observation && (
            <div className="space-y-5">
              {/* 1. Quantitative KPI Grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Loss Rate</div>
                  <div className={`text-base font-bold font-mono mt-1 ${observation.packet_loss_percentage > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {observation.packet_loss_percentage}%
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Delivered</div>
                  <div className="text-base font-bold font-mono text-slate-800 mt-1">
                    {observation.probes_delivered}/{observation.probes_sent}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Last Reachable</div>
                  <div className="text-base font-bold font-mono text-blue-600 mt-1">
                    {observation.last_reachable_node || "None"}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Avg Latency</div>
                  <div className="text-base font-bold font-mono text-slate-800 mt-1">
                    {observation.avg_rtt_ms ? `${observation.avg_rtt_ms} ms` : "N/A"}
                  </div>
                </div>
              </div>

              {/* 2. Hop-by-Hop Reachability Checklist */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  Hop-by-Hop Forwarding Traversal
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
                  {observation.nominal_path.map((nodeId, idx) => {
                    const isReached = observation.observed_path.includes(nodeId);
                    const isLast = observation.last_reachable_node === nodeId;
                    const isFailedTarget =
                      observation.failed_transition &&
                      observation.failed_transition.endsWith(nodeId);

                    return (
                      <div
                        key={nodeId}
                        className={`p-3 flex items-center justify-between text-xs ${
                          isReached
                            ? "bg-emerald-50/30"
                            : isFailedTarget
                            ? "bg-rose-50/50"
                            : "bg-white text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-400 w-5 text-right font-medium">
                            {idx}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            {nodeId}
                          </span>
                          {idx === 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              SOURCE
                            </span>
                          )}
                          {idx === observation.nominal_path.length - 1 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                              DESTINATION
                            </span>
                          )}
                        </div>

                        <div>
                          {isReached ? (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <span>✓</span> Reached
                            </span>
                          ) : isFailedTarget ? (
                            <span className="text-rose-700 font-bold flex items-center gap-1">
                              <span>✕</span> Drop Point
                            </span>
                          ) : (
                            <span className="text-slate-400">Not Reached</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Independent Branch Reachability */}
              {observation.healthy_branches.length > 0 && (
                <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs">
                  <div className="font-semibold text-emerald-900 mb-1 flex items-center gap-1.5">
                    <span>✓</span> SURVIVING BRANCH VERIFICATION
                  </div>
                  {observation.healthy_branches.map((b, i) => (
                    <div key={i} className="font-mono text-emerald-800">
                      {b}
                    </div>
                  ))}
                  <p className="text-[11px] text-emerald-700 mt-1">
                    Independent branch probe proves central distribution router is functional.
                  </p>
                </div>
              )}

              {/* 4. Action Banner */}
              <div className="pt-2">
                <button
                  onClick={() => setActiveView("diagnosis")}
                  className="w-full py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs tracking-wide transition cursor-pointer shadow-sm flex items-center justify-center gap-2"
                >
                  <span>🔍 INVESTIGATE CAUSE WITH HYPOTHESIS ENGINE ➔</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
