"use client";

import { useState } from "react";
import type { Coin } from "@/lib/types";

const CATEGORIES = ["Color", "Type", "Launch Year", "Ticker Length", "Price Tier", "FDV Bucket", "Other"];

export default function ReportButton({ coin }: { coin: Coin }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit() {
    if (!category) return;
    fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: coin.ticker,
        category,
        message,
        userId: localStorage.getItem("coindle-uid"),
      }),
    }).catch(() => {});
    setSent(true);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setCategory("");
      setMessage("");
    }, 2000);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs transition-colors"
        style={{ color: "var(--text-dim)" }}
      >
        Report incorrect data
      </button>
    );
  }

  return (
    <div
      className="mt-2 rounded-xl p-3 text-left text-sm"
      style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
    >
      {sent ? (
        <p className="text-center text-xs font-semibold" style={{ color: "var(--result-green)" }}>
          Thanks! We&apos;ll review this.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
            What&apos;s incorrect about {coin.ticker}?
          </p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  background: category === c ? "var(--accent)" : "var(--bg-surface-3)",
                  color: category === c ? "white" : "var(--text-muted)",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional: what should it be?"
            className="mb-2 w-full rounded-lg p-2 text-xs"
            style={{
              background: "var(--bg-surface-3)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              resize: "none",
            }}
            rows={2}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Submit
            </button>
            <button
              onClick={() => { setOpen(false); setCategory(""); setMessage(""); }}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{ color: "var(--text-dim)" }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
