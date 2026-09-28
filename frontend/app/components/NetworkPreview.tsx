"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import NetworkCanvas from "./NetworkCanvas";
import { TopologyData } from "../types";
import { useNetworkProject } from "../context/NetworkProjectContext";

export interface NetworkPreviewProps {
  network?: TopologyData;
  title?: string;
  subtitle?: string;
  selectedNodeId?: string | null;
  selectedLinkId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onSelectLink?: (linkId: string | null) => void;
  highlightedPath?: string[];
  highlightedLinks?: string[];
  highlightedFaultNodeId?: string | null;
  highlightedFaultLinkId?: string | null;
  activePacketPos?: { x: number; y: number; label: string; isDrop?: boolean } | null;
  className?: string;
}

export default function NetworkPreview({
  network,
  title = "NETWORK TOPOLOGY",
  subtitle = "Read-Only Topology Preview",
  selectedNodeId: controlledSelectedNodeId,
  selectedLinkId: controlledSelectedLinkId,
  onSelectNode: controlledOnSelectNode,
  onSelectLink: controlledOnSelectLink,
  highlightedPath,
  highlightedLinks,
  highlightedFaultNodeId,
  highlightedFaultLinkId,
  activePacketPos,
  className = "",
}: NetworkPreviewProps) {
  const context = useNetworkProject();
  const effectiveNetwork = network || context.currentNetwork;

  const nodes = effectiveNetwork.nodes || [];
  const links = effectiveNetwork.links || [];

  // Internal selection state if not controlled
  const [internalSelectedNodeId, setInternalSelectedNodeId] = useState<string | null>(null);
  const [internalSelectedLinkId, setInternalSelectedLinkId] = useState<string | null>(null);

  const selectedNodeId =
    controlledSelectedNodeId !== undefined ? controlledSelectedNodeId : internalSelectedNodeId;
  const selectedLinkId =
    controlledSelectedLinkId !== undefined ? controlledSelectedLinkId : internalSelectedLinkId;

  const handleSelectNode = (id: string | null) => {
    if (controlledOnSelectNode) {
      controlledOnSelectNode(id);
    } else {
      setInternalSelectedNodeId(id);
      if (id) setInternalSelectedLinkId(null);
    }
  };

  const handleSelectLink = (id: string | null) => {
    if (controlledOnSelectLink) {
      controlledOnSelectLink(id);
    } else {
      setInternalSelectedLinkId(id);
      if (id) setInternalSelectedNodeId(null);
    }
  };

  // Self-managed viewport transform for preview
  const [zoom, setZoom] = useState<number>(0.85);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Auto-fit function
  const fitToView = useCallback(() => {
    if (nodes.length === 0 || !previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    const xs = nodes.map((n) => n.x ?? 0);
    const ys = nodes.map((n) => n.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 60;
    const contentW = maxX - minX + padding * 2 || 400;
    const contentH = maxY - minY + padding * 2 || 300;

    const scaleX = (rect.width - 24) / contentW;
    const scaleY = (rect.height - 24) / contentH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.2);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(newZoom);
    setPan({
      x: rect.width / 2 - centerX * newZoom,
      y: rect.height / 2 - centerY * newZoom,
    });
  }, [nodes]);

  // Initial fit when nodes change or component mounts
  useEffect(() => {
    const timer = setTimeout(fitToView, 50);
    return () => clearTimeout(timer);
  }, [fitToView]);

  const handleResetViewport = () => {
    setZoom(1.0);
    if (!previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    setPan({
      x: rect.width / 2 - 450,
      y: rect.height / 2 - 270,
    });
  };

  // Status stats
  const downNodesCount = nodes.filter((n) => n.health_status === "down").length;
  const downLinksCount = links.filter((l) => l.status === "down").length;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedLink =
    links.find(
      (l) =>
        `${l.source}-${l.destination}` === selectedLinkId ||
        `${l.destination}-${l.source}` === selectedLinkId
    ) || null;

  return (
    <div
      className={`flex flex-col h-full bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden select-none ${className}`}
    >
      {/* 1. PREVIEW HEADER */}
      <div className="h-10 bg-slate-50 border-b border-slate-200 px-3.5 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-[11px] font-mono tracking-wider uppercase">
            {title}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {nodes.length} Devices • {links.length} Links
          </span>
          {downLinksCount > 0 ? (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200 font-mono">
              ● {downLinksCount} LINK DOWN
            </span>
          ) : downNodesCount > 0 ? (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200 font-mono">
              ● {downNodesCount} NODE DOWN
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 font-mono">
              ● ALL UP
            </span>
          )}
        </div>

        {/* Viewport Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom((prev) => Math.max(prev * 0.88, 0.25))}
            className="w-5 h-5 rounded bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs transition cursor-pointer"
            title="Zoom Out"
          >
            −
          </button>
          <span className="font-mono text-[10px] text-slate-600 px-1 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((prev) => Math.min(prev * 1.12, 3.0))}
            className="w-5 h-5 rounded bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs transition cursor-pointer"
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={fitToView}
            className="px-1.5 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-medium transition cursor-pointer ml-1"
            title="Fit to bounds"
          >
            Fit
          </button>
          <button
            onClick={handleResetViewport}
            className="px-1.5 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-medium transition cursor-pointer"
            title="Reset zoom"
          >
            Reset
          </button>
        </div>
      </div>

      {/* 2. READ-ONLY CANVAS VIEWPORT */}
      <div ref={previewContainerRef} className="flex-1 relative overflow-hidden bg-slate-50 min-h-0">
        <NetworkCanvas
          mode="preview"
          nodes={nodes}
          links={links}
          selectedNodeId={selectedNodeId}
          selectedLinkId={selectedLinkId}
          onSelectNode={handleSelectNode}
          onSelectLink={handleSelectLink}
          zoom={zoom}
          setZoom={setZoom}
          pan={pan}
          setPan={setPan}
          highlightedPath={highlightedPath}
          highlightedLinks={highlightedLinks}
          highlightedFaultNodeId={highlightedFaultNodeId}
          highlightedFaultLinkId={highlightedFaultLinkId}
          activePacketPos={activePacketPos}
        />
      </div>

      {/* 3. COMPACT FOOTER STATUS STRIP */}
      <div className="h-7 bg-white border-t border-slate-200 px-3 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
        <div>
          {selectedNode ? (
            <span className="text-slate-800 font-medium">
              Selected: <strong className="font-mono text-blue-600">{selectedNode.name}</strong> ({selectedNode.type} •{" "}
              <span className={selectedNode.health_status === "down" ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                {selectedNode.health_status?.toUpperCase() || "UP"}
              </span>
              )
            </span>
          ) : selectedLink ? (
            <span className="text-slate-800 font-medium">
              Selected Link:{" "}
              <strong className="font-mono text-blue-600">
                {selectedLink.source} ⟷ {selectedLink.destination}
              </strong>{" "}
              (
              <span className={selectedLink.status === "down" ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                {selectedLink.status.toUpperCase()}
              </span>
              )
            </span>
          ) : (
            <span className="text-slate-400 italic">Click any device or link to view status</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">
            Read-Only Preview
          </span>
        </div>
      </div>
    </div>
  );
}
