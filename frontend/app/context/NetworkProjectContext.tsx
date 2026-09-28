"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import {
  TopologyData,
  FailureSignatureData,
  ReductionExperimentResponse,
  ReproductionResponse,
  FullInvestigationRecord,
} from "../types";

export type NavViewId =
  | "network-builder"
  | "saved-networks"
  | "network-intelligence"
  | "test-observe"
  | "fault-injection"
  | "network-monitor"
  | "failure-detection"
  | "failure-signature"
  | "causal-analysis"
  | "diagnosis"
  | "reduction"
  | "reproduction"
  | "what-if"
  | "history";

export interface NetworkRevision {
  id: string;
  revisionNumber: number;
  name: string;
  description?: string;
  topology: TopologyData;
  createdAt: string;
  parentRevisionId?: string | null;
}

export interface SavedNetworkItem {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  linkCount: number;
  lastModified: string;
  topology: TopologyData;
}

export interface ExperimentSession {
  id: string;
  networkRevisionId: string;
  status: "idle" | "running" | "completed" | "failed";
  targetFailure?: FailureSignatureData | null;
  reductionResult?: ReductionExperimentResponse | null;
  reproductionResult?: ReproductionResponse | null;
  timestamp: string;
}

export interface NetworkProjectContextType {
  activeView: NavViewId;
  setActiveView: (view: NavViewId) => void;
  // Current working network topology
  currentNetwork: TopologyData;
  setCurrentNetwork: (topology: TopologyData) => void;
  // Active revision metadata
  currentRevision: NetworkRevision;
  createNewRevision: (name: string, description?: string, topology?: TopologyData) => void;
  // Saved network catalogue
  savedNetworks: SavedNetworkItem[];
  loadSavedNetwork: (networkId: string) => void;
  saveCurrentNetwork: (name: string, description: string) => void;
  // Master Reset
  resetToBaseline: () => Promise<void>;
  // Experiment session tracking
  currentExperiment: ExperimentSession | null;
  setCurrentExperiment: (session: ExperimentSession | null) => void;
  experimentHistory: ExperimentSession[];
  addExperimentToHistory: (session: ExperimentSession) => void;
  // Shared Master Investigation Record (from 11-stage pipeline)
  lastInvestigationRecord: FullInvestigationRecord | null;
  setLastInvestigationRecord: (record: FullInvestigationRecord | null) => void;
}

export const defaultBaselineTopology: TopologyData = {
  nodes: [
    { id: "PC1", name: "PC1", type: "host", health_status: "up", x: 120, y: 220 },
    { id: "R1", name: "R1", type: "router", health_status: "up", x: 280, y: 220 },
    { id: "R2", name: "R2", type: "router", health_status: "up", x: 440, y: 220 },
    { id: "R3", name: "R3", type: "router", health_status: "up", x: 600, y: 220 },
    { id: "Server", name: "Server", type: "server", health_status: "up", x: 760, y: 220 },
    { id: "R4", name: "R4", type: "router", health_status: "up", x: 440, y: 360 },
    { id: "PC2", name: "PC2", type: "host", health_status: "up", x: 600, y: 360 },
  ],
  links: [
    { source: "PC1", destination: "R1", status: "up" },
    { source: "R1", destination: "R2", status: "up" },
    { source: "R2", destination: "R3", status: "up" },
    { source: "R3", destination: "Server", status: "up" },
    { source: "R2", destination: "R4", status: "up" },
    { source: "R4", destination: "PC2", status: "up" },
  ],
};

const initialRevision: NetworkRevision = {
  id: "rev-baseline-001",
  revisionNumber: 1,
  name: "Campus Network (Baseline)",
  description: "Standard 7-node baseline topology with dual-branch routing",
  topology: defaultBaselineTopology,
  createdAt: "2026-09-24T20:00:00Z",
  parentRevisionId: null,
};

const initialSavedNetworks: SavedNetworkItem[] = [
  {
    id: "net-campus-baseline",
    name: "Campus Network (Baseline)",
    description: "7 nodes / 6 links: PC1, R1, R2, R3, Server with redundant R4-PC2 branch",
    nodeCount: 7,
    linkCount: 6,
    lastModified: "2026-09-24",
    topology: defaultBaselineTopology,
  },
  {
    id: "net-minimal-reduced",
    name: "Reduced Core Network",
    description: "5 nodes / 4 links: Essential failure path after dependency reduction",
    nodeCount: 5,
    linkCount: 4,
    lastModified: "2026-09-24",
    topology: {
      nodes: defaultBaselineTopology.nodes.filter(
        (n) => n.id !== "PC2" && n.id !== "R4"
      ),
      links: defaultBaselineTopology.links.filter(
        (l) => l.destination !== "PC2" && l.destination !== "R4" && l.source !== "R4"
      ),
    },
  },
];

const NetworkProjectContext = createContext<NetworkProjectContextType | undefined>(undefined);

export function NetworkProjectProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<NavViewId>("network-builder");
  const [currentNetwork, setCurrentNetwork] = useState<TopologyData>(defaultBaselineTopology);
  const [currentRevision, setCurrentRevision] = useState<NetworkRevision>(initialRevision);
  const [savedNetworks, setSavedNetworks] = useState<SavedNetworkItem[]>(initialSavedNetworks);
  const [currentExperiment, setCurrentExperiment] = useState<ExperimentSession | null>(null);
  const [experimentHistory, setExperimentHistory] = useState<ExperimentSession[]>([]);
  const [lastInvestigationRecord, setLastInvestigationRecord] = useState<FullInvestigationRecord | null>(null);

  const createNewRevision = (name: string, description?: string, topology?: TopologyData) => {
    const newRev: NetworkRevision = {
      id: `rev-${Date.now()}`,
      revisionNumber: currentRevision.revisionNumber + 1,
      name,
      description,
      topology: topology || currentNetwork,
      createdAt: new Date().toISOString(),
      parentRevisionId: currentRevision.id,
    };
    setCurrentRevision(newRev);
    if (topology) {
      setCurrentNetwork(topology);
    }
  };

  const loadSavedNetwork = (networkId: string) => {
    const found = savedNetworks.find((n) => n.id === networkId);
    if (found) {
      setCurrentNetwork(found.topology);
      createNewRevision(found.name, found.description, found.topology);
      setActiveView("network-builder");
    }
  };

  const saveCurrentNetwork = (name: string, description: string) => {
    const newItem: SavedNetworkItem = {
      id: `net-${Date.now()}`,
      name,
      description,
      nodeCount: currentNetwork.nodes.length,
      linkCount: currentNetwork.links.length,
      lastModified: new Date().toISOString().slice(0, 10),
      topology: currentNetwork,
    };
    setSavedNetworks((prev) => [newItem, ...prev]);
    createNewRevision(name, description, currentNetwork);
  };

  const resetToBaseline = async () => {
    try {
      await fetch("http://localhost:8000/api/topology/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetch("http://localhost:8000/api/faults/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Ignore network errors in local dev
    }
    setCurrentNetwork(defaultBaselineTopology);
    setCurrentRevision({
      id: "rev-baseline-reset",
      revisionNumber: 1,
      name: "Campus Network (Baseline)",
      description: "Standard 7-node baseline topology (Reset)",
      topology: defaultBaselineTopology,
      createdAt: new Date().toISOString(),
      parentRevisionId: null,
    });
  };

  const addExperimentToHistory = (session: ExperimentSession) => {
    setExperimentHistory((prev) => [session, ...prev]);
  };

  return (
    <NetworkProjectContext.Provider
      value={{
        activeView,
        setActiveView,
        currentNetwork,
        setCurrentNetwork,
        currentRevision,
        createNewRevision,
        savedNetworks,
        loadSavedNetwork,
        saveCurrentNetwork,
        resetToBaseline,
        currentExperiment,
        setCurrentExperiment,
        experimentHistory,
        addExperimentToHistory,
        lastInvestigationRecord,
        setLastInvestigationRecord,
      }}
    >
      {children}
    </NetworkProjectContext.Provider>
  );
}

export function useNetworkProject() {
  const context = useContext(NetworkProjectContext);
  if (!context) {
    throw new Error("useNetworkProject must be used within a NetworkProjectProvider");
  }
  return context;
}
