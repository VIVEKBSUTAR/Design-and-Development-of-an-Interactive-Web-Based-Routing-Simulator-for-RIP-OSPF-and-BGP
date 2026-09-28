"use client";

import React, { useState } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";

export default function SavedNetworksView() {
  const {
    savedNetworks,
    loadSavedNetwork,
    setActiveView,
    resetToBaseline,
    currentRevision,
  } = useNetworkProject();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetToBaseline();
      showToast("Topology reset to standard 7-node baseline (PC1-R1-R2-R3-Server + R2-R4-PC2)");
    } catch {
      showToast("Reset failed");
    } finally {
      setIsResetting(false);
    }
  };

  const handleLoadAndNavigate = (id: string, targetView: "network-builder" | "network-intelligence" | "test-observe" | "reproduction") => {
    loadSavedNetwork(id);
    setActiveView(targetView);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="absolute top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2 rounded shadow-lg border border-slate-700 animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP SUB-HEADER BAR */}
      <div className="h-11 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-10 select-none shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            SAVED NETWORKS & REFERENCE TOPOLOGIES
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Curated baseline topologies, reduced models, and saved revisions
          </span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            disabled={isResetting}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Reset active topology and restore all links to clean 7-node baseline"
          >
            ↺ {isResetting ? "Resetting..." : "Reset to 7-Node Demo Baseline"}
          </button>

          <button
            onClick={() => setActiveView("network-builder")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Create in Builder ➔
          </button>
        </div>
      </div>

      {/* 2. CATALOGUE GRID */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Available Network Models ({savedNetworks.length})
              </h2>
              <p className="text-xs text-slate-500">
                Load reference models directly into the Network Builder, Intelligence Engine, or Testing Campaign
              </p>
            </div>
            <span className="text-xs font-mono text-slate-600 bg-white px-2.5 py-1 rounded border border-slate-200">
              Active: <strong className="text-slate-900">{currentRevision.name}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {savedNetworks.map((net) => {
              const isMinimal = net.id === "net-minimal-reduced";
              const isCurrent = currentRevision.name === net.name;

              return (
                <div
                  key={net.id}
                  className={`bg-white border rounded-xl overflow-hidden shadow-2xs flex flex-col transition hover:shadow-md ${
                    isCurrent ? "border-blue-500 ring-1 ring-blue-500/20" : "border-slate-200"
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          isMinimal ? "bg-amber-500" : "bg-blue-600"
                        }`}
                      />
                      <h3 className="font-bold text-sm text-slate-900">{net.name}</h3>
                      {isCurrent && (
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Modified: {net.lastModified}
                    </span>
                  </div>

                  {/* Topology Mini Canvas Preview */}
                  <div className="h-52 bg-slate-50/70 border-b border-slate-100 relative overflow-hidden">
                    <NetworkPreview
                      network={net.topology}
                      title=""
                      subtitle=""
                    />
                    <div className="absolute top-2.5 left-3 flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded border border-slate-200 text-slate-700 shadow-2xs">
                        {net.nodeCount} Nodes
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded border border-slate-200 text-slate-700 shadow-2xs">
                        {net.linkCount} Links
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {net.description}
                      </p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {net.topology.nodes.map((n) => (
                          <span
                            key={n.id}
                            className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                          >
                            {n.id} ({n.type})
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleLoadAndNavigate(net.id, "network-builder")}
                        className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <span>Open in Builder</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {isMinimal ? (
                          <button
                            onClick={() => handleLoadAndNavigate(net.id, "reproduction")}
                            className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <span>Verify Reproduction</span>
                            <span>➔</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleLoadAndNavigate(net.id, "network-intelligence")}
                            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
                          >
                            <span>Analyze Intelligence</span>
                            <span>➔</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
