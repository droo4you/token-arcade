"use client";

import { useState, useEffect } from "react";

export default function UsernamePrompt({
  onSet,
}: {
  onSet: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("coindle-username");
    if (!stored) setOpen(true);
    else onSet(stored);
  }, [onSet]);

  if (!open) return null;

  function handleSubmit() {
    const trimmed = name.trim().slice(0, 16);
    if (!trimmed) return;
    localStorage.setItem("coindle-username", trimmed);
    onSet(trimmed);
    setOpen(false);
  }

  function handleSkip() {
    const anon = `anon-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem("coindle-username", anon);
    onSet(anon);
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <h2
          className="mb-1 text-lg font-bold"
          style={{ color: "var(--text)" }}
        >
          Set your username
        </h2>
        <p
          className="mb-4 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Shown on the leaderboard. You can change it later.
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Enter a name..."
          maxLength={16}
          className="mb-3 w-full rounded-xl px-4 py-2.5 text-sm font-medium"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            outline: "none",
          }}
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Set Name
          </button>
          <button
            onClick={handleSkip}
            className="rounded-xl px-4 py-2.5 text-sm"
            style={{ color: "var(--text-dim)" }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
