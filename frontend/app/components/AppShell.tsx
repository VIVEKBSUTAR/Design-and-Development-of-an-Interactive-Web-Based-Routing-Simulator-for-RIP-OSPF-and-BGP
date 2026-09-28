"use client";

import React, { ReactNode, useState } from "react";
import { NavViewId, useNetworkProject } from "../context/NetworkProjectContext";
import InvestigationWorkflowModal from "./InvestigationWorkflowModal";

interface AppShellProps {
  children: ReactNode;
  backendOnline: boolean | null;
}

export type PrimarySection = "network" | "testing" | "diagnosis" | "resilience";

export default function AppShell({ children, backendOnline }: AppShellProps) {
  const { activeView, setActiveView, currentRevision } = useNetworkProject();
  const [isInvestigationModalOpen, setIsInvestigationModalOpen] = useState(false);

  // Determine current active primary section
  const getPrimarySection = (): PrimarySection => {
    if (
      activeView === "network-builder" ||
      activeView === "network-intelligence" ||
      activeView === "saved-networks"
    ) {
      return "network";
    }
    if (activeView === "test-observe") {
      return "testing";
    }
    if (
      activeView === "diagnosis" ||
      activeView === "fault-injection" ||
      activeView === "failure-detection"
    ) {
      return "diagnosis";
    }
    if (
      activeView === "resilience" ||
      activeView === "causal-analysis" ||
      activeView === "failure-signature" ||
      activeView === "reduction" ||
      activeView === "reproduction" ||
      activeView === "what-if"
    ) {
      return "resilience";
    }
    return "network";
  };

  const primarySection = getPrimarySection();

  return (
    <div className="flex flex-col w-screen h-[100dvh] overflow-hidden bg-slate-50 text-slate-800 select-none">
      {/* =================================================================== */}
      {/* 1. TOP HEADER BAR (Row 1) */}
      {/* =================================================================== */}
      <header className="h-12 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-30 shadow-2xs">
        {/* Left: Branding */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
              NL
            </div>
            <span className="font-bold text-sm tracking-tight text-slate-900">
              Network Failure Lab
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
            Testing & Reproduction System
          </span>
        </div>

        {/* Center: Current Network & Revision badge */}
        <div
          onClick={() => setActiveView("saved-networks")}
          className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1 rounded text-xs cursor-pointer transition"
          title="Click to view and switch saved network topologies"
        >
          <span className="text-slate-400 font-medium">Network:</span>
          <span className="font-semibold text-slate-800">{currentRevision.name}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
            rev {currentRevision.revisionNumber}.0
          </span>
        </div>

        {/* Right: Engine Status & Primary Master Action */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200">
            <span
              className={`h-2 w-2 rounded-full ${
                backendOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="font-medium text-[11px] hidden md:inline">
              {backendOnline ? "Ready (Port 8000)" : "Engine Offline"}
            </span>
          </div>

          {/* Master 1-Click Investigation Action */}
          <button
            onClick={() => setIsInvestigationModalOpen(true)}
            className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            title="Execute the end-to-end 10-stage automated testing and reproduction investigation"
          >
            <span>⚡ Run Full Investigation</span>
          </button>

          {/* Small utility action: History */}
          <button
            onClick={() => setActiveView("history")}
            className={`p-1.5 rounded border text-xs transition cursor-pointer ${
              activeView === "history"
                ? "bg-slate-200 text-slate-900 border-slate-300"
                : "bg-white text-slate-600 hover:bg-slate-100 border-slate-200"
            }`}
            title="Investigation History & Audit Trail"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. PRIMARY NAVIGATION BAR (Row 2) - Max 4 Main Modules */}
      {/* =================================================================== */}
      <nav className="h-10 bg-white border-b border-slate-200 px-5 flex items-center justify-between shrink-0 z-20 text-xs select-none">
        {/* 4 Primary Navigation Modules */}
        <div className="flex items-center gap-2">
          {/* Module 1: Network */}
          <button
            onClick={() => setActiveView("network-builder")}
            className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              primarySection === "network"
                ? "bg-blue-50 text-blue-700 font-bold border border-blue-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Network
          </button>

          {/* Module 2: Testing */}
          <button
            onClick={() => setActiveView("test-observe")}
            className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              primarySection === "testing"
                ? "bg-blue-50 text-blue-700 font-bold border border-blue-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Testing
          </button>

          {/* Module 3: Diagnosis */}
          <button
            onClick={() => setActiveView("diagnosis")}
            className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              primarySection === "diagnosis"
                ? "bg-blue-50 text-blue-700 font-bold border border-blue-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Diagnosis
          </button>

          {/* Module 4: Resilience */}
          <button
            onClick={() => setActiveView("resilience")}
            className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              primarySection === "resilience"
                ? "bg-blue-50 text-blue-700 font-bold border border-blue-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Resilience
          </button>
        </div>

        {/* Secondary Contextual Sub-Nav Bar (Integrated inline to avoid vertical bloat) */}
        <div className="flex items-center gap-1.5 text-[11px]">
          {primarySection === "network" && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200">
              <button
                onClick={() => setActiveView("network-builder")}
                className={`px-2.5 py-0.5 rounded transition cursor-pointer ${
                  activeView === "network-builder"
                    ? "bg-white text-slate-900 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Network Builder
              </button>
              <button
                onClick={() => setActiveView("network-intelligence")}
                className={`px-2.5 py-0.5 rounded transition cursor-pointer ${
                  activeView === "network-intelligence"
                    ? "bg-white text-slate-900 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Path & Reachability
              </button>
              <button
                onClick={() => setActiveView("saved-networks")}
                className={`px-2.5 py-0.5 rounded transition cursor-pointer ${
                  activeView === "saved-networks"
                    ? "bg-white text-slate-900 font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Saved Networks
              </button>
            </div>
          )}

          {primarySection === "testing" && (
            <div className="flex items-center text-slate-500 font-medium">
              <span>Test Orchestration & Live Packet Probes</span>
            </div>
          )}

          {primarySection === "diagnosis" && (
            <div className="flex items-center text-slate-500 font-medium">
              <span>Failure Investigation & Localization</span>
            </div>
          )}

          {primarySection === "resilience" && (
            <div className="flex items-center text-slate-500 font-medium">
              <span>Causal Dependencies, Reduction & Reproduction</span>
            </div>
          )}
        </div>
      </nav>

      {/* =================================================================== */}
      {/* 3. WORKSPACE VIEWPORT (Row 3) - Maximum Screen Estate */}
      {/* =================================================================== */}
      <main className="flex-1 w-full h-[calc(100dvh-5.5rem)] overflow-hidden relative">
        {children}
      </main>

      {/* Automated Full Investigation Modal */}
      <InvestigationWorkflowModal
        isOpen={isInvestigationModalOpen}
        onClose={() => setIsInvestigationModalOpen(false)}
      />
    </div>
  );
}
