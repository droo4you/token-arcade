"use client";

import { useEffect, useState } from "react";

interface Stats {
  total_games: number;
  wins: number;
  losses: number;
  win_rate: string;
  daily_games: number;
  freeplay_games: number;
  unique_users: number;
  unique_days: number;
  avg_guesses: string;
  today: { games: number; wins: number; users: number };
  last7: { date: string; games: number }[];
  recent: {
    id: number;
    created_at: string;
    mode: string;
    difficulty: string;
    result: string;
    guesses: number;
    answer: string;
    platform: string;
    user_id?: string;
  }[];
  reports: {
    id: number;
    created_at: string;
    ticker: string;
    category: string;
    message: string;
    user_id?: string;
  }[];
}

const S = {
  bg: "#1A1F2B",
  card: "#22262E",
  border: "#343A45",
  text: "#E8E6E1",
  muted: "#9B97A0",
  blue: "#5B8DEF",
  green: "#4ADE80",
  red: "#F87171",
  yellow: "#FBBF24",
  purple: "#A78BFA",
} as const;

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "games" | "reports">("overview");

  useEffect(() => {
    fetch("/api/analytics/stats")
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ background: S.bg, color: S.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      Loading...
    </div>
  );

  if (!stats) return (
    <div style={{ background: S.bg, color: S.red, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
      Failed to load stats
    </div>
  );

  const cards = [
    { label: "Total Games", value: stats.total_games, color: S.blue },
    { label: "Unique Users", value: stats.unique_users, color: S.purple },
    { label: "Win Rate", value: stats.win_rate, color: S.yellow },
    { label: "Avg Guesses (W)", value: stats.avg_guesses, color: S.green },
    { label: "Daily Games", value: stats.daily_games, color: S.blue },
    { label: "Free Play", value: stats.freeplay_games, color: S.purple },
    { label: "Today's Games", value: stats.today.games, color: S.blue },
    { label: "Today's Users", value: stats.today.users, color: S.green },
  ];

  const maxGames = Math.max(...stats.last7.map((d) => d.games), 1);

  return (
    <div style={{ background: S.bg, color: S.text, minHeight: "100vh", fontFamily: "system-ui", padding: "2rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Coindle Dashboard</h1>
        <p style={{ color: S.muted, fontSize: "0.875rem", marginBottom: "1.5rem" }}>Analytics powered by Supabase</p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
          {(["overview", "games", "reports"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 8,
                fontSize: "0.875rem",
                fontWeight: 600,
                background: tab === t ? S.blue : S.card,
                color: tab === t ? "white" : S.muted,
                border: "none",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t} {t === "reports" && stats.reports.length > 0 ? `(${stats.reports.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
              {cards.map((c) => (
                <div key={c.label} style={{ background: S.card, borderRadius: 12, padding: "1.25rem", border: `1px solid ${S.border}` }}>
                  <div style={{ color: S.muted, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>{c.label}</div>
                  <div style={{ fontSize: "1.75rem", fontWeight: 700, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* 7-day chart */}
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Last 7 Days</h2>
            <div style={{ background: S.card, borderRadius: 12, padding: "1.25rem", border: `1px solid ${S.border}`, marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: 120 }}>
                {stats.last7.map((d) => (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: "0.7rem", color: S.text, fontWeight: 600 }}>{d.games}</span>
                    <div
                      style={{
                        width: "100%",
                        height: `${(d.games / maxGames) * 80}px`,
                        minHeight: d.games > 0 ? 4 : 0,
                        background: S.blue,
                        borderRadius: 4,
                      }}
                    />
                    <span style={{ fontSize: "0.65rem", color: S.muted }}>
                      {new Date(d.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "games" && (
          <>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Games</h2>
            <div style={{ background: S.card, borderRadius: 12, border: `1px solid ${S.border}`, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                    {["Time", "Mode", "Diff", "Result", "Guesses", "Answer", "Platform"].map((h) => (
                      <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: S.muted, fontWeight: 500, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((e) => (
                    <tr key={e.id} style={{ borderBottom: `1px solid #2A2F38` }}>
                      <td style={{ padding: "0.625rem 1rem", color: S.muted }}>
                        {new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "0.625rem 1rem" }}>
                        <span style={{ background: e.mode === "daily" ? "#1E2A42" : "#2E1E42", color: e.mode === "daily" ? S.blue : S.purple, padding: "2px 8px", borderRadius: 6, fontSize: "0.75rem" }}>{e.mode}</span>
                      </td>
                      <td style={{ padding: "0.625rem 1rem", color: S.text }}>{e.difficulty}</td>
                      <td style={{ padding: "0.625rem 1rem" }}>
                        <span style={{ color: e.result === "win" ? S.green : S.red, fontWeight: 600 }}>{e.result === "win" ? "W" : "L"}</span>
                      </td>
                      <td style={{ padding: "0.625rem 1rem", color: S.text }}>{e.guesses}/6</td>
                      <td style={{ padding: "0.625rem 1rem", fontWeight: 600, color: S.text }}>{e.answer}</td>
                      <td style={{ padding: "0.625rem 1rem", color: S.muted }}>{e.platform}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "reports" && (
          <>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Data Reports</h2>
            {stats.reports.length === 0 ? (
              <div style={{ background: S.card, borderRadius: 12, padding: "2rem", border: `1px solid ${S.border}`, textAlign: "center", color: S.muted }}>
                No reports yet
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {stats.reports.map((r) => (
                  <div key={r.id} style={{ background: S.card, borderRadius: 12, padding: "1rem", border: `1px solid ${S.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span style={{ fontWeight: 700, color: S.text }}>{r.ticker}</span>
                        <span style={{ background: "#2E1E42", color: S.purple, padding: "2px 8px", borderRadius: 6, fontSize: "0.75rem" }}>{r.category}</span>
                      </div>
                      <span style={{ color: S.muted, fontSize: "0.75rem" }}>
                        {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {r.message && <p style={{ color: S.muted, fontSize: "0.875rem" }}>{r.message}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
