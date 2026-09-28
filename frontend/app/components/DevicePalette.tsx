"use client";

import React from "react";

interface DevicePaletteProps {
  onAddNode: (type: "router" | "host" | "switch" | "server") => void;
  isConnectingCable: boolean;
  onToggleCableMode: () => void;
  onResetTopology?: () => void;
  onClearCanvas?: () => void;
}

export default function DevicePalette({
  onAddNode,
  isConnectingCable,
  onToggleCableMode,
  onResetTopology,
  onClearCanvas,
}: DevicePaletteProps) {
  return (
    <div className="w-52 bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between text-slate-800 shadow-2xs shrink-0 select-none">
      <div className="flex flex-col gap-4">
        {/* Section 1: DEVICES */}
        <div>
          <div className="flex items-center justify-between mb-2 px-0.5">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              DEVICES
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Click to Add</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Router */}
            <button
              onClick={() => onAddNode("router")}
              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 hover:border-blue-300 border border-slate-200 transition cursor-pointer text-center group shadow-2xs"
              title="Add Router to topology"
            >
              <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-1 group-hover:bg-blue-100 transition">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8 8l8 8M8 16l8-8" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-800">Router</span>
              <span className="text-[9px] text-slate-400 font-mono">L3 Device</span>
            </button>

            {/* Switch */}
            <button
              onClick={() => onAddNode("switch")}
              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 hover:border-indigo-300 border border-slate-200 transition cursor-pointer text-center group shadow-2xs"
              title="Add Switch to topology"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mb-1 group-hover:bg-indigo-100 transition">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M7 10h10M7 14h10" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-800">Switch</span>
              <span className="text-[9px] text-slate-400 font-mono">L2 Device</span>
            </button>

            {/* PC / Host */}
            <button
              onClick={() => onAddNode("host")}
              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 hover:border-emerald-300 border border-slate-200 transition cursor-pointer text-center group shadow-2xs"
              title="Add PC / Host workstation"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-1 group-hover:bg-emerald-100 transition">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-800">PC / Host</span>
              <span className="text-[9px] text-slate-400 font-mono">Endpoint</span>
            </button>

            {/* Server */}
            <button
              onClick={() => onAddNode("server")}
              className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 hover:border-amber-300 border border-slate-200 transition cursor-pointer text-center group shadow-2xs"
              title="Add Server resource"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-1 group-hover:bg-amber-100 transition">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="8" rx="1" />
                  <rect x="2" y="13" width="20" height="8" rx="1" />
                  <line x1="6" y1="7" x2="6.01" y2="7" />
                  <line x1="6" y1="17" x2="6.01" y2="17" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-800">Server</span>
              <span className="text-[9px] text-slate-400 font-mono">Service</span>
            </button>
          </div>
        </div>

        {/* Section 2: CONNECTIONS */}
        <div>
          <div className="flex items-center justify-between mb-2 px-0.5">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
              CONNECTIONS
            </h3>
            {isConnectingCable && (
              <span className="text-[10px] font-semibold text-amber-600 animate-pulse font-mono">
                Active
              </span>
            )}
          </div>

          <button
            onClick={onToggleCableMode}
            className={`w-full p-2.5 rounded-lg border transition cursor-pointer flex items-center gap-3 text-left ${
              isConnectingCable
                ? "bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-300/40"
                : "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isConnectingCable
                  ? "bg-amber-200 text-amber-800"
                  : "bg-white border border-slate-200 text-slate-600"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12h16M4 12a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2M20 12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-900">
                {isConnectingCable ? "Connecting Cable..." : "Cable"}
              </span>
              <span className="text-[10px] text-slate-500">
                {isConnectingCable ? "Click source & target" : "Connect 2 devices"}
              </span>
            </div>
          </button>

          {isConnectingCable && (
            <p className="mt-2 text-[10px] text-amber-700 bg-amber-50/80 p-2 rounded border border-amber-200 leading-snug">
              Click the first device, then drag or click the target device to establish physical link. Press <strong>Esc</strong> to cancel.
            </p>
          )}
        </div>
      </div>

      {/* Section 3: Canvas Actions */}
      <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-0.5 px-0.5">
          ACTIONS
        </h3>
        {onResetTopology && (
          <button
            onClick={onResetTopology}
            className="w-full py-1.5 px-2.5 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>Reset to Baseline</span>
          </button>
        )}
        {onClearCanvas && (
          <button
            onClick={onClearCanvas}
            className="w-full py-1.5 px-2.5 rounded bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-xs font-medium transition cursor-pointer flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5 text-slate-400 hover:text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Clear Canvas</span>
          </button>
        )}
      </div>
    </div>
  );
}
