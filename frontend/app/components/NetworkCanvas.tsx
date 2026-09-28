"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { TopologyNode, TopologyLink } from "../types";

export interface NetworkCanvasProps {
  mode?: "edit" | "preview";
  nodes: TopologyNode[];
  links: TopologyLink[];
  selectedNodeId?: string | null;
  selectedLinkId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onSelectLink?: (linkId: string | null) => void;
  onUpdateNodePosition?: (id: string, x: number, y: number) => void;
  onNodeDragEnd?: (id: string, x: number, y: number) => void;
  isConnectingCable?: boolean;
  onCableConnected?: (source: string, destination: string) => void;
  onCancelCable?: () => void;
  onDeleteNode?: (id: string) => void;
  onDeleteLink?: (source: string, destination: string) => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  // Optional future visual overlays (for testing and analysis pages)
  highlightedPath?: string[];
  highlightedLinks?: string[];
  highlightedFaultNodeId?: string | null;
  highlightedFaultLinkId?: string | null;
  activePacketPos?: { x: number; y: number; label: string; isDrop?: boolean } | null;
}

export default function NetworkCanvas({
  mode = "edit",
  nodes,
  links,
  selectedNodeId = null,
  selectedLinkId = null,
  onSelectNode,
  onSelectLink,
  onUpdateNodePosition,
  onNodeDragEnd,
  isConnectingCable = false,
  onCableConnected,
  onCancelCable,
  onDeleteNode,
  onDeleteLink,
  zoom,
  setZoom,
  pan,
  setPan,
  highlightedPath,
  highlightedLinks,
  highlightedFaultNodeId,
  highlightedFaultLinkId,
  activePacketPos,
}: NetworkCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Dragging state (only used in edit mode)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Panning state (available in both edit and preview modes)
  const [isPanning, setIsPanning] = useState(false);
  const [panStartMouse, setPanStartMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panStartPos, setPanStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Cable creation state (strictly edit mode only)
  const [cableSourceNodeId, setCableSourceNodeId] = useState<string | null>(null);
  const [hoveredTargetNodeId, setHoveredTargetNodeId] = useState<string | null>(null);
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Fast node lookup map
  const nodeMap = new Map<string, TopologyNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Convert client viewport coordinates to SVG world space
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return {
        x: (screenX - pan.x) / zoom,
        y: (screenY - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // Wheel zoom centered on mouse cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.25), 3.0);

    const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  // Canvas Mouse Down (initiates background pan or clears selection)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      // Primary left click on canvas background
      setIsPanning(true);
      setPanStartMouse({ x: e.clientX, y: e.clientY });
      setPanStartPos({ ...pan });
      onSelectNode?.(null);
      onSelectLink?.(null);
    } else if (e.button === 1) {
      // Middle click pan
      setIsPanning(true);
      setPanStartMouse({ x: e.clientX, y: e.clientY });
      setPanStartPos({ ...pan });
    }
  };

  // Node Mouse Down
  const handleNodeMouseDown = (e: React.MouseEvent, node: TopologyNode) => {
    e.stopPropagation();

    // In preview mode: strictly read-only selection, no dragging or cable wiring
    if (mode === "preview") {
      onSelectNode?.(node.id);
      onSelectLink?.(null);
      return;
    }

    if (isConnectingCable) {
      if (!cableSourceNodeId) {
        setCableSourceNodeId(node.id);
      } else if (cableSourceNodeId === node.id) {
        setCableSourceNodeId(null);
      } else {
        onCableConnected?.(cableSourceNodeId, node.id);
        setCableSourceNodeId(null);
        setHoveredTargetNodeId(null);
      }
      return;
    }

    // Edit mode: select and initiate drag
    onSelectNode?.(node.id);
    onSelectLink?.(null);

    const world = screenToWorld(e.clientX, e.clientY);
    setDraggingNodeId(node.id);
    setDragOffset({
      x: world.x - (node.x ?? 0),
      y: world.y - (node.y ?? 0),
    });
  };

  // Global Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setMouseWorldPos(world);

    if (isPanning) {
      setPan({
        x: panStartPos.x + (e.clientX - panStartMouse.x),
        y: panStartPos.y + (e.clientY - panStartMouse.y),
      });
      return;
    }

    if (draggingNodeId && mode === "edit") {
      const newX = world.x - dragOffset.x;
      const newY = world.y - dragOffset.y;
      onUpdateNodePosition?.(draggingNodeId, Math.round(newX), Math.round(newY));
    }
  };

  // Global Mouse Up
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (draggingNodeId && mode === "edit") {
      const node = nodeMap.get(draggingNodeId);
      if (node && onNodeDragEnd) {
        onNodeDragEnd(draggingNodeId, node.x ?? 0, node.y ?? 0);
      }
      setDraggingNodeId(null);
    }
  };

  // Keyboard navigation & shortcuts (Delete guarded strictly to edit mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "Escape") {
        if (cableSourceNodeId) {
          setCableSourceNodeId(null);
        } else if (isConnectingCable && onCancelCable) {
          onCancelCable();
        }
        onSelectNode?.(null);
        onSelectLink?.(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && mode === "edit") {
        if (selectedNodeId && onDeleteNode) {
          onDeleteNode(selectedNodeId);
        } else if (selectedLinkId && onDeleteLink) {
          const [source, destination] = selectedLinkId.split("-");
          if (source && destination) {
            onDeleteLink(source, destination);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mode,
    isConnectingCable,
    cableSourceNodeId,
    selectedNodeId,
    selectedLinkId,
    onCancelCable,
    onSelectNode,
    onSelectLink,
    onDeleteNode,
    onDeleteLink,
  ]);

  // Check if a link already exists between two node IDs
  const hasExistingLink = (idA: string, idB: string) => {
    return links.some(
      (l) =>
        (l.source === idA && l.destination === idB) ||
        (l.source === idB && l.destination === idA)
    );
  };

  // Render SVG Device Shape & Icon
  const renderDeviceGraphics = (
    type: string,
    isSelected: boolean,
    isDown: boolean,
    isUnknown: boolean,
    isCableTargetValid: boolean | null
  ) => {
    const baseStroke = isSelected
      ? "#2563eb"
      : isDown
      ? "#ef4444"
      : isCableTargetValid === true
      ? "#10b981"
      : isCableTargetValid === false
      ? "#ef4444"
      : isUnknown
      ? "#94a3b8"
      : "#64748b";

    const bgFill = isDown ? "#fff1f2" : "#ffffff";

    switch (type.toLowerCase()) {
      case "router":
        return (
          <g>
            <circle
              cx="0"
              cy="0"
              r="22"
              fill={bgFill}
              stroke={baseStroke}
              strokeWidth={isSelected || isDown ? 2.5 : 1.8}
              className="transition-colors duration-150"
            />
            <circle cx="0" cy="0" r="16" fill={isDown ? "#fee2e2" : "#eff6ff"} />
            <path
              d="M -7 -4 L 7 -4 M 3 -8 L 7 -4 L 3 0 M 7 4 L -7 4 M -3 0 L -7 4 L -3 8"
              stroke={isDown ? "#ef4444" : "#2563eb"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );

      case "switch":
        return (
          <g>
            <rect
              x="-22"
              y="-16"
              width="44"
              height="32"
              rx="5"
              fill={bgFill}
              stroke={baseStroke}
              strokeWidth={isSelected || isDown ? 2.5 : 1.8}
            />
            <rect x="-18" y="-12" width="36" height="24" rx="3" fill={isDown ? "#fee2e2" : "#eef2ff"} />
            <path
              d="M -10 -3 L 10 -3 M 6 -7 L 10 -3 L 6 1 M 10 3 L -10 3 M -6 -1 L -10 3 L -6 7"
              stroke={isDown ? "#ef4444" : "#4f46e5"}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );

      case "server":
        return (
          <g>
            <rect
              x="-22"
              y="-16"
              width="44"
              height="32"
              rx="4"
              fill={bgFill}
              stroke={baseStroke}
              strokeWidth={isSelected || isDown ? 2.5 : 1.8}
            />
            <rect x="-19" y="-13" width="38" height="11" rx="2" fill={isDown ? "#fee2e2" : "#fffbeb"} stroke="#fef3c7" />
            <circle cx="13" cy="-7.5" r="1.5" fill={isDown ? "#ef4444" : "#d97706"} />
            <line x1="-15" y1="-7.5" x2="6" y2="-7.5" stroke={isDown ? "#ef4444" : "#b45309"} strokeWidth="1.2" strokeLinecap="round" />

            <rect x="-19" y="2" width="38" height="11" rx="2" fill={isDown ? "#fee2e2" : "#fffbeb"} stroke="#fef3c7" />
            <circle cx="13" cy="7.5" r="1.5" fill={isDown ? "#ef4444" : "#10b981"} />
            <line x1="-15" y1="7.5" x2="6" y2="7.5" stroke={isDown ? "#ef4444" : "#b45309"} strokeWidth="1.2" strokeLinecap="round" />
          </g>
        );

      case "host":
      default:
        return (
          <g>
            <rect
              x="-18"
              y="-16"
              width="36"
              height="24"
              rx="3"
              fill={bgFill}
              stroke={baseStroke}
              strokeWidth={isSelected || isDown ? 2.5 : 1.8}
            />
            <rect x="-15" y="-13" width="30" height="18" rx="1.5" fill={isDown ? "#fee2e2" : "#ecfdf5"} />
            <path
              d="M -6 -4 L -1 1 L 6 -6"
              stroke={isDown ? "#ef4444" : "#059669"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M -4 8 L -4 12 L 4 12 L 4 8 Z" fill={baseStroke} />
            <line x1="-8" y1="12" x2="8" y2="12" stroke={baseStroke} strokeWidth="1.8" strokeLinecap="round" />
          </g>
        );
    }
  };

  const cableSourceNode = cableSourceNodeId ? nodeMap.get(cableSourceNodeId) : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none overflow-hidden bg-slate-50 border border-slate-200 rounded-lg ${
        isPanning
          ? "cursor-grabbing"
          : mode === "edit" && isConnectingCable
          ? "cursor-crosshair"
          : "cursor-default"
      }`}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 1. In-Canvas Instruction / Cable Banner (Edit mode only) */}
      {mode === "edit" && isConnectingCable && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-amber-500 text-white font-medium text-xs px-3.5 py-1.5 rounded-full shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <svg className="w-4 h-4 animate-spin text-amber-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span>
            {cableSourceNodeId
              ? `Select target device to wire from ${cableSourceNodeId}`
              : "Click first device to start cable connection"}
          </span>
          <button
            onClick={onCancelCable}
            className="ml-2 px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-[10px] font-bold uppercase cursor-pointer"
          >
            Esc Cancel
          </button>
        </div>
      )}

      {/* 2. Main SVG Viewport */}
      <svg ref={svgRef} className="w-full h-full">
        <defs>
          <pattern id="grid-dots-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="1.2" fill="#cbd5e1" opacity="0.8" />
          </pattern>
        </defs>

        {/* Background Grid Pattern */}
        <rect width="100%" height="100%" fill="url(#grid-dots-pattern)" />

        {/* Root Transformed Group for Pan & Zoom */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* LAYER 1: LINKS */}
          {links.map((link) => {
            const src = nodeMap.get(link.source);
            const dst = nodeMap.get(link.destination);
            if (!src || !dst) return null;

            const x1 = src.x ?? 100;
            const y1 = src.y ?? 100;
            const x2 = dst.x ?? 200;
            const y2 = dst.y ?? 200;

            const linkId = `${link.source}-${link.destination}`;
            const reverseLinkId = `${link.destination}-${link.source}`;
            const isSelected = selectedLinkId === linkId || selectedLinkId === reverseLinkId;
            const isDown = link.status === "down";
            const isWarning = link.status === "warning";
            const isHighlighted =
              highlightedLinks?.includes(linkId) || highlightedLinks?.includes(reverseLinkId);
            const isFaultLink =
              highlightedFaultLinkId === linkId || highlightedFaultLinkId === reverseLinkId;

            // Compute midpoint for status tag on failed links
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            const strokeColor = isSelected
              ? "#2563eb"
              : isDown || isFaultLink
              ? "#ef4444"
              : isWarning
              ? "#f59e0b"
              : isHighlighted
              ? "#3b82f6"
              : "#94a3b8";

            return (
              <g
                key={linkId}
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLink?.(linkId);
                  onSelectNode?.(null);
                }}
              >
                {/* Wider click target */}
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="18" />

                {/* Visible link line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth={isSelected || isHighlighted ? 3.5 : isDown ? 2.5 : 2}
                  strokeDasharray={isDown || isFaultLink ? "6 4" : undefined}
                  className="transition-colors duration-150 group-hover:stroke-blue-500"
                />

                {/* Selected link halo */}
                {isSelected && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#3b82f6"
                    strokeWidth="8"
                    strokeOpacity="0.25"
                    strokeLinecap="round"
                  />
                )}

                {/* Failed Link Indicator Badge at midpoint */}
                {isDown && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-20"
                      y="-9"
                      width="40"
                      height="18"
                      rx="3"
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth="1.2"
                      className="shadow-xs"
                    />
                    <text
                      x="0"
                      y="3.5"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="800"
                      className="pointer-events-none font-mono"
                    >
                      DOWN
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* LAYER 2: IN-PROGRESS CABLE PREVIEW (Edit mode only) */}
          {mode === "edit" && isConnectingCable && cableSourceNode && (
            <g>
              <line
                x1={cableSourceNode.x ?? 0}
                y1={cableSourceNode.y ?? 0}
                x2={mouseWorldPos.x}
                y2={mouseWorldPos.y}
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeDasharray="6 4"
                className="animate-pulse"
              />
              <circle
                cx={mouseWorldPos.x}
                cy={mouseWorldPos.y}
                r="6"
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* LAYER 3: NODES */}
          {nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isCableSource = mode === "edit" && cableSourceNodeId === node.id;
            const isHoveredTarget = mode === "edit" && hoveredTargetNodeId === node.id;
            const isDown = node.health_status === "down";
            const isUnknown = node.health_status === "unknown";
            const isPathNode = highlightedPath?.includes(node.id);
            const isFaultNode = highlightedFaultNodeId === node.id;

            // Target validity check during cable wiring (edit mode only)
            let isCableTargetValid: boolean | null = null;
            if (mode === "edit" && isConnectingCable && cableSourceNodeId && cableSourceNodeId !== node.id) {
              const alreadyLinked = hasExistingLink(cableSourceNodeId, node.id);
              isCableTargetValid = !alreadyLinked;
            } else if (mode === "edit" && isConnectingCable && cableSourceNodeId === node.id) {
              isCableTargetValid = false;
            }

            const statusDotColor = isDown || isFaultNode ? "#ef4444" : isUnknown ? "#94a3b8" : "#10b981";

            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                className="cursor-pointer"
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onMouseEnter={() => {
                  if (mode === "edit" && isConnectingCable && cableSourceNodeId) {
                    setHoveredTargetNodeId(node.id);
                  }
                }}
                onMouseLeave={() => {
                  if (hoveredTargetNodeId === node.id) {
                    setHoveredTargetNodeId(null);
                  }
                }}
              >
                {/* Selection or Path Halo */}
                {isSelected && (
                  <circle
                    cx="0"
                    cy="0"
                    r="32"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    className="animate-spin-slow opacity-80"
                  />
                )}

                {isPathNode && !isSelected && (
                  <circle
                    cx="0"
                    cy="0"
                    r="30"
                    fill="#eff6ff"
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                  />
                )}

                {isCableSource && (
                  <circle
                    cx="0"
                    cy="0"
                    r="32"
                    fill="#fef3c7"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    className="animate-pulse"
                  />
                )}

                {/* Cable Target Hover Halo */}
                {isHoveredTarget && isCableTargetValid === true && (
                  <circle
                    cx="0"
                    cy="0"
                    r="34"
                    fill="#ecfdf5"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    className="animate-pulse"
                  />
                )}

                {isHoveredTarget && isCableTargetValid === false && (
                  <circle
                    cx="0"
                    cy="0"
                    r="34"
                    fill="#fef2f2"
                    stroke="#ef4444"
                    strokeWidth="2"
                  />
                )}

                {/* Device Icon / Shape */}
                {renderDeviceGraphics(node.type, isSelected, isDown || isFaultNode, isUnknown, isCableTargetValid)}

                {/* Status indicator badge */}
                <circle cx="16" cy="-14" r="4.5" fill={statusDotColor} stroke="#ffffff" strokeWidth="1.5" />

                {/* Node Name Label Pill */}
                <g transform="translate(0, 32)">
                  <rect
                    x={-Math.max(22, node.name.length * 4.5)}
                    y="-9"
                    width={Math.max(44, node.name.length * 9)}
                    height="18"
                    rx="4"
                    fill="#ffffff"
                    stroke={isSelected ? "#2563eb" : isDown ? "#fca5a5" : "#cbd5e1"}
                    strokeWidth="1.2"
                    className="shadow-2xs"
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fill={isDown ? "#991b1b" : "#0f172a"}
                    fontSize="11"
                    fontWeight="600"
                    className="pointer-events-none select-none font-mono"
                  >
                    {node.name}
                  </text>
                </g>

                {/* Cable wiring tooltip (edit mode only) */}
                {isHoveredTarget && isCableTargetValid === true && (
                  <g transform="translate(0, -32)">
                    <rect x="-45" y="-18" width="90" height="20" rx="4" fill="#065f46" />
                    <text x="0" y="-4" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="600">
                      Connect to {node.name}
                    </text>
                  </g>
                )}

                {isHoveredTarget && isCableTargetValid === false && (
                  <g transform="translate(0, -32)">
                    <rect x="-55" y="-18" width="110" height="20" rx="4" fill="#991b1b" />
                    <text x="0" y="-4" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="600">
                      Cannot connect (Linked)
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* LAYER 4: ACTIVE PACKET OVERLAY (Optional future simulation support) */}
          {activePacketPos && (
            <g transform={`translate(${activePacketPos.x}, ${activePacketPos.y})`}>
              {activePacketPos.isDrop ? (
                <g>
                  <circle cx="0" cy="0" r="14" fill="#ef4444" opacity="0.3" className="animate-ping" />
                  <circle cx="0" cy="0" r="9" fill="#dc2626" stroke="#ffffff" strokeWidth="2" />
                  <path d="M -3 -3 L 3 3 M -3 3 L 3 -3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                </g>
              ) : (
                <g>
                  <circle cx="0" cy="0" r="12" fill="#2563eb" opacity="0.3" className="animate-ping" />
                  <circle cx="0" cy="0" r="8" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="0" cy="0" r="3" fill="#ffffff" />
                </g>
              )}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
