"use client";

import React, { ReactNode } from "react";
import { NavViewId, useNetworkProject } from "../context/NetworkProjectContext";
import InvestigationProgressHeader from "./InvestigationProgressHeader";

interface AppShellProps {
  children: ReactNode;
  backendOnline: boolean | null;
  onOpenResearchModal?: () => void;
}

interface NavItem {
  id: NavViewId;
  label: string;
}

interface NavGroup {
  category: string;
  badge?: string;
  tooltip?: string;
  items: NavItem[];
}

const NAVIGATION_GROUPS: NavGroup[] = [
  {
    category: "TOPOLOGY",
    items: [
      { id: "network-builder", label: "Network Builder" },
      { id: "saved-networks", label: "Saved Networks" },
    ],
  },
  {
    category: "MODULE 1",
    badge: "INTELLIGENCE",
    tooltip: "What paths exist and how does traffic move?",
    items: [
      { id: "network-intelligence", label: "Path & Reachability" },
    ],
  },
  {
    category: "MODULE 2",
    badge: "TESTING",
    tooltip: "What should we test next?",
    items: [
      { id: "test-observe", label: "Test Orchestration & Probes" },
    ],
  },
  {
    category: "MODULE 3",
    badge: "DIAGNOSIS",
    tooltip: "What went wrong and where?",
    items: [
      { id: "fault-injection", label: "Fault Injection" },
      { id: "failure-detection", label: "Failure Detection" },
      { id: "diagnosis", label: "Diagnosis & Impact" },
    ],
  },
  {
    category: "MODULE 4",
    badge: "RESILIENCE",
    tooltip: "Why did it happen, what was essential, and can we reproduce it?",
    items: [
      { id: "causal-analysis", label: "Causal Graph & Signature" },
      { id: "reduction", label: "Failure Reduction" },
      { id: "reproduction", label: "Reproduction" },
      { id: "what-if", label: "What-If Simulation" },
    ],
  },
  {
    category: "AUDIT",
    items: [{ id: "history", label: "Investigation History" }],
  },
];

export default function AppShell({ children, backendOnline, onOpenResearchModal }: AppShellProps) {
  const { activeView, setActiveView, currentRevision } = useNetworkProject();

  return (
    <div className="flex flex-col w-screen h-[100dvh] overflow-hidden bg-slate-50 text-slate-800 select-none">
      {/* 1. TOP HEADER BAR */}
      <header className="h-13 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-30 shadow-xs">
        {/* Left: Branding */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              NL
            </div>
            <span className="font-semibold text-sm tracking-tight text-slate-900">
              Network Failure Lab
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wide">
            Testing & Reproduction System
          </span>
        </div>

        {/* Center: Current Network & Revision */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded text-xs">
          <span className="text-slate-400 font-medium">Network:</span>
          <span className="font-semibold text-slate-800">{currentRevision.name}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
            rev {currentRevision.revisionNumber}.0
          </span>
        </div>

        {/* Right: Engine Status & Preserved Research Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
            <span
              className={`h-2 w-2 rounded-full ${
                backendOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="font-medium text-[11px]">
              {backendOnline ? "Ready (Port 8000)" : "Engine Offline"}
            </span>
          </div>

          {onOpenResearchModal && (
            <button
              onClick={onOpenResearchModal}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              title="Open Causal Reduction & Reproduction Pipeline"
            >
              <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4m0-4h.01" />
              </svg>
              <span>Research Pipeline</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. APPLICATION NAVIGATION BAR */}
      <nav className="h-10 bg-white border-b border-slate-200 px-5 flex items-center overflow-x-auto shrink-0 z-20 gap-4 text-xs font-medium no-scrollbar">
        {NAVIGATION_GROUPS.map((group, groupIdx) => (
          <div key={group.category} className="flex items-center gap-1.5">
            {groupIdx > 0 && <span className="text-slate-200 mx-1">|</span>}

            <div className="flex items-center gap-1 mr-1" title={group.tooltip}>
              <span className="text-[10px] font-bold text-slate-500 font-mono tracking-wider uppercase">
                {group.category}
              </span>
              {group.badge && (
                <span className="text-[8.5px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                  {group.badge}
                </span>
              )}
              <span className="text-slate-300">:</span>
            </div>

            {group.items.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`px-2.5 py-1 rounded text-xs transition cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-blue-50 text-blue-700 font-semibold border border-blue-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 2.5 INTEGRATED INVESTIGATION PROGRESS PIPELINE BAR */}
      <InvestigationProgressHeader />

      {/* 3. WORKSPACE VIEWPORT */}
      <main className="flex-1 w-full h-[calc(100dvh-8rem)] overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
