"use client";

import { useState, useEffect } from "react";
import { getDailyPuzzleNumber } from "@/lib/daily";

interface DailyEntry {
  username: string;
  guesses: number;
  created_at: string;
}

interface AllTimeEntry {
  username: string;
  wins: number;
  games: number;
  avgGuesses: string;
}

export default function LeaderboardModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"today" | "alltime">("today");
  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [allTime, setAllTime] = useState<AllTimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const puzzle = getDailyPuzzleNumber();
    Promise.all([
      fetch(`/api/leaderboard?puzzle=${puzzle}`).then((r) => r.json()),
      fetch("/api/leaderboard").then((r) => r.json()),
    ])
      .then(([d, a]) => {
        setDaily(d.entries ?? []);
        setAllTime(a.entries ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [open]);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 transition-colors"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}
        aria-label="Leaderboard"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: "var(--text)" }}>
                Leaderboard
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-xl"
                style={{ color: "var(--text-dim)" }}
              >
                ×
              </button>
            </div>

            {/* Tabs */}
            <div className="mb-4 flex gap-2">
              {(["today", "alltime"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 rounded-xl py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: tab === t ? "var(--accent)" : "var(--bg-surface-2)",
                    color: tab === t ? "white" : "var(--text-muted)",
                  }}
                >
                  {t === "today" ? "Today" : "All Time"}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
                Loading...
              </div>
            ) : tab === "today" ? (
              daily.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
                  No winners yet today
                </div>
              ) : (
                <div className="space-y-2">
                  {daily.map((e, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                      style={{ background: "var(--bg-surface-2)" }}
                    >
                      <span className="w-6 text-center text-sm font-bold" style={{ color: "var(--text-muted)" }}>
                        {medals[i] ?? `${i + 1}`}
                      </span>
                      <span className="flex-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {e.username}
                      </span>
                      <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                        {e.guesses}/6
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : allTime.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: "var(--text-dim)" }}>
                No data yet
              </div>
            ) : (
              <div className="space-y-2">
                {allTime.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <span className="w-6 text-center text-sm font-bold" style={{ color: "var(--text-muted)" }}>
                      {medals[i] ?? `${i + 1}`}
                    </span>
                    <span className="flex-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                      {e.username}
                    </span>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                        {e.wins}W
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                        avg {e.avgGuesses}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
