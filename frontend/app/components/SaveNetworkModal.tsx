"use client";

import React, { useState } from "react";
import { TopologyData } from "../types";

interface SaveNetworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  currentTopology: TopologyData;
  defaultName?: string;
}

export default function SaveNetworkModal({
  isOpen,
  onClose,
  onSave,
  currentTopology,
  defaultName = "Campus Network (Custom)",
}: SaveNetworkModalProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("Custom topology configured in Network Builder");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      onSave(name.trim(), description.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Save Network Topology</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 text-xs">
          {/* Topology Snapshot Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between text-slate-600">
            <div>
              <span className="font-medium text-slate-700">Snapshot Contents:</span>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {currentTopology.nodes.length} Devices • {currentTopology.links.length} Physical Cables
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-semibold">
              Ready to Save
            </span>
          </div>

          {/* Network Name Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="network-name" className="font-semibold text-slate-700">
              Network Name <span className="text-rose-500">*</span>
            </label>
            <input
              id="network-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Enterprise Campus Core"
              required
              className="px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition text-slate-900 font-medium"
            />
          </div>

          {/* Description Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="network-description" className="font-semibold text-slate-700">
              Description / Notes
            </label>
            <textarea
              id="network-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add optional notes about topology layout, subnets, or test scenario..."
              className="px-3 py-2 bg-white border border-slate-300 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition text-slate-900 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Save Network</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
