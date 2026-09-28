"use client";

import React from "react";
import { NavViewId, useNetworkProject } from "../context/NetworkProjectContext";

interface ModuleMeta {
  category: "NETWORK" | "TESTING" | "ANALYSIS" | "EXPERIMENTS";
  title: string;
  workflowStep: number;
  description: string;
  plannedCapabilities: string[];
}

const MODULE_DEFINITIONS: Record<NavViewId, ModuleMeta> = {
  "network-builder": {
    category: "NETWORK",
    title: "Network Builder",
    workflowStep: 1,
    description: "Interactive visual workspace for constructing, modifying, and inspecting network topologies.",
    plannedCapabilities: [
      "Device placement and port configuration",
      "Dynamic physical link creation and cable management",
      "Node health state control and attribute inspection",
    ],
  },
  "saved-networks": {
    category: "NETWORK",
    title: "Saved Networks",
    workflowStep: 1,
    description: "Catalogue of baseline and reduced network topologies available for simulation and regression testing.",
    plannedCapabilities: [
      "Browse saved topology snapshots and revisions",
      "Load reference models directly into the Network Builder",
      "Version tracking between original and reduced topologies",
    ],
  },
  "network-intelligence": {
    category: "NETWORK",
    title: "Network Intelligence",
    workflowStep: 1,
    description: "Algorithmic path analysis, alternate path discovery, network-wide reachability matrix, and component flow dependency tracking.",
    plannedCapabilities: [
      "Deterministic shortest hop forwarding path computation",
      "Dynamic loop-free alternate path discovery and path comparison",
      "All-pairs reachability matrix and bottleneck dependency inspection",
    ],
  },
  "test-observe": {
    category: "TESTING",
    title: "Test & Observe",
    workflowStep: 2,
    description: "Execute discrete-event ICMP health test probes across the active network topology and observe hop-by-hop traversal.",
    plannedCapabilities: [
      "Configurable source-to-destination probe generation",
      "Real-time hop latency and serialization delay tracking",
      "Empirical packet transit observation without fault guessing",
    ],
  },
  "fault-injection": {
    category: "TESTING",
    title: "Fault Injection",
    workflowStep: 3,
    description: "Controlled fault orchestrator for applying deterministic link cuts, node shutdowns, and interface state changes.",
    plannedCapabilities: [
      "Targeted link severing (e.g., R2-R3 cut)",
      "Node power-off and recovery simulations",
      "Isolation of failure condition from diagnosis layer",
    ],
  },
  "network-monitor": {
    category: "TESTING",
    title: "Network Monitor",
    workflowStep: 4,
    description: "Live telemetry and discrete event logging showing probe transit events, timestamps, and drop locations.",
    plannedCapabilities: [
      "Chronological sequence of probe lifecycle events",
      "Packet loss percentage and average round-trip time calculations",
      "Interface status validation across all network segments",
    ],
  },
  "failure-detection": {
    category: "ANALYSIS",
    title: "Failure Detection",
    workflowStep: 5,
    description: "Evaluates empirical probe telemetry to determine reachability degradation and partition boundaries.",
    plannedCapabilities: [
      "Automated detection of 100% loss or degraded throughput",
      "Hop traversal limit validation and drop node identification",
      "Clear separation of observed symptoms from root cause inferences",
    ],
  },
  "failure-signature": {
    category: "ANALYSIS",
    title: "Failure Signature",
    workflowStep: 6,
    description: "Generates structured, reproducible failure signatures capturing pre-failure baseline path, drop point, and packet loss.",
    plannedCapabilities: [
      "Baseline path preservation comparison",
      "Structured signature fingerprint generation",
      "Deterministic signature validation across revisions",
    ],
  },
  "causal-analysis": {
    category: "ANALYSIS",
    title: "Causal Analysis",
    workflowStep: 7,
    description: "Builds causal dependency graphs tracing the physical failure, baseline connectivity, and downstream impact.",
    plannedCapabilities: [
      "Causal node and relationship mapping (ENABLES, CAUSES)",
      "PRE_FAILURE_CONNECTIVITY causal requirement enforcement",
      "Graph validation preventing improper component dismissal",
    ],
  },
  "diagnosis": {
    category: "ANALYSIS",
    title: "Diagnosis",
    workflowStep: 8,
    description: "Diagnostic inference engine that deduces probable root causes strictly from empirical observations.",
    plannedCapabilities: [
      "Root cause inference without access to hidden fault configuration",
      "Confidence estimation based on packet drop patterns",
      "Branch isolation assessment (e.g., verifying R2-R4-PC2 unaffected)",
    ],
  },
  "reduction": {
    category: "ANALYSIS",
    title: "Reduction",
    workflowStep: 9,
    description: "Dependency-aware failure reduction engine that prunes inessential network components while preserving failure causality.",
    plannedCapabilities: [
      "Automated candidate evaluation (PC2, R4, R1)",
      "Strict signature and dependency match criteria",
      "Rejection and restoration of essential transit components",
    ],
  },
  "reproduction": {
    category: "ANALYSIS",
    title: "Reproduction",
    workflowStep: 10,
    description: "Validates that the reduced network topology reliably and deterministically reproduces the exact target failure.",
    plannedCapabilities: [
      "Independent baseline reconstruction on reduced topology",
      "Multi-run execution with strict match verification (3/3 runs)",
      "Confirmation of minimal failure scenario integrity",
    ],
  },
  "what-if": {
    category: "ANALYSIS",
    title: "What-If Resilience",
    workflowStep: 11,
    description: "Prospective failure simulation modeling the resilience of alternate paths and blast radius without altering active topology.",
    plannedCapabilities: [
      "Non-destructive prospective link/node failure simulation",
      "Dynamic alternate path rerouting checks",
      "Blast radius scope classification (None, Localized, Partitioned, Widespread)",
    ],
  },
  "history": {
    category: "EXPERIMENTS",
    title: "Experiment History",
    workflowStep: 12,
    description: "Historical log of conducted failure experiments, causal reductions, and validation reports.",
    plannedCapabilities: [
      "Audit trail of all executed reduction and reproduction runs",
      "Comparative metrics between original and reduced topologies",
      "Exportable JSON artifacts for research presentation",
    ],
  },
};

export default function ModulePlaceholder({ viewId }: { viewId: NavViewId }) {
  const { setActiveView, savedNetworks, loadSavedNetwork } = useNetworkProject();
  const meta = MODULE_DEFINITIONS[viewId] || MODULE_DEFINITIONS["test-observe"];

  // Special presentation for Saved Networks
  if (viewId === "saved-networks") {
    return (
      <div className="h-full w-full overflow-y-auto p-8 bg-slate-50">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                NETWORK / SAVED TOPOLOGIES
              </span>
              <h1 className="text-xl font-semibold text-slate-900 mt-1">Saved Networks</h1>
            </div>
            <button
              onClick={() => setActiveView("network-builder")}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition cursor-pointer"
            >
              Open Network Builder
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedNetworks.map((net) => (
              <div
                key={net.id}
                className="bg-white border border-slate-200 rounded-md p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{net.name}</h3>
                    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {net.nodeCount}N • {net.linkCount}L
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">{net.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Modified: {net.lastModified}</span>
                  <button
                    onClick={() => loadSavedNetwork(net.id)}
                    className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition cursor-pointer"
                  >
                    Load into Workspace →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto p-8 bg-slate-50 flex items-center justify-center">
      <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-md p-8 shadow-xs">
        {/* Module Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {meta.category}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-medium text-slate-500">
              Workflow Step {meta.workflowStep} of 11
            </span>
          </div>

          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Phase Scheduled
          </span>
        </div>

        {/* Title & Description */}
        <div className="mt-5">
          <h2 className="text-lg font-semibold text-slate-900">{meta.title}</h2>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">{meta.description}</p>
        </div>

        {/* Architecture Specs */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Planned Module Capabilities
          </h3>
          <ul className="space-y-2">
            {meta.plannedCapabilities.map((cap, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700">
                <span className="text-blue-500 font-mono text-[11px] mt-0.5">0{i + 1}.</span>
                <span>{cap}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Status Callout */}
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded p-3.5 flex items-center justify-between text-xs text-slate-600">
          <span>This module interface will be reconstructed in an upcoming phase.</span>
          <button
            onClick={() => setActiveView("network-builder")}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer hover:underline"
          >
            Return to Network Builder →
          </button>
        </div>
      </div>
    </div>
  );
}
