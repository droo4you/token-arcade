"use client";

import { useTheme } from "@/hooks/useTheme";
import { useGameContext } from "@/context/GameContext";
import InfoModal from "./InfoModal";
import StatsModal from "./StatsModal";
import LeaderboardModal from "./LeaderboardModal";
import { isHostedArcade } from "@/lib/arcade";

export default function Header() {
  const { dark, toggle } = useTheme();
  const { mode, switchMode, difficulty, setDifficulty } = useGameContext();

  return (
    <header className="mx-auto w-full max-w-lg space-y-3">
      {/* Top row: logo + theme toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <span style={{ color: "var(--accent)" }}>Coin</span>
          <span style={{ color: "var(--text)" }}>dle</span>
        </h1>

        <div className="flex items-center gap-2">
          {!isHostedArcade() && <LeaderboardModal />}
          <StatsModal />
          <InfoModal />
          <button
            onClick={toggle}
            className="rounded-lg p-2 transition-colors"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}
            aria-label="Toggle theme"
          >
            {dark ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Subtitle */}
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Guess the mystery crypto — powered by{" "}
        <span className="font-semibold" style={{ color: "var(--accent)" }}>
          Pyth
        </span>
      </p>

      {/* Mode + Difficulty toggles */}
      <div className="flex gap-2">
        {/* Mode toggle */}
        <div
          className="flex flex-1 overflow-hidden rounded-xl"
          style={{
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border-light)",
          }}
        >
          <button
            onClick={() => switchMode("daily")}
            className="flex-1 py-2 text-xs font-semibold transition-all"
            style={{
              background:
                mode === "daily" ? "var(--accent)" : "transparent",
              color: mode === "daily" ? "white" : "var(--text-muted)",
            }}
          >
            Daily
          </button>
          <button
            onClick={() => switchMode("freeplay")}
            className="flex-1 py-2 text-xs font-semibold transition-all"
            style={{
              background:
                mode === "freeplay" ? "var(--accent)" : "transparent",
              color: mode === "freeplay" ? "white" : "var(--text-muted)",
            }}
          >
            Free Play
          </button>
        </div>

        {/* Difficulty toggle */}
        <div
          className="flex overflow-hidden rounded-xl"
          style={{
            background: "var(--bg-surface-2)",
            border: "1px solid var(--border-light)",
          }}
        >
          <button
            onClick={() => setDifficulty("easy")}
            className="px-3 py-2 text-xs font-semibold transition-all"
            style={{
              background:
                difficulty === "easy" ? "var(--accent)" : "transparent",
              color: difficulty === "easy" ? "white" : "var(--text-muted)",
            }}
          >
            Easy
          </button>
          <button
            onClick={() => setDifficulty("hard")}
            className="px-3 py-2 text-xs font-semibold transition-all"
            style={{
              background:
                difficulty === "hard" ? "var(--accent)" : "transparent",
              color: difficulty === "hard" ? "white" : "var(--text-muted)",
            }}
          >
            Hard
          </button>
        </div>
      </div>
    </header>
  );
}
