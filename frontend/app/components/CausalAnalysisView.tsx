"use client";

import React, { useState, useEffect, useCallback } from "react";
import NetworkPreview from "./NetworkPreview";
import { useNetworkProject } from "../context/NetworkProjectContext";
import {
  CausalDependencyResponse,
  DependencyGraph,
  DependencyNode,
  FailureSignatureData,
} from "../types";

const API_BASE = "http://localhost:8000";

export default function CausalAnalysisView() {
  const { currentNetwork, setActiveView, lastInvestigationRecord } = useNetworkProject();

  const nodes = currentNetwork.nodes || [];
  const defaultSource = nodes.find((n) => n.id === "PC1")?.id || nodes[0]?.id || "PC1";
  const defaultDest = nodes.find((n) => n.id === "Server")?.id || nodes[nodes.length - 1]?.id || "Server";

  const [source, setSource] = useState(defaultSource);
  const [destination, setDestination] = useState(defaultDest);
  const [viewMode, setViewMode] = useState<"causal" | "signature">("causal");

  const [causalData, setCausalData] = useState<DependencyGraph | null>(null);
  const [signatureData, setSignatureData] = useState<FailureSignatureData | null>(null);
  const [selectedNode, setSelectedNode] = useState<DependencyNode | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchData = useCallback(async (src = source, dst = destination) => {
    setIsLoading(true);
    try {
      const [causalRes, sigRes] = await Promise.all([
        fetch(`${API_BASE}/api/causal-dependencies?source=${src}&destination=${dst}`),
        fetch(`${API_BASE}/api/failure-signature?source=${src}&destination=${dst}`),
      ]);

      let hasActiveLive = false;

      if (causalRes.ok) {
        const cData: CausalDependencyResponse = await causalRes.json();
        if (cData.active && cData.graph) {
          setCausalData(cData.graph);
          setSelectedNode(cData.graph.nodes[0] || null);
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

      // If no active failure in live network, check if we have a recent full investigation record
      if (!hasActiveLive) {
        if (lastInvestigationRecord) {
          setCausalData(lastInvestigationRecord.causal_dependencies);
          setSelectedNode(lastInvestigationRecord.causal_dependencies.nodes[0] || null);
          setSignatureData(lastInvestigationRecord.signature);
        } else {
          setCausalData(null);
          setSelectedNode(null);
          setSignatureData(null);
        }
      }
    } catch {
      setStatusMessage("Failed to connect to backend engine");
    } finally {
      setIsLoading(false);
    }
  }, [source, destination, lastInvestigationRecord]);

  const handleInjectDemoFault = async () => {
    setIsLoading(true);
    try {
      await fetch(`${API_BASE}/api/faults/inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fault_type: "LINK_FAILURE", target_link: "R2-R3" }),
      });
      await fetchData();
    } catch (err) {
      console.error("Demo fault injection failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Determine path highlights for NetworkPreview
  const previewPath = signatureData?.baseline_path || [];
  const faultComponent = signatureData?.failed_component || null;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
      {/* 1. TOP SUB-HEADER BAR */}
      <div className="h-11 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-10 select-none shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            CAUSAL ANALYSIS & FAILURE SIGNATURE
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Directed Root-Cause Provenance & Deterministic Failure Identity (Module 4)
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setViewMode("causal")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
              viewMode === "causal"
                ? "bg-white text-blue-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Directed Causal Chain
          </button>
          <button
            onClick={() => setViewMode("signature")}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
              viewMode === "signature"
                ? "bg-white text-blue-700 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Failure Signature Record
          </button>
        </div>

        {/* Source / Destination Selectors & Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span className="text-slate-400 font-medium">Flow:</span>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                fetchData(e.target.value, destination);
              }}
              className="bg-transparent font-mono font-bold text-slate-700 text-xs focus:outline-none"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id}</option>
              ))}
            </select>
            <span className="text-slate-400">➔</span>
            <select
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                fetchData(source, e.target.value);
              }}
              className="bg-transparent font-mono font-bold text-slate-700 text-xs focus:outline-none"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchData()}
            disabled={isLoading}
            className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer"
          >
            {isLoading ? "Refreshing..." : "↻ Refresh"}
          </button>

          <button
            onClick={() => setActiveView("reduction")}
            className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
          >
            Proceed to Reduction ➔
          </button>
        </div>
      </div>

      {/* 2. MAIN SPLIT CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Topology Visualization & Active Highlight (~46%) */}
        <div className="w-[46%] border-r border-slate-200 flex flex-col bg-white overflow-hidden relative">
          <div className="h-9 px-4 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
            <span className="font-semibold text-slate-700">
              NETWORK TOPOLOGY & PROVENANCE
            </span>
            {signatureData && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                {signatureData.fault_type} ON {signatureData.failed_component}
              </span>
            )}
          </div>

          <div className="flex-1 relative overflow-hidden bg-slate-50/40">
            <NetworkPreview
              network={currentNetwork}
              highlightedPath={previewPath}
              highlightedFaultLinkId={faultComponent && faultComponent.includes("-") ? faultComponent : null}
              highlightedFaultNodeId={faultComponent && !faultComponent.includes("-") ? faultComponent : null}
            />

            {/* Selected Causal Node Detail Overlay */}
            {selectedNode && (
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-3 shadow-md text-xs w-80 z-20">
                <div className="flex items-center justify-between mb-1 pb-1 border-b border-slate-100">
                  <span className="font-semibold text-[10px] uppercase tracking-wide text-slate-500">
                    Inspecting Causal Node
                  </span>
                  <span className="font-mono font-bold text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                    {selectedNode.type}
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-sm mt-1">
                  {selectedNode.label}
                </div>
                <div className="font-mono text-[11px] text-slate-500 mt-1">
                  ID: {selectedNode.id}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Causal Graph OR Failure Signature (~54%) */}
        <div className="w-[54%] flex flex-col bg-white overflow-y-auto p-6">
          {viewMode === "causal" ? (
            /* SUBVIEW A: DIRECTED CAUSAL DEPENDENCY CHAIN */
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    DIRECTED CAUSAL DEPENDENCY CHAIN
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Deterministic progression from pre-failure state to downstream observation
                  </p>
                </div>
                {causalData && (
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                    {causalData.nodes.length} Events • {causalData.edges.length} Dependencies
                  </span>
                )}
              </div>

              {!causalData ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <p className="font-medium text-slate-600 mb-1">No active network failure observed</p>
                  <p className="max-w-md mx-auto mb-4">
                    Inject a fault via Fault Injection or simulate the standard demo failure scenario on link R2-R3 to generate directed causal dependencies and signature records.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={handleInjectDemoFault}
                      disabled={isLoading}
                      className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      ⚡ Inject Demo Failure (Link R2-R3)
                    </button>
                    <button
                      onClick={() => setActiveView("fault-injection")}
                      className="px-3.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 transition cursor-pointer"
                    >
                      Configure Custom Fault
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {causalData.nodes.map((cNode, idx) => {
                    const isSelected = selectedNode?.id === cNode.id;
                    const edgeOut = causalData.edges.find((e) => e.source === cNode.id);

                    return (
                      <div key={cNode.id} className="relative">
                        <div
                          onClick={() => setSelectedNode(cNode)}
                          className={`p-3.5 rounded-lg border transition cursor-pointer ${
                            isSelected
                              ? "bg-blue-50/70 border-blue-500 shadow-sm"
                              : "bg-white hover:bg-slate-50 border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              STEP {idx + 1}: {cNode.type}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {cNode.id}
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-900">
                            {cNode.label}
                          </div>

                          {isSelected && (
                            <div className="mt-2.5 pt-2 border-t border-blue-200/60 text-xs text-slate-600 space-y-1 bg-white/60 p-2 rounded">
                              <div>
                                <strong className="text-slate-800">Operational Evidence: </strong>
                                {cNode.type === "PRE_FAILURE_CONNECTIVITY" && "Dijkstra deterministic route verified healthy before test execution."}
                                {cNode.type === "FAULT" && "Controlled physical/logical disruption introduced into network model."}
                                {cNode.type === "STATE_CHANGE" && "Interface carrier and link operational flag transitioned to DOWN."}
                                {cNode.type === "PATH_CHANGE" && "Topological shortest-path routing algorithm detected broken forwarding link."}
                                {cNode.type === "REACHABILITY_FAILURE" && "No alternate or loop-free bypass route exists in current topology."}
                                {cNode.type === "OBSERVATION" && "Deterministic probe packets dropped at last reachable node with 100% loss rate."}
                              </div>
                              {edgeOut && (
                                <div className="text-[11px] text-blue-700 font-mono font-semibold pt-0.5">
                                  Relation: {edgeOut.relationship} ➔ {edgeOut.target}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {idx < causalData.nodes.length - 1 && (
                          <div className="flex items-center justify-center my-1.5 text-slate-400 text-xs font-mono">
                            <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-semibold text-slate-600">
                              ↓ {edgeOut?.relationship || "LEADS_TO"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* SUBVIEW B: STRUCTURED FAILURE SIGNATURE RECORD */
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    FAILURE SIGNATURE RECORD
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable quantitative fingerprint used for equivalence validation in reduction
                  </p>
                </div>
                {signatureData && (
                  <span className="text-xs font-mono font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200">
                    SIGNATURE CAPTURED
                  </span>
                )}
              </div>

              {!signatureData ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <p className="font-medium text-slate-600 mb-1">No active failure signature available</p>
                  <p>Inject a fault to capture the quantitative failure signature.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* KPI Grid */}
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Packet Loss</div>
                      <div className="text-base font-bold font-mono text-rose-600 mt-1">
                        {signatureData.packet_loss}%
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Reachability</div>
                      <div className="text-base font-bold font-mono text-rose-600 mt-1">
                        {signatureData.reachable ? "REACHABLE" : "UNREACHABLE"}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Routing Deviation</div>
                      <div className="text-base font-bold font-mono text-amber-600 mt-1">
                        {signatureData.routing_change ? "CONFIRMED" : "NONE"}
                      </div>
                    </div>
                  </div>

                  {/* Signature Properties Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 text-xs font-mono">
                    <div className="p-3 flex justify-between bg-white">
                      <span className="text-slate-500 font-sans font-medium">Source ➔ Destination</span>
                      <span className="font-bold text-slate-900">{signatureData.source} ➔ {signatureData.destination}</span>
                    </div>
                    <div className="p-3 flex justify-between bg-white">
                      <span className="text-slate-500 font-sans font-medium">Pre-Failure Baseline Path</span>
                      <span className="font-bold text-emerald-700">
                        {signatureData.baseline_path?.join(" → ") || "N/A"}
                      </span>
                    </div>
                    <div className="p-3 flex justify-between bg-white">
                      <span className="text-slate-500 font-sans font-medium">Observed Active Path</span>
                      <span className="font-bold text-rose-600">
                        {signatureData.path ? signatureData.path.join(" → ") : "DROP / UNREACHABLE"}
                      </span>
                    </div>
                    <div className="p-3 flex justify-between bg-white">
                      <span className="text-slate-500 font-sans font-medium">Failed Component Target</span>
                      <span className="font-bold text-slate-900">{signatureData.failed_component}</span>
                    </div>
                    <div className="p-3 flex justify-between bg-white">
                      <span className="text-slate-500 font-sans font-medium">Fault Type</span>
                      <span className="font-bold text-slate-900">{signatureData.fault_type}</span>
                    </div>
                    <div className="p-3 flex justify-between bg-white">
                      <span className="text-slate-500 font-sans font-medium">Carrier Link State</span>
                      <span className="font-bold text-rose-600 uppercase">{signatureData.link_state}</span>
                    </div>
                  </div>

                  {/* JSON Signature Block */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
                      Raw Signature JSON Payload
                    </h4>
                    <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
                      {JSON.stringify(signatureData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
