"use client";

import React from "react";
import { ProbeSimulationResult, ProbeEvent } from "../types";

interface TimelineProps {
  simulationResult: ProbeSimulationResult | null;
  activeEventIndex: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onReset: () => void;
  onSeek: (index: number) => void;
  playbackSpeed: number;
  onChangeSpeed: (speed: number) => void;
}

export default function Timeline({
  simulationResult,
  activeEventIndex,
  isPlaying,
  onPlay,
  onPause,
  onStepForward,
  onStepBackward,
  onReset,
  onSeek,
  playbackSpeed,
  onChangeSpeed,
}: TimelineProps) {
  const events = simulationResult?.all_events ?? [];
  const hasEvents = events.length > 0;

  const renderBadge = (eventType: string) => {
    switch (eventType) {
      case "PROBE_CREATED":
      case "PACKET_CREATED":
        return (
          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold">
            PROBE_CREATED
          </span>
        );
      case "FORWARDED":
      case "SENT":
        return (
          <span className="bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold">
            FORWARDED
          </span>
        );
      case "RECEIVED":
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold">
            RECEIVED
          </span>
        );
      case "DROPPED":
        return (
          <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold">
            DROPPED
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold">
            {eventType}
          </span>
        );
    }
  };

  return (
    <div className="w-full h-56 bg-white border border-slate-200 rounded-md p-3 flex flex-col gap-2.5 text-slate-800 shadow-xs shrink-0">
      {/* Top Bar: Playback Controls & Stats */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        {/* Playback Button Group */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReset}
            disabled={!hasEvents}
            title="Reset to beginning"
            className="p-1.5 rounded bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 border border-slate-200 transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
            </svg>
          </button>

          <button
            onClick={onStepBackward}
            disabled={!hasEvents || activeEventIndex <= 0}
            title="Step backward"
            className="p-1.5 rounded bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 border border-slate-200 transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {isPlaying ? (
            <button
              onClick={onPause}
              disabled={!hasEvents}
              className="py-1 px-3 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-medium text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
              Pause
            </button>
          ) : (
            <button
              onClick={onPlay}
              disabled={!hasEvents}
              className="py-1 px-3 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
          )}

          <button
            onClick={onStepForward}
            disabled={!hasEvents || activeEventIndex >= events.length - 1}
            title="Step forward"
            className="p-1.5 rounded bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 border border-slate-200 transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {/* Speed Selector */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded p-0.5 border border-slate-200 ml-1">
            {[0.5, 1, 2].map((s) => (
              <button
                key={s}
                onClick={() => onChangeSpeed(s)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                  playbackSpeed === s
                    ? "bg-white text-blue-700 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Current Step Tracker */}
          {hasEvents && (
            <span className="text-[11px] text-slate-500 ml-2 font-mono">
              Event {activeEventIndex + 1} of {events.length}
            </span>
          )}
        </div>

        {/* Empirical Metrics Cards */}
        {simulationResult ? (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-500">Probes:</span>
              <span className="font-semibold text-slate-900 font-mono">
                {simulationResult.probes_received}/{simulationResult.probes_sent}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-500">Packet Loss:</span>
              <span
                className={`font-semibold font-mono ${
                  simulationResult.packet_loss_percentage === 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {simulationResult.packet_loss_percentage}%
              </span>
            </div>

            {simulationResult.avg_rtt_ms !== null && (
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500">Avg RTT:</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {simulationResult.avg_rtt_ms} ms
                </span>
              </div>
            )}

            <div
              className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] uppercase ${
                simulationResult.network_reachability_status === "HEALTHY"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-700 border border-rose-200"
              }`}
            >
              {simulationResult.network_reachability_status}
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 italic">No probe telemetry recorded</span>
        )}
      </div>

      {/* Scrubber Bar */}
      {hasEvents && (
        <div className="flex items-center gap-2 px-0.5">
          <input
            type="range"
            min={0}
            max={events.length - 1}
            value={activeEventIndex}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-600"
          />
        </div>
      )}

      {/* Events Table */}
      <div className="flex-1 overflow-y-auto rounded border border-slate-200 bg-white">
        {hasEvents ? (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200 font-mono text-[11px]">
              <tr>
                <th className="py-1 px-3 w-12 font-medium">Seq</th>
                <th className="py-1 px-3 w-18 font-medium">Time</th>
                <th className="py-1 px-3 w-20 font-medium">Packet</th>
                <th className="py-1 px-3 w-28 font-medium">Event Type</th>
                <th className="py-1 px-3 w-32 font-medium">Location</th>
                <th className="py-1 px-3 font-medium">Observation Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
              {events.map((evt, idx) => {
                const isActive = idx === activeEventIndex;
                const isDrop = evt.event_type === "DROPPED";
                return (
                  <tr
                    key={evt.sequence}
                    onClick={() => onSeek(idx)}
                    className={`cursor-pointer transition ${
                      isActive
                        ? isDrop
                          ? "bg-rose-50/80 text-rose-950 font-medium"
                          : "bg-blue-50/80 text-blue-950 font-medium"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-1 px-3 font-mono text-[11px] text-slate-400">#{evt.sequence}</td>
                    <td className="py-1 px-3 font-mono text-[11px] text-slate-500">{evt.timestamp_ms} ms</td>
                    <td className="py-1 px-3 font-mono text-[11px] text-blue-700 font-semibold">{evt.packet_id}</td>
                    <td className="py-1 px-3">{renderBadge(evt.event_type)}</td>
                    <td className="py-1 px-3 text-xs font-mono text-slate-800">
                      {evt.next_node ? `${evt.current_node} → ${evt.next_node}` : evt.current_node}
                    </td>
                    <td className="py-1 px-3 text-xs text-slate-600 truncate max-w-xs">{evt.details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            Dispatch a health test probe in the toolbar to stream discrete event telemetry.
          </div>
        )}
      </div>
    </div>
  );
}
