"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  FaultType,
  FaultScenario,
  TopologyData,
} from "../types";

const API_BASE = "http://localhost:8000";

export default function FaultInjectionView() {
  const { currentNetwork, currentRevision, setActiveView, setCurrentNetwork } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const links = currentNetwork.links || [];

  // Active faults and available scenarios
  const [activeFaults, setActiveFaults] = useState<FaultScenario[]>([]);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");

  // Fault Configuration Form state
  const [faultType, setFaultType] = useState<FaultType>("LINK_FAILURE");
  const [selectedLink, setSelectedLink] = useState<string>("R2-R3");
  const [selectedNode, setSelectedNode] = useState<string>("R3");
  const [interfaceNode, setInterfaceNode] = useState<string>("R3");
  const [interfaceRemote, setInterfaceRemote] = useState<string>("R2");

  // Selection from topology
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>("R2-R3");
  const [selectedComponentType, setSelectedComponentType] = useState<"link" | "node">("link");

  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sync active faults & topology from backend
  const fetchState = useCallback(async () => {
    try {
      const [faultsRes, topoRes, scenRes] = await Promise.all([
        fetch(`${API_BASE}/api/faults/active`),
        fetch(`${API_BASE}/api/topology`),
        fetch(`${API_BASE}/api/faults/scenarios`),
      ]);

      if (faultsRes.ok) {
        const data = await faultsRes.json();
        setActiveFaults(data);
      }
      if (topoRes.ok) {
        const topoData: TopologyData = await topoRes.json();
        setCurrentNetwork(topoData);
      }
      if (scenRes.ok) {
        const scenData = await scenRes.json();
        setScenarios(scenData);
      }
    } catch (err) {
      console.error("Failed to fetch fault injection state", err);
    }
  }, [setCurrentNetwork]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Inject a fault
  const handleInjectFault = async (customPayload?: any) => {
    setIsLoading(true);
    try {
      let body: any = customPayload;
      if (!body) {
        if (faultType === "LINK_FAILURE") {
          body = { fault_type: "LINK_FAILURE", target_link: selectedLink };
        } else if (faultType === "NODE_FAILURE") {
          body = { fault_type: "NODE_FAILURE", target_node: selectedNode };
        } else if (faultType === "INTERFACE_FAILURE") {
          body = {
            fault_type: "INTERFACE_FAILURE",
            target_interface_node: interfaceNode,
            target_interface_remote: interfaceRemote,
          };
        }
      }

      const res = await fetch(`${API_BASE}/api/faults/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const scenario: FaultScenario = await res.json();
        showToast(`Fault Injected: ${scenario.description}`);
        await fetchState();
      } else {
        const err = await res.json();
        showToast(`Injection Failed: ${err.detail || "Error"}`);
      }
    } catch {
      showToast("Error connecting to fault engine");
    } finally {
      setIsLoading(false);
    }
  };

  // Restore a specific fault
  const handleRestoreFault = async (faultId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/faults/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fault_id: faultId }),
      });
      if (res.ok) {
        showToast("Fault restored to operational state");
        await fetchState();
      }
    } catch {
      showToast("Error restoring fault");
    } finally {
      setIsLoading(false);
    }
  };

  // Restore all faults
  const handleRestoreAll = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/faults/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`All ${data.restored_count} faults restored. Topology is healthy.`);
        await fetchState();
      }
    } catch {
      showToast("Error restoring all faults");
    } finally {
      setIsLoading(false);
    }
  };

  // Quick preset scenario selection
  const handlePresetSelect = (scenId: string) => {
    setSelectedScenarioId(scenId);
    const scen = scenarios.find((s) => s.id === scenId);
    if (!scen) return;

    setFaultType(scen.fault_type);
    if (scen.target_link) {
      setSelectedLink(scen.target_link);
      setSelectedComponentId(scen.target_link);
      setSelectedComponentType("link");
    }
    if (scen.target_node) {
      setSelectedNode(scen.target_node);
      setSelectedComponentId(scen.target_node);
      setSelectedComponentType("node");
    }
    if (scen.target_interface_node && scen.target_interface_remote) {
      setInterfaceNode(scen.target_interface_node);
      setInterfaceRemote(scen.target_interface_remote);
      setSelectedComponentId(`${scen.target_interface_node}-${scen.target_interface_remote}`);
      setSelectedComponentType("link");
    }
  };

  // Handle topology click selection
  const handleTopologyClick = (id: string, type: "node" | "link") => {
    setSelectedComponentId(id);
    setSelectedComponentType(type);
    if (type === "link") {
      setFaultType("LINK_FAILURE");
      setSelectedLink(id);
      const parts = id.split("-");
      if (parts.length === 2) {
        setInterfaceNode(parts[1]);
        setInterfaceRemote(parts[0]);
      }
    } else {
      setFaultType("NODE_FAILURE");
      setSelectedNode(id);
    }
  };

  // Determine status of selected component
  let selectedStatus = "UP";
  if (selectedComponentType === "link" && selectedComponentId) {
    const l = links.find(
      (link) =>
        `${link.source}-${link.destination}` === selectedComponentId ||
        `${link.destination}-${link.source}` === selectedComponentId
    );
    selectedStatus = (l?.status || "up").toUpperCase();
  } else if (selectedComponentType === "node" && selectedComponentId) {
    const n = nodes.find((node) => node.id === selectedComponentId);
    selectedStatus = (n?.health_status || "up").toUpperCase();
  }

  // Calculate failed component IDs for visual preview highlighting
  const failedLinks = links
    .filter((l) => l.status === "down")
    .map((l) => `${minNode(l.source, l.destination)}-${maxNode(l.source, l.destination)}`);

  const failedNodes = nodes.filter((n) => n.health_status === "down").map((n) => n.id);

  function minNode(a: string, b: string) {
    return a < b ? a : b;
  }
  function maxNode(a: string, b: string) {
    return a > b ? a : b;
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
              FAULT INJECTION
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
              MODULE 3
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Mode Pill Indicator */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-100 p-0.5 rounded border border-slate-200">
            <span
              className={`px-2.5 py-1 rounded font-medium transition cursor-pointer ${
                activeFaults.length > 0
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-white text-slate-800 shadow-xs"
              }`}
            >
              {activeFaults.length > 0 ? "● Fault Active" : "○ Baseline Healthy"}
            </span>
            <span className="text-slate-400 px-2 text-[11px]">
              {activeFaults.length} active condition{activeFaults.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Preset Scenario Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Preset:</span>
            <select
              value={selectedScenarioId}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 transition focus:outline-none"
            >
              <option value="">-- Choose Standard Scenario --</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} [{s.scope}]
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {activeFaults.length > 0 && (
            <button
              onClick={handleRestoreAll}
              disabled={isLoading}
              className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              ↺ Restore All Faults
            </button>
          )}

          <button
            onClick={() => setActiveView("failure-detection")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Run Failure Detection ➔
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Network Preview & Quick Component Inspector (~56%) */}
        <div className="w-[56%] border-r border-slate-200 flex flex-col bg-white overflow-hidden relative">
          {/* Subheader */}
          <div className="h-9 px-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <span>PHYSICAL TOPOLOGY PREVIEW</span>
              <span className="text-slate-400 font-normal">
                (Click node or link to configure fault target)
              </span>
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Healthy</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                <span>Failed</span>
              </span>
            </div>
          </div>

          {/* Canvas Preview Area */}
          <div className="flex-1 relative overflow-hidden bg-slate-50/40">
            <NetworkPreview
              network={currentNetwork}
              selectedNodeId={selectedComponentType === "node" ? selectedComponentId : null}
              selectedLinkId={selectedComponentType === "link" ? selectedComponentId : null}
              onSelectNode={(nodeId) => nodeId && handleTopologyClick(nodeId, "node")}
              onSelectLink={(linkId) => linkId && handleTopologyClick(linkId, "link")}
              highlightedPath={[]}
            />

            {/* Selected Component Quick Action Card */}
            {selectedComponentId && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-3 shadow-md text-xs w-72 z-20">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                  <span className="font-semibold text-slate-800 uppercase tracking-wide text-[11px]">
                    Selected {selectedComponentType}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      selectedStatus === "UP"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    STATUS: {selectedStatus}
                  </span>
                </div>

                <div className="font-mono text-sm font-bold text-slate-900 mb-2">
                  {selectedComponentId}
                </div>

                <div className="flex items-center gap-2">
                  {selectedStatus === "UP" ? (
                    <button
                      onClick={() => handleInjectFault()}
                      disabled={isLoading}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-1 rounded text-xs transition cursor-pointer text-center"
                    >
                      Inject Failure
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const targetFault = activeFaults.find(
                          (f) =>
                            f.target_link === selectedComponentId ||
                            f.target_node === selectedComponentId
                        );
                        if (targetFault) {
                          handleRestoreFault(targetFault.fault_id);
                        } else {
                          handleRestoreAll();
                        }
                      }}
                      disabled={isLoading}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-1 rounded text-xs transition cursor-pointer text-center"
                    >
                      Restore Component
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Fault Configuration & Active Faults (~44%) */}
        <div className="w-[44%] flex flex-col bg-white overflow-y-auto">
          {/* 1. FAULT CONFIGURATION PANEL */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  FAULT CONFIGURATION
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure deterministic failure condition parameters
                </p>
              </div>
            </div>

            {/* Fault Type Selection */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Fault Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "LINK_FAILURE", label: "Link Failure", desc: "Physical carrier drop" },
                  { id: "NODE_FAILURE", label: "Node Failure", desc: "Router power crash" },
                  { id: "INTERFACE_FAILURE", label: "Interface", desc: "Port disabled" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFaultType(t.id as FaultType)}
                    className={`p-2.5 rounded border text-left transition cursor-pointer ${
                      faultType === t.id
                        ? "border-rose-500 bg-rose-50/50 text-rose-900 shadow-xs"
                        : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white"
                    }`}
                  >
                    <div className="font-semibold text-xs">{t.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Selectors */}
            {faultType === "LINK_FAILURE" && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Target Link Segment
                </label>
                <select
                  value={selectedLink}
                  onChange={(e) => {
                    setSelectedLink(e.target.value);
                    setSelectedComponentId(e.target.value);
                    setSelectedComponentType("link");
                  }}
                  className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-rose-500"
                >
                  {links.map((l) => {
                    const id = `${minNode(l.source, l.destination)}-${maxNode(l.source, l.destination)}`;
                    return (
                      <option key={id} value={id}>
                        {l.source} ↔ {l.destination} ({l.status.toUpperCase()})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {faultType === "NODE_FAILURE" && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Target Router / Host Node
                </label>
                <select
                  value={selectedNode}
                  onChange={(e) => {
                    setSelectedNode(e.target.value);
                    setSelectedComponentId(e.target.value);
                    setSelectedComponentType("node");
                  }}
                  className="w-full bg-white border border-slate-200 rounded px-3 py-2 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:border-rose-500"
                >
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id} ({n.type}) — Status: {(n.health_status || "up").toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {faultType === "INTERFACE_FAILURE" && (
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Host Router
                  </label>
                  <select
                    value={interfaceNode}
                    onChange={(e) => setInterfaceNode(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Facing Remote Neighbor
                  </label>
                  <select
                    value={interfaceRemote}
                    onChange={(e) => setInterfaceRemote(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs font-mono text-slate-800"
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* State Transition Preview */}
            <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between text-xs mb-4">
              <div>
                <span className="text-slate-400 font-medium">Pre-Condition:</span>
                <span className="ml-1.5 font-mono font-bold text-emerald-700">
                  OPERATIONAL [UP]
                </span>
              </div>
              <span className="text-slate-300">➔</span>
              <div>
                <span className="text-slate-400 font-medium">Post-Condition:</span>
                <span className="ml-1.5 font-mono font-bold text-rose-700">
                  FAILED [DOWN]
                </span>
              </div>
            </div>

            {/* Inject Action Button */}
            <button
              onClick={() => handleInjectFault()}
              disabled={isLoading}
              className="w-full py-2.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs tracking-wide transition cursor-pointer shadow-sm flex items-center justify-center gap-2"
            >
              <span>⚡ INJECT FAULT SCENARIO</span>
            </button>
          </div>

          {/* 2. ACTIVE FAULTS LIST */}
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                ACTIVE INJECTED FAULTS ({activeFaults.length})
              </h4>
              {activeFaults.length > 0 && (
                <span className="text-[11px] text-rose-600 font-medium">
                  Topology Modified
                </span>
              )}
            </div>

            {activeFaults.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-8 text-center text-slate-400 text-xs">
                <span className="text-2xl mb-2">✓</span>
                <span className="font-semibold text-slate-600">
                  No Active Faults Injected
                </span>
                <span className="text-slate-400 text-[11px] mt-1 max-w-xs">
                  Network is currently running in clean baseline state. Select a component on the topology to inject a failure condition.
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {activeFaults.map((fault) => (
                  <div
                    key={fault.fault_id}
                    className="p-3.5 bg-rose-50/60 border border-rose-200 rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                          {fault.fault_id}
                        </span>
                        <span className="font-bold text-xs text-slate-900">
                          {fault.fault_type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 font-mono">
                        Target: {fault.target_link || fault.target_node}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {fault.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleRestoreFault(fault.fault_id)}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold text-xs shadow-2xs transition cursor-pointer"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
