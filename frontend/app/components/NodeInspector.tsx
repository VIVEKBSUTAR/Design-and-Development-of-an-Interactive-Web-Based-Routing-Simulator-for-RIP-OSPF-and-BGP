"use client";

import React, { useState, useEffect } from "react";
import { TopologyNode, TopologyLink } from "../types";

interface NodeInspectorProps {
  selectedNode: TopologyNode | null;
  selectedLink: TopologyLink | null;
  allLinks: TopologyLink[];
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteLink: (source: string, destination: string) => void;
  onSelectNode: (nodeId: string | null) => void;
}

export default function NodeInspector({
  selectedNode,
  selectedLink,
  allLinks,
  onRenameNode,
  onDeleteNode,
  onDeleteLink,
  onSelectNode,
}: NodeInspectorProps) {
  // Inline rename state for selected node
  const [editingName, setEditingName] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setEditingName(selectedNode.name);
      setIsEditing(false);
    }
  }, [selectedNode]);

  // Find all connected neighbors for the selected node
  const connectedNeighbors: string[] = [];
  if (selectedNode) {
    allLinks.forEach((l) => {
      if (l.source === selectedNode.id) {
        connectedNeighbors.push(l.destination);
      } else if (l.destination === selectedNode.id) {
        connectedNeighbors.push(l.source);
      }
    });
  }

  const handleSaveRename = () => {
    if (selectedNode && editingName.trim() && editingName.trim() !== selectedNode.name) {
      onRenameNode(selectedNode.id, editingName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveRename();
    } else if (e.key === "Escape") {
      if (selectedNode) setEditingName(selectedNode.name);
      setIsEditing(false);
    }
  };

  return (
    <div className="w-72 bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between text-slate-800 shadow-2xs overflow-y-auto shrink-0 select-none">
      <div className="flex flex-col gap-4">
        {/* CASE 1: NODE SELECTED */}
        {selectedNode && (
          <div className="flex flex-col gap-3.5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                DEVICE
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 font-mono">
                ● UP
              </span>
            </div>

            {/* Name / Rename field */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-slate-500 uppercase font-mono">
                Device Name
              </label>
              {isEditing ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="flex-1 px-2 py-1 text-xs bg-white border border-blue-400 rounded outline-none font-semibold text-slate-900"
                  />
                  <button
                    onClick={handleSaveRename}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingName(selectedNode.name);
                      setIsEditing(false);
                    }}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded">
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    {selectedNode.name}
                  </span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer transition flex items-center gap-1"
                    title="Rename node"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    <span>Rename</span>
                  </button>
                </div>
              )}
            </div>

            {/* Type */}
            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Type:</span>
              <span className="capitalize font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                {selectedNode.type}
              </span>
            </div>

            {/* Identifier */}
            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Identifier:</span>
              <span className="font-mono text-slate-700 font-semibold text-[11px]">
                {selectedNode.id}
              </span>
            </div>

            {/* Position */}
            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Coordinates:</span>
              <span className="font-mono text-slate-500 text-[11px]">
                X: {Math.round(selectedNode.x ?? 0)}, Y: {Math.round(selectedNode.y ?? 0)}
              </span>
            </div>

            {/* Connections */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-500 uppercase font-mono">
                  Connections ({connectedNeighbors.length})
                </span>
              </div>
              {connectedNeighbors.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {connectedNeighbors.map((neighborId) => (
                    <button
                      key={neighborId}
                      onClick={() => onSelectNode(neighborId)}
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 border border-slate-200 rounded text-xs font-mono font-medium text-slate-700 transition cursor-pointer flex items-center gap-1"
                      title={`Jump to ${neighborId}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      <span>{neighborId}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">No cable connections established.</p>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                ACTIONS
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="py-1.5 px-3 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <span>Rename</span>
                </button>
                <button
                  onClick={() => onDeleteNode(selectedNode.id)}
                  className="py-1.5 px-3 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CASE 2: LINK SELECTED */}
        {!selectedNode && selectedLink && (
          <div className="flex flex-col gap-3.5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                LINK
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 font-mono">
                ● UP
              </span>
            </div>

            {/* Endpoints */}
            <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center justify-center gap-2">
              <button
                onClick={() => onSelectNode(selectedLink.source)}
                className="font-mono font-bold text-xs px-2 py-1 rounded bg-white border border-slate-200 text-blue-700 hover:border-blue-400 transition cursor-pointer"
              >
                {selectedLink.source}
              </button>
              <span className="text-slate-400 font-bold">⟷</span>
              <button
                onClick={() => onSelectNode(selectedLink.destination)}
                className="font-mono font-bold text-xs px-2 py-1 rounded bg-white border border-slate-200 text-blue-700 hover:border-blue-400 transition cursor-pointer"
              >
                {selectedLink.destination}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Source Endpoint:</span>
              <span className="font-mono text-slate-800 font-semibold">{selectedLink.source}</span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Destination Endpoint:</span>
              <span className="font-mono text-slate-800 font-semibold">{selectedLink.destination}</span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Physical Media:</span>
              <span className="text-slate-700 font-mono">Ethernet 1Gbps</span>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                ACTION
              </span>
              <button
                onClick={() => onDeleteLink(selectedLink.source, selectedLink.destination)}
                className="w-full py-1.5 px-3 rounded bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <svg className="w-3.5 h-3.5 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Delete Link</span>
              </button>
            </div>
          </div>
        )}

        {/* CASE 3: NOTHING SELECTED */}
        {!selectedNode && !selectedLink && (
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-2">
              PROPERTIES
            </span>
            <div className="text-center py-6 px-2 text-slate-400 flex flex-col items-center">
              <svg className="w-8 h-8 text-slate-300 mb-2 stroke-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M15 15l4 4" />
              </svg>
              <p className="text-xs font-medium text-slate-600">No Item Selected</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Select any device or link on the canvas to configure parameters.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded p-3 text-[11px] text-slate-500 flex flex-col gap-1.5">
              <span className="font-semibold text-slate-700 uppercase tracking-wide text-[10px] font-mono">
                Editor Tips
              </span>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                <li>Click device to select & view properties</li>
                <li>Drag device to reposition on canvas</li>
                <li>Click <strong>Cable</strong> tool to wire devices</li>
                <li>Scroll mouse wheel to zoom in/out</li>
                <li>Drag empty canvas to pan viewport</li>
                <li>Press <strong>Esc</strong> to cancel cable wiring</li>
                <li>Press <strong>Delete</strong> key to remove selection</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
