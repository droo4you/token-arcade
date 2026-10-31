"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useGameContext } from "@/context/GameContext";

export default function StatsModal() {
  const [open, setOpen] = useState(false);
  const { stats } = useGameContext();

  const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  const maxDist = Math.max(...stats.distribution, 1);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 transition-colors"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}
        aria-label="Statistics"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="18" y="3" width="4" height="18" rx="1" />
          <rect x="10" y="8" width="4" height="13" rx="1" />
          <rect x="2" y="13" width="4" height="8" rx="1" />
        </svg>
      </button>

      {/* Backdrop + Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.5} />
            </button>

            <h2
              className="mb-4 text-center text-lg font-medium"
              style={{ color: "var(--text)" }}
            >
              Statistics
            </h2>

            {/* Summary stats */}
            <div className="mb-5 grid grid-cols-4 gap-2 text-center">
              {[
                { value: stats.played, label: "Played" },
                { value: winRate, label: "Win %" },
                { value: stats.streak, label: "Streak" },
                { value: stats.maxStreak, label: "Best" },
              ].map((s) => (
                <div key={s.label}>
                  <div
                    className="font-mono text-2xl font-medium tabular-nums"
                    style={{ color: "var(--text)" }}
                  >
                    {s.value}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Guess distribution */}
            <h3
              className="mb-3 text-center text-sm font-medium"
              style={{ color: "var(--text)" }}
            >
              Guess distribution
            </h3>

            <div className="space-y-1.5">
              {stats.distribution.map((count, i) => {
                const widthPercent = Math.max(
                  (count / maxDist) * 100,
                  count > 0 ? 8 : 4
                );
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="w-3 text-right font-mono text-xs tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {i + 1}
                    </span>
                    <div
                      className="flex h-5 items-center justify-end rounded px-2"
                      style={{
                        width: `${widthPercent}%`,
                        minWidth: "1.5rem",
                        background:
                          count > 0
                            ? "var(--result-green)"
                            : "var(--bg-surface-2)",
                        transition: "width 0.3s ease",
                      }}
                    >
                      <span
                        className="font-mono text-xs font-medium tabular-nums"
                        style={{
                          color: count > 0 ? "white" : "var(--text-dim)",
                        }}
                      >
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* No data message */}
            {stats.played === 0 && (
              <p
                className="mt-4 text-center text-xs"
                style={{ color: "var(--text-dim)" }}
              >
                Complete a daily puzzle to see your stats
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
