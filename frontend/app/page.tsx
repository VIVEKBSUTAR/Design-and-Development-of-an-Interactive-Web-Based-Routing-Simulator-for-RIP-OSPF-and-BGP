"use client";

import React, { useState, useEffect, useCallback } from "react";
import AppShell from "./components/AppShell";
import ModulePlaceholder from "./components/ModulePlaceholder";
import NetworkCanvas from "./components/NetworkCanvas";
import DevicePalette from "./components/DevicePalette";
import NodeInspector from "./components/NodeInspector";
import SaveNetworkModal from "./components/SaveNetworkModal";
import TestAndObserveView from "./components/TestAndObserveView";
import NetworkIntelligenceView from "./components/NetworkIntelligenceView";
import FaultInjectionView from "./components/FaultInjectionView";
import FailureDetectionView from "./components/FailureDetectionView";
import DiagnosisView from "./components/DiagnosisView";
import CausalAnalysisView from "./components/CausalAnalysisView";
import ReductionView from "./components/ReductionView";
import ReproductionView from "./components/ReproductionView";
import WhatIfView from "./components/WhatIfView";
import HistoryView from "./components/HistoryView";
import SavedNetworksView from "./components/SavedNetworksView";
import {
  NetworkProjectProvider,
  useNetworkProject,
} from "./context/NetworkProjectContext";
import {
  TopologyNode,
  TopologyLink,
  TopologyData,
} from "./types";

const API_BASE = "http://localhost:8000";

function NetworkBuilderWorkspace() {
  const {
    activeView,
    setActiveView,
    currentNetwork,
    setCurrentNetwork,
    currentRevision,
    saveCurrentNetwork,
  } = useNetworkProject();

  // Topology State
  const [nodes, setNodes] = useState<TopologyNode[]>([]);
  const [links, setLinks] = useState<TopologyLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [isConnectingCable, setIsConnectingCable] = useState(false);

  // Viewport transforms (Pan & Zoom)
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Save Modal & Feedback State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Backend connection state
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);

  // Fetch initial topology from backend
  const fetchTopology = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/topology`);
      if (res.ok) {
        const data: TopologyData = await res.json();
        setNodes(data.nodes || []);
        setLinks(data.links || []);
        setCurrentNetwork(data);
        setBackendConnected(true);
      } else {
        setBackendConnected(false);
      }
    } catch {
      setBackendConnected(false);
    }
  }, [setCurrentNetwork]);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology]);

  // Synchronize with currentNetwork when loaded from Saved Networks catalogue
  useEffect(() => {
    if (currentNetwork && currentNetwork.nodes && currentNetwork.nodes.length > 0) {
      setNodes(currentNetwork.nodes);
      setLinks(currentNetwork.links || []);
    }
  }, [currentNetwork]);

  // Show temporary toast feedback
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. ADD NODE
  const handleAddNode = async (type: "router" | "host" | "switch" | "server") => {
    const typeCount = nodes.filter((n) => n.type === type).length + 1;
    const prefix = type === "router" ? "R" : type === "switch" ? "SW" : type === "server" ? "SRV" : "PC";
    const id = `${prefix}${typeCount + 5}`;
    const name = id;

    // Center in current viewport world coordinates
    const container = document.getElementById("canvas-viewport-container");
    const cw = container ? container.clientWidth : 800;
    const ch = container ? container.clientHeight : 500;
    const defaultX = Math.round((cw / 2 - pan.x) / zoom) + (Math.random() * 60 - 30);
    const defaultY = Math.round((ch / 2 - pan.y) / zoom) + (Math.random() * 60 - 30);

    const newNode: TopologyNode = {
      id,
      name,
      type,
      health_status: "up",
      x: defaultX,
      y: defaultY,
    };

    // Optimistic UI update
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
    setCurrentNetwork({ nodes: updatedNodes, links });
    setSelectedNodeId(id);
    setSelectedLinkId(null);

    try {
      const res = await fetch(`${API_BASE}/api/topology/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          label: name,
          node_type: type,
          health_status: "up",
          x: defaultX,
          y: defaultY,
        }),
      });

      if (!res.ok) {
        await fetchTopology();
      }
    } catch (err) {
      console.error("Failed to add node to backend:", err);
    }
  };

  // 2. UPDATE NODE POSITION (during drag)
  const handleUpdateNodePosition = (id: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, x, y } : n))
    );
  };

  // Persist position to backend on drag release
  const handleNodeDragEnd = async (id: string, x: number, y: number) => {
    try {
      await fetch(`${API_BASE}/api/topology/nodes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      });
      setCurrentNetwork({ nodes, links });
    } catch (err) {
      console.error("Failed to update node coordinates on backend:", err);
    }
  };

  // 3. RENAME NODE
  const handleRenameNode = async (nodeId: string, newName: string) => {
    const updatedNodes = nodes.map((n) => (n.id === nodeId ? { ...n, name: newName } : n));
    setNodes(updatedNodes);
    setCurrentNetwork({ nodes: updatedNodes, links });

    try {
      const res = await fetch(`${API_BASE}/api/topology/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newName }),
      });
      if (res.ok) {
        showToast(`Device renamed to '${newName}'`);
      }
    } catch (err) {
      console.error("Failed to rename node on backend:", err);
    }
  };

  // 4. DELETE NODE
  const handleDeleteNode = async (nodeId: string) => {
    const updatedNodes = nodes.filter((n) => n.id !== nodeId);
    const updatedLinks = links.filter((l) => l.source !== nodeId && l.destination !== nodeId);
    setNodes(updatedNodes);
    setLinks(updatedLinks);
    setSelectedNodeId(null);
    setCurrentNetwork({ nodes: updatedNodes, links: updatedLinks });

    try {
      const res = await fetch(`${API_BASE}/api/topology/nodes/${nodeId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast(`Device '${nodeId}' deleted`);
      }
    } catch (err) {
      console.error("Failed to delete node on backend:", err);
    }
  };

  // 5. CONNECT CABLE (Create Link)
  const handleCableConnected = async (source: string, destination: string) => {
    setIsConnectingCable(false);

    // Prevent duplicate link
    const exists = links.some(
      (l) =>
        (l.source === source && l.destination === destination) ||
        (l.source === destination && l.destination === source)
    );

    if (exists || source === destination) {
      return;
    }

    const newLink: TopologyLink = { source, destination, status: "up" };
    const updatedLinks = [...links, newLink];
    setLinks(updatedLinks);
    setCurrentNetwork({ nodes, links: updatedLinks });
    setSelectedLinkId(`${source}-${destination}`);
    showToast(`Cable connected: ${source} ⟷ ${destination}`);

    try {
      const res = await fetch(`${API_BASE}/api/topology/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, destination, status: "up" }),
      });
      if (!res.ok) {
        await fetchTopology();
      }
    } catch (err) {
      console.error("Failed to create link on backend:", err);
    }
  };

  // 6. DELETE LINK
  const handleDeleteLink = async (source: string, destination: string) => {
    const updatedLinks = links.filter(
      (l) =>
        !(
          (l.source === source && l.destination === destination) ||
          (l.source === destination && l.destination === source)
        )
    );
    setLinks(updatedLinks);
    setSelectedLinkId(null);
    setCurrentNetwork({ nodes, links: updatedLinks });
    showToast(`Cable severed and removed: ${source} ⟷ ${destination}`);

    try {
      await fetch(`${API_BASE}/api/topology/links`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, destination }),
      });
    } catch (err) {
      console.error("Failed to delete link on backend:", err);
    }
  };

  // 7. RESET TOPOLOGY TO BASELINE
  const handleResetTopology = async () => {
    try {
      await fetch(`${API_BASE}/api/topology/reset`, { method: "POST" });
      await fetchTopology();
      setSelectedNodeId(null);
      setSelectedLinkId(null);
      setIsConnectingCable(false);
      showToast("Network restored to default baseline topology");
    } catch (err) {
      console.error("Failed to reset topology:", err);
    }
  };

  // 8. CLEAR CANVAS
  const handleClearCanvas = () => {
    setNodes([]);
    setLinks([]);
    setSelectedNodeId(null);
    setSelectedLinkId(null);
    setIsConnectingCable(false);
    setCurrentNetwork({ nodes: [], links: [] });
    showToast("Workspace canvas cleared");
  };

  // 9. SAVE NETWORK
  const handleSaveNetwork = (name: string, description: string) => {
    saveCurrentNetwork(name, description);
    showToast(`Network '${name}' saved to catalogue`);
  };

  // 10. FIT TO VIEW
  const handleFitToScreen = () => {
    if (nodes.length === 0) return;
    const xs = nodes.map((n) => n.x ?? 0);
    const ys = nodes.map((n) => n.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 100;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    const container = document.getElementById("canvas-viewport-container");
    const cw = container ? container.clientWidth : 800;
    const ch = container ? container.clientHeight : 500;

    const scaleX = cw / contentWidth;
    const scaleY = ch / contentHeight;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.5);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: cw / 2 - centerX * newZoom,
      y: ch / 2 - centerY * newZoom,
    });
  };

  // 11. RESET VIEWPORT
  const handleResetViewport = () => {
    const container = document.getElementById("canvas-viewport-container");
    const cw = container ? container.clientWidth : 800;
    const ch = container ? container.clientHeight : 500;
    setZoom(1.0);
    setPan({
      x: cw / 2 - 450,
      y: ch / 2 - 270,
    });
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedLink =
    links.find(
      (l) =>
        `${l.source}-${l.destination}` === selectedLinkId ||
        `${l.destination}-${l.source}` === selectedLinkId
    ) || null;

  return (
    <AppShell backendOnline={backendConnected}>
      {activeView === "network-builder" ? (
        <div className="flex flex-col h-full w-full overflow-hidden bg-slate-100 text-slate-800">
          {/* Top Sub-Bar: Network Builder Title, Active Network, and [Save Network] */}
          <div className="h-11 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-10 select-none shadow-2xs">
            {/* Left: View Identity */}
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm text-slate-900 tracking-tight">
                Network Builder
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Topology Editor & Device Configuration
              </span>
            </div>

            {/* Center: Active Network & Revision */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded text-xs">
              <span className="text-slate-400 font-medium">Active:</span>
              <span className="font-semibold text-slate-800 font-mono">
                {currentRevision.name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
                rev {currentRevision.revisionNumber}.0
              </span>
            </div>

            {/* Right: Save Network Button */}
            <div className="flex items-center gap-3">
              {toastMessage && (
                <div className="text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded animate-in fade-in slide-in-from-right-2 duration-150">
                  {toastMessage}
                </div>
              )}

              <button
                onClick={() => setIsSaveModalOpen(true)}
                className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Save current topology snapshot"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>Save Network</span>
              </button>
            </div>
          </div>

          {/* Central Workspace: Devices Palette | Full Network Canvas | Node/Link Inspector */}
          <div className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
            {/* Left: Device Palette */}
            <DevicePalette
              onAddNode={handleAddNode}
              isConnectingCable={isConnectingCable}
              onToggleCableMode={() => setIsConnectingCable((prev) => !prev)}
              onResetTopology={handleResetTopology}
              onClearCanvas={handleClearCanvas}
            />

            {/* Center: Full Network Canvas */}
            <div
              id="canvas-viewport-container"
              className="flex-1 h-full flex flex-col min-w-0 relative shadow-2xs rounded-lg overflow-hidden"
            >
              <NetworkCanvas
                mode="edit"
                nodes={nodes}
                links={links}
                selectedNodeId={selectedNodeId}
                selectedLinkId={selectedLinkId}
                onSelectNode={(id) => {
                  setSelectedNodeId(id);
                  if (id) setSelectedLinkId(null);
                }}
                onSelectLink={(id) => {
                  setSelectedLinkId(id);
                  if (id) setSelectedNodeId(null);
                }}
                onUpdateNodePosition={handleUpdateNodePosition}
                onNodeDragEnd={handleNodeDragEnd}
                isConnectingCable={isConnectingCable}
                onCableConnected={handleCableConnected}
                onCancelCable={() => setIsConnectingCable(false)}
                onDeleteNode={handleDeleteNode}
                onDeleteLink={handleDeleteLink}
                zoom={zoom}
                setZoom={setZoom}
                pan={pan}
                setPan={setPan}
              />
            </div>

            {/* Right: Compact Node & Link Inspector */}
            <NodeInspector
              selectedNode={selectedNode}
              selectedLink={selectedLink}
              allLinks={links}
              onRenameNode={handleRenameNode}
              onDeleteNode={handleDeleteNode}
              onDeleteLink={handleDeleteLink}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                setSelectedLinkId(null);
              }}
            />
          </div>

          {/* Bottom Canvas Controls Bar: Device Count & Zoom Controls */}
          <div className="h-9 bg-white border-t border-slate-200 px-5 flex items-center justify-between shrink-0 select-none text-xs text-slate-600">
            {/* Left: Topology Counts */}
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-800">
                Nodes: <span className="font-mono text-blue-600">{nodes.length}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-slate-800">
                Links: <span className="font-mono text-blue-600">{links.length}</span>
              </span>
              {isConnectingCable && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                    Wiring Mode Active (Click 2 devices)
                  </span>
                </>
              )}
            </div>

            {/* Center: Helpful Status Tip */}
            <div className="hidden md:flex items-center gap-2 text-slate-400 text-[11px]">
              <span>Pan: Drag canvas background</span>
              <span>•</span>
              <span>Zoom: Scroll wheel</span>
              <span>•</span>
              <span>Delete: Backspace / Del</span>
            </div>

            {/* Right: Viewport Zoom Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom((prev) => Math.max(prev * 0.88, 0.25))}
                className="w-6 h-6 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs transition cursor-pointer"
                title="Zoom Out (−)"
              >
                −
              </button>
              <span className="font-mono text-[11px] font-semibold text-slate-700 px-1 w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((prev) => Math.min(prev * 1.12, 3.0))}
                className="w-6 h-6 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs transition cursor-pointer"
                title="Zoom In (+)"
              >
                +
              </button>
              <span className="text-slate-200 mx-1">|</span>
              <button
                onClick={handleFitToScreen}
                className="px-2 py-0.5 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                title="Fit all devices into viewport"
              >
                Fit
              </button>
              <button
                onClick={handleResetViewport}
                className="px-2 py-0.5 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium transition cursor-pointer"
                title="Reset zoom to 100% and center"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Save Network Modal */}
          <SaveNetworkModal
            isOpen={isSaveModalOpen}
            onClose={() => setIsSaveModalOpen(false)}
            onSave={handleSaveNetwork}
            currentTopology={{ nodes, links }}
            defaultName={currentRevision.name}
          />
        </div>
      ) : activeView === "test-observe" ? (
        <TestAndObserveView />
      ) : activeView === "network-intelligence" ? (
        <NetworkIntelligenceView />
      ) : activeView === "fault-injection" ? (
        <FaultInjectionView />
      ) : activeView === "failure-detection" ? (
        <FailureDetectionView />
      ) : activeView === "diagnosis" ? (
        <DiagnosisView />
      ) : activeView === "causal-analysis" || activeView === "failure-signature" ? (
        <CausalAnalysisView />
      ) : activeView === "reduction" ? (
        <ReductionView />
      ) : activeView === "reproduction" ? (
        <ReproductionView />
      ) : activeView === "what-if" ? (
        <WhatIfView />
      ) : activeView === "saved-networks" ? (
        <SavedNetworksView />
      ) : activeView === "history" ? (
        <HistoryView onRunNewInvestigation={() => setActiveView("fault-injection")} />
      ) : (
        <ModulePlaceholder viewId={activeView} />
      )}
    </AppShell>
  );
}

export default function Home() {
  return (
    <NetworkProjectProvider>
      <NetworkBuilderWorkspace />
    </NetworkProjectProvider>
  );
}
