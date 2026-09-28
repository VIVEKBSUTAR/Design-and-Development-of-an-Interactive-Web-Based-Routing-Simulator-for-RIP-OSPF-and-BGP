"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  PathQueryResponse,
  AlternatePathsResponse,
  PathComparisonResponse,
  ReachabilityMatrixResponse,
  ComponentDependencyResponse,
  PathInfo,
} from "../types";

const API_BASE = "http://localhost:8000";

export default function NetworkIntelligenceView() {
  const { currentNetwork, currentRevision, setActiveView, setCurrentNetwork } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const links = currentNetwork.links || [];

  // Default endpoints
  const defaultSource = nodes.find((n) => n.id === "PC1")?.id || nodes[0]?.id || "PC1";
  const defaultDest =
    nodes.find((n) => n.id === "Server")?.id || nodes[nodes.length - 1]?.id || "Server";

  const [selectedSource, setSelectedSource] = useState(defaultSource);
  const [selectedDestination, setSelectedDestination] = useState(defaultDest);

  // Subtabs
  const [activeSubtab, setActiveSubtab] = useState<"paths" | "matrix" | "dependencies">("paths");

  // State data
  const [pathData, setPathData] = useState<PathQueryResponse | null>(null);
  const [alternateData, setAlternateData] = useState<AlternatePathsResponse | null>(null);
  const [selectedPathObj, setSelectedPathObj] = useState<PathInfo | null>(null);
  const [comparisonData, setComparisonData] = useState<PathComparisonResponse | null>(null);
  const [matrixData, setMatrixData] = useState<ReachabilityMatrixResponse | null>(null);
  const [dependencyData, setDependencyData] = useState<ComponentDependencyResponse | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string>("R2-R3");
  const [selectedComponentType, setSelectedComponentType] = useState<"link" | "node">("link");

  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Analyze Forwarding Path & Alternates
  const analyzePath = useCallback(async (src = selectedSource, dst = selectedDestination) => {
    if (!src || !dst) return;
    setIsLoading(true);
    try {
      // Primary Path Query
      const pathRes = await fetch(
        `${API_BASE}/api/network-intelligence/path?source=${encodeURIComponent(src)}&destination=${encodeURIComponent(dst)}`
      );
      if (pathRes.ok) {
        const pData: PathQueryResponse = await pathRes.json();
        setPathData(pData);
        setSelectedPathObj(pData.primary_path || null);
      }

      // Alternate Paths Discovery
      const altRes = await fetch(
        `${API_BASE}/api/network-intelligence/alternate-paths?source=${encodeURIComponent(src)}&destination=${encodeURIComponent(dst)}`
      );
      if (altRes.ok) {
        const aData: AlternatePathsResponse = await altRes.json();
        setAlternateData(aData);
      }
    } catch (err) {
      console.error("Path analysis error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSource, selectedDestination]);

  // 2. Fetch Reachability Matrix
  const fetchMatrix = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/network-intelligence/reachability`);
      if (res.ok) {
        const data: ReachabilityMatrixResponse = await res.json();
        setMatrixData(data);
      }
    } catch (err) {
      console.error("Reachability matrix error:", err);
    }
  }, []);

  // 3. Analyze Component Flow Dependencies
  const analyzeComponent = useCallback(async (type: "link" | "node", id: string) => {
    if (!id) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/network-intelligence/dependencies?component_type=${type}&component_id=${encodeURIComponent(id)}`
      );
      if (res.ok) {
        const data: ComponentDependencyResponse = await res.json();
        setDependencyData(data);
        setSelectedComponentId(id);
        setSelectedComponentType(type);
      }
    } catch (err) {
      console.error("Component dependency error:", err);
    }
  }, []);

  // 4. Compare Two Paths
  const handleComparePaths = async (pathA: string[], pathB: string[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/network-intelligence/compare-paths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path_a: pathA, path_b: pathB }),
      });
      if (res.ok) {
        const data: PathComparisonResponse = await res.json();
        setComparisonData(data);
      }
    } catch (err) {
      console.error("Compare paths error:", err);
    }
  };

  // Initial load
  useEffect(() => {
    analyzePath();
    fetchMatrix();
    analyzeComponent("link", "R2-R3");
  }, [analyzePath, fetchMatrix, analyzeComponent]);

  // 5. Controlled Fault Toggle (Sever / Restore Link)
  const handleToggleFault = async (linkId: string) => {
    let u = "";
    let v = "";
    if (linkId.includes("-")) {
      [u, v] = linkId.split("-", 2);
    } else {
      [u, v] = linkId.split(" ", 2);
    }

    const currentLink = links.find(
      (l) => (l.source === u && l.destination === v) || (l.source === v && l.destination === u)
    );
    const isDown = currentLink?.status === "down";
    const endpoint = isDown ? "/api/topology/restore-link" : "/api/topology/fail-link";

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: u, destination: v }),
      });
      if (res.ok) {
        // Refresh topology from backend
        const topRes = await fetch(`${API_BASE}/api/topology`);
        if (topRes.ok) {
          const newTop = await topRes.json();
          setCurrentNetwork(newTop);
        }
        // Refresh intelligence data
        await analyzePath();
        await fetchMatrix();
        await analyzeComponent("link", linkId);
        showToast(isDown ? `Link ${linkId} restored to UP.` : `FAULT INJECTED: Link ${linkId} severed (DOWN).`);
      }
    } catch (err) {
      console.error("Fault toggle error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Derived highlighted paths for NetworkPreview
  const highlightedHops = selectedPathObj?.hops || pathData?.primary_path?.hops || [];
  const highlightedLinks =
    selectedPathObj?.links || pathData?.primary_path?.links || [];

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
      {/* --------------------------------------------------------------------- */}
      {/* TOP HEADER BAR */}
      {/* --------------------------------------------------------------------- */}
      <div className="h-12 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 select-none shadow-2xs z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <span className="font-bold text-sm text-slate-900 tracking-tight">
              Network Intelligence & Path Analysis
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] font-medium text-slate-600 hidden md:inline">
            Module 1: Forwarding Paths, Redundancy, Matrix & Dependencies
          </span>
        </div>

        {/* Center: Source & Destination Selectors */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Flow:</span>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="px-2 py-1 bg-slate-50 border border-slate-300 rounded font-semibold text-slate-900 outline-none focus:border-indigo-500 cursor-pointer"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.type})
              </option>
            ))}
          </select>
          <span className="text-slate-400 font-bold">➔</span>
          <select
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="px-2 py-1 bg-slate-50 border border-slate-300 rounded font-semibold text-slate-900 outline-none focus:border-indigo-500 cursor-pointer"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.type})
              </option>
            ))}
          </select>

          <button
            onClick={() => analyzePath(selectedSource, selectedDestination)}
            disabled={isLoading}
            className="ml-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Analyze Path</span>
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {toastMessage && (
            <div className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded animate-in fade-in duration-150">
              {toastMessage}
            </div>
          )}

          <button
            onClick={() => setActiveView("network-builder")}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded transition cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Builder</span>
          </button>

          <button
            onClick={() => setActiveView("test-observe")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Proceed to Testing (Module 2) ➔
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* MAIN WORKSPACE SPLIT LAYOUT */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {/* =================================================================== */}
        {/* LEFT COLUMN (52%): Reusable Topology Preview with Path Overlays */}
        {/* =================================================================== */}
        <div className="w-[52%] h-full flex flex-col gap-3 min-w-0">
          <div className="flex-1 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs flex flex-col">
            <NetworkPreview
              network={currentNetwork}
              title="ACTIVE TOPOLOGY VIEW"
              subtitle={
                highlightedHops.length > 0
                  ? `Highlighted Path: ${highlightedHops.join(" → ")} (${highlightedHops.length - 1} hops)`
                  : "Click any node or link to inspect flow dependencies"
              }
              highlightedPath={highlightedHops}
              highlightedLinks={highlightedLinks}
              selectedLinkId={selectedComponentType === "link" ? selectedComponentId : null}
              selectedNodeId={selectedComponentType === "node" ? selectedComponentId : null}
              onSelectLink={(id) => {
                if (id) {
                  analyzeComponent("link", id);
                  setActiveSubtab("dependencies");
                }
              }}
              onSelectNode={(id) => {
                if (id) {
                  analyzeComponent("node", id);
                  setActiveSubtab("dependencies");
                }
              }}
              className="h-full flex-1"
            />
          </div>

          {/* Quick Inspector Hint / Status Bar */}
          <div className="h-9 bg-white border border-slate-200 rounded-lg px-3.5 flex items-center justify-between text-xs text-slate-500 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="font-medium text-slate-700">
                Selected for Inspection:
              </span>
              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {selectedComponentId} ({selectedComponentType.toUpperCase()})
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-slate-400">Click links/nodes on canvas to analyze dependencies</span>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN (48%): Path Analysis, Matrix, and Dependencies Tabs */}
        {/* =================================================================== */}
        <div className="flex-1 h-full bg-white border border-slate-200 rounded-lg flex flex-col min-w-0 overflow-hidden shadow-2xs">
          {/* Subtab Navigation */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-slate-200/80 p-0.5 rounded-lg border border-slate-300/50">
              <button
                onClick={() => setActiveSubtab("paths")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeSubtab === "paths"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Paths & Alternatives</span>
                {alternateData && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {alternateData.total_physical_paths}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveSubtab("matrix")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeSubtab === "matrix"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Reachability Matrix</span>
                {matrixData && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {matrixData.reachable_pairs}/{matrixData.total_pairs}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveSubtab("dependencies")}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeSubtab === "dependencies"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>Flow Dependencies</span>
                {dependencyData && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    {dependencyData.dependent_flow_count}
                  </span>
                )}
              </button>
            </div>

            <span className="text-[11px] font-mono text-slate-400">
              {currentRevision.name} rev {currentRevision.revisionNumber}.0
            </span>
          </div>

          {/* Central Scrollable Tab Body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* --------------------------------------------------------------- */}
            {/* SUBTAB 1: PATH ANALYSIS & ALTERNATIVES */}
            {/* --------------------------------------------------------------- */}
            {activeSubtab === "paths" && (
              <div className="flex flex-col gap-4">
                {/* Primary Path Status Card */}
                {pathData ? (
                  <div
                    className={`border rounded-lg p-3.5 flex flex-col gap-3 shadow-2xs ${
                      pathData.reachable
                        ? "bg-gradient-to-r from-emerald-50/80 to-teal-50/40 border-emerald-200"
                        : "bg-gradient-to-r from-rose-50/80 to-red-50/40 border-rose-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            pathData.reachable ? "bg-emerald-600" : "bg-rose-600"
                          }`}
                        />
                        <span
                          className={`text-xs font-bold uppercase font-mono tracking-wider ${
                            pathData.reachable ? "text-emerald-950" : "text-rose-950"
                          }`}
                        >
                          {pathData.reachable ? "FORWARDING PATH REACHABLE" : "DESTINATION UNREACHABLE"}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold">
                        Rule: {pathData.selection_rule}
                      </span>
                    </div>

                    {/* Path Hops Visualization */}
                    <div className="flex flex-wrap items-center gap-2 bg-white/80 p-2.5 rounded-md border border-slate-200/80 font-mono text-xs">
                      {pathData.reachable && pathData.nodes_traversed.length > 0 ? (
                        pathData.nodes_traversed.map((hop, idx) => (
                          <React.Fragment key={idx}>
                            <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold">
                              {hop}
                            </span>
                            {idx < pathData.nodes_traversed.length - 1 && (
                              <span className="text-indigo-400 font-bold">➔</span>
                            )}
                          </React.Fragment>
                        ))
                      ) : (
                        <span className="text-rose-700 font-medium italic">
                          No active forwarding path exists between {selectedSource} and {selectedDestination}.
                        </span>
                      )}
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div className="bg-white/70 p-2 rounded border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 block">Hop Distance:</span>
                        <span className="font-bold text-slate-900">{pathData.hop_count} hops</span>
                      </div>
                      <div className="bg-white/70 p-2 rounded border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 block">Path Cost:</span>
                        <span className="font-bold text-slate-900">{pathData.path_cost.toFixed(1)}</span>
                      </div>
                      <div className="bg-white/70 p-2 rounded border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 block">Alternate Bypasses:</span>
                        <span className="font-bold text-slate-900">
                          {pathData.alternate_paths_available} candidate(s)
                        </span>
                      </div>
                    </div>

                    {/* Bottlenecks Warning */}
                    {pathData.bottlenecks.length > 0 && (
                      <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 flex items-center gap-2">
                        <span className="font-bold text-amber-700">⚠ Bridge Cut-Edges:</span>
                        <span>Links {pathData.bottlenecks.join(", ")} are single points of failure on this route.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    Click "Analyze Path" to compute forwarding route.
                  </div>
                )}

                {/* Alternate Paths Discovery List */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wider">
                      Physical Route Redundancy ({alternateData?.total_physical_paths || 0} Total Paths)
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${
                        alternateData?.redundancy_status === "HIGH"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : alternateData?.redundancy_status === "PARTIAL"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      Redundancy: {alternateData?.redundancy_status || "NONE"}
                    </span>
                  </div>

                  {/* Primary Path Card */}
                  {alternateData?.primary_path && (
                    <div
                      onClick={() => setSelectedPathObj(alternateData.primary_path!)}
                      className={`p-3 rounded-lg border transition cursor-pointer ${
                        selectedPathObj?.path_id === "primary"
                          ? "bg-indigo-50/70 border-indigo-300 shadow-2xs"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-600" />
                          <span className="font-bold text-xs text-slate-900">
                            PRIMARY ACTIVE ROUTE
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-semibold">
                            {alternateData.primary_path.hop_count} hops
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                          ACTIVE
                        </span>
                      </div>
                      <p className="text-xs font-mono text-slate-700 mt-2">
                        {alternateData.primary_path.hops.join(" ➔ ")}
                      </p>
                    </div>
                  )}

                  {/* Candidate Alternates */}
                  {alternateData?.alternate_paths && alternateData.alternate_paths.length > 0 ? (
                    alternateData.alternate_paths.map((alt) => (
                      <div
                        key={alt.path_id}
                        onClick={() => setSelectedPathObj(alt)}
                        className={`p-3 rounded-lg border transition cursor-pointer ${
                          selectedPathObj?.path_id === alt.path_id
                            ? "bg-amber-50/70 border-amber-300 shadow-2xs"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span className="font-bold text-xs text-slate-900">
                              ALTERNATE ROUTE ({alt.path_id.toUpperCase()})
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold">
                              {alt.hop_count} hops
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                                alt.status === "active"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-rose-50 text-rose-800 border-rose-200"
                              }`}
                            >
                              {alt.status}
                            </span>
                            {alternateData.primary_path && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleComparePaths(alternateData.primary_path!.hops, alt.hops);
                                }}
                                className="px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 border border-indigo-200 rounded cursor-pointer"
                              >
                                Compare
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs font-mono text-slate-700 mt-2">
                          {alt.hops.join(" ➔ ")}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500 italic">
                      No alternate bypass routes exist in the current physical graph topology.
                    </div>
                  )}
                </div>

                {/* Path Comparison Modal / Card */}
                {comparisonData && (
                  <div className="bg-slate-50 border border-slate-300 rounded-lg p-3.5 flex flex-col gap-2.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <span className="text-xs font-bold text-slate-900 uppercase font-mono">
                        PATH COMPARISON MATRIX
                      </span>
                      <button
                        onClick={() => setComparisonData(null)}
                        className="text-slate-400 hover:text-slate-700 text-xs font-bold"
                      >
                        ✕ Close
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-bold">Path A (Primary):</span>
                        <span className="font-semibold text-slate-900 text-[11px] block mt-1">
                          {comparisonData.path_a.join(" ➔ ")} ({comparisonData.hop_count_a} hops)
                        </span>
                        {comparisonData.unique_nodes_a.length > 0 && (
                          <span className="text-[10px] text-indigo-700 block mt-1">
                            Unique Nodes: {comparisonData.unique_nodes_a.join(", ")}
                          </span>
                        )}
                      </div>

                      <div className="bg-white p-2.5 rounded border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-bold">Path B (Alternate):</span>
                        <span className="font-semibold text-slate-900 text-[11px] block mt-1">
                          {comparisonData.path_b.join(" ➔ ")} ({comparisonData.hop_count_b} hops)
                        </span>
                        {comparisonData.unique_nodes_b.length > 0 && (
                          <span className="text-[10px] text-amber-700 block mt-1">
                            Unique Nodes: {comparisonData.unique_nodes_b.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-slate-600 bg-white p-2.5 rounded border border-slate-200 flex flex-col gap-1">
                      <div>
                        <strong>Shared Intermediate Routers:</strong>{" "}
                        {comparisonData.shared_dependency_points.join(", ") || "None"}
                      </div>
                      <div>
                        <strong>Hop Distance Difference:</strong>{" "}
                        {comparisonData.hop_difference} hop(s)
                      </div>
                      <div>
                        <strong>Topological Route Similarity:</strong>{" "}
                        {comparisonData.similarity_percentage}%
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --------------------------------------------------------------- */}
            {/* SUBTAB 2: REACHABILITY MATRIX */}
            {/* --------------------------------------------------------------- */}
            {activeSubtab === "matrix" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                      Pairwise Endpoint Reachability Matrix
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Dynamic all-pairs reachability for host and server endpoints
                    </span>
                  </div>
                  <button
                    onClick={fetchMatrix}
                    className="px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 border border-indigo-200 rounded cursor-pointer"
                  >
                    Refresh Matrix
                  </button>
                </div>

                {matrixData ? (
                  <>
                    {/* Matrix Summary KPIs */}
                    <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <span className="text-[10px] text-emerald-700 block font-bold uppercase">
                          Reachable Pairs
                        </span>
                        <span className="text-base font-bold text-emerald-950 font-mono">
                          {matrixData.reachable_pairs} / {matrixData.total_pairs}
                        </span>
                      </div>
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                        <span className="text-[10px] text-rose-700 block font-bold uppercase">
                          Partitioned Pairs
                        </span>
                        <span className="text-base font-bold text-rose-950 font-mono">
                          {matrixData.unreachable_pairs}
                        </span>
                      </div>
                      <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <span className="text-[10px] text-indigo-700 block font-bold uppercase">
                          Network Health
                        </span>
                        <span className="text-base font-bold text-indigo-950 font-mono">
                          {matrixData.network_health_percentage}%
                        </span>
                      </div>
                    </div>

                    {/* Interactive Matrix Table */}
                    <div className="border border-slate-200 rounded-lg overflow-x-auto shadow-2xs">
                      <table className="w-full text-center border-collapse text-xs font-mono">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                            <th className="py-2.5 px-3 text-left">Src ╲ Dst</th>
                            {matrixData.endpoints.map((ep) => (
                              <th key={ep} className="py-2.5 px-3">
                                {ep}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {matrixData.endpoints.map((src) => (
                            <tr key={src} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 text-left font-bold text-slate-900 bg-slate-50">
                                {src}
                              </td>
                              {matrixData.endpoints.map((dst) => {
                                const cell = matrixData.matrix[src]?.[dst];
                                if (!cell) return <td key={dst}>-</td>;

                                if (cell.status === "SAME_NODE") {
                                  return (
                                    <td key={dst} className="py-2 px-3 text-slate-300 font-bold bg-slate-50/50">
                                      —
                                    </td>
                                  );
                                }

                                if (cell.status === "REACHABLE") {
                                  return (
                                    <td
                                      key={dst}
                                      onClick={() => {
                                        setSelectedSource(src);
                                        setSelectedDestination(dst);
                                        analyzePath(src, dst);
                                        setActiveSubtab("paths");
                                      }}
                                      className="py-2 px-3 text-emerald-700 font-bold bg-emerald-50/70 hover:bg-emerald-100 cursor-pointer transition"
                                      title={`Path: ${cell.path?.join(" -> ")} (${cell.hop_count} hops). Click to view route.`}
                                    >
                                      ✓ {cell.hop_count}h
                                    </td>
                                  );
                                }

                                return (
                                  <td
                                    key={dst}
                                    onClick={() => {
                                      setSelectedSource(src);
                                      setSelectedDestination(dst);
                                      analyzePath(src, dst);
                                      setActiveSubtab("paths");
                                    }}
                                    className="py-2 px-3 text-rose-700 font-bold bg-rose-50/70 hover:bg-rose-100 cursor-pointer transition"
                                    title="Unreachable destination. Click to inspect partition."
                                  >
                                    ✕
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    Loading reachability matrix...
                  </div>
                )}
              </div>
            )}

            {/* --------------------------------------------------------------- */}
            {/* SUBTAB 3: COMPONENT FLOW DEPENDENCY INSPECTION */}
            {/* --------------------------------------------------------------- */}
            {activeSubtab === "dependencies" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                      Component Flow Dependency Analysis
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Identifies which host communication flows traverse this link or router
                    </span>
                  </div>
                </div>

                {dependencyData ? (
                  <div className="flex flex-col gap-3">
                    {/* Component Header Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-mono font-bold">
                            Selected {dependencyData.component_type.toUpperCase()}
                          </span>
                          <span className="text-sm font-bold text-slate-900 font-mono">
                            {dependencyData.component_id}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                            dependencyData.status === "up"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-rose-50 text-rose-800 border-rose-200"
                          }`}
                        >
                          Status: {dependencyData.status}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                            dependencyData.criticality === "HIGH"
                              ? "bg-rose-100 text-rose-800 border-rose-300"
                              : dependencyData.criticality === "MEDIUM"
                              ? "bg-amber-100 text-amber-800 border-amber-300"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          Criticality: {dependencyData.criticality}
                        </span>
                      </div>

                      {/* Fault Toggle for this component if link */}
                      {dependencyData.component_type === "link" && (
                        <button
                          onClick={() => handleToggleFault(dependencyData.component_id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded border transition cursor-pointer ${
                            dependencyData.status === "down"
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-2xs"
                              : "bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-2xs"
                          }`}
                        >
                          {dependencyData.status === "down" ? "Restore Link" : "Sever Link"}
                        </button>
                      )}
                    </div>

                    {/* Summary Message */}
                    <p className="text-xs text-slate-700 bg-indigo-50/70 border border-indigo-200 rounded p-2.5 font-medium leading-relaxed">
                      {dependencyData.summary}
                    </p>

                    {/* Dependent Flows List */}
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase font-mono tracking-wider">
                        Dependent End-to-End Traffic Flows ({dependencyData.dependent_flow_count})
                      </span>

                      {dependencyData.dependent_flows.length > 0 ? (
                        <div className="space-y-1.5">
                          {dependencyData.dependent_flows.map((flow, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setSelectedSource(flow.source);
                                setSelectedDestination(flow.destination);
                                analyzePath(flow.source, flow.destination);
                                setActiveSubtab("paths");
                              }}
                              className="p-2.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-lg flex items-center justify-between text-xs font-mono transition cursor-pointer hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-indigo-700">
                                  {flow.source} ➔ {flow.destination}
                                </span>
                                <span className="text-slate-400">({flow.hops} hops)</span>
                              </div>
                              <span className="text-[11px] text-slate-600">
                                {flow.path.join(" ➔ ")}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-500 italic">
                          No active endpoint traffic flows traverse this component.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    Select a link or router from the topology to inspect its dependent flows.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
