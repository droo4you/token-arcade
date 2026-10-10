"use client";

import { useState } from "react";

export default function InfoModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-2 transition-colors"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}
        aria-label="How to play"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-lg"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close"
            >
              ✕
            </button>

            <h2
              className="mb-4 text-xl font-bold"
              style={{ color: "var(--text)" }}
            >
              How to Play
            </h2>

            <div className="space-y-4 text-sm" style={{ color: "var(--text)" }}>
              <p>
                Guess the mystery cryptocurrency in <strong>6 tries</strong>.
                Each guess reveals clues across 6 categories.
              </p>

              {/* Color legend */}
              <div className="space-y-2">
                <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
                  Color Clues
                </h3>
                <div className="flex items-center gap-2">
                  <span className="cell-green inline-block h-6 w-6 rounded" />
                  <span><strong>Green</strong> — exact match</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="cell-yellow inline-block h-6 w-6 rounded" />
                  <span><strong>Yellow</strong> — close (adjacent/±1)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="cell-red inline-block h-6 w-6 rounded" />
                  <span><strong>Red</strong> — not close</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="cell-purple inline-block h-6 w-6 rounded" />
                  <span><strong>Purple</strong> — hint used</span>
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
                  Categories
                </h3>
                <table
                  className="w-full text-xs"
                  style={{ color: "var(--text)" }}
                >
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="pb-1 text-left font-medium">Category</th>
                      <th className="pb-1 text-left font-medium">Green</th>
                      <th className="pb-1 text-left font-medium">Yellow</th>
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    <tr>
                      <td className="py-0.5 font-medium">Type</td>
                      <td className="py-0.5">Exact</td>
                      <td className="py-0.5">Same family</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 font-medium">Color</td>
                      <td className="py-0.5">Exact</td>
                      <td className="py-0.5">Adjacent</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 font-medium">Year</td>
                      <td className="py-0.5">Exact</td>
                      <td className="py-0.5">±1 year</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 font-medium">Ticker</td>
                      <td className="py-0.5">Exact length</td>
                      <td className="py-0.5">±1 letter</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 font-medium">Price</td>
                      <td className="py-0.5">Same tier</td>
                      <td className="py-0.5">±1 tier</td>
                    </tr>
                    <tr>
                      <td className="py-0.5 font-medium">FDV</td>
                      <td className="py-0.5">Same bucket</td>
                      <td className="py-0.5">±1 bucket</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Arrows */}
              <div className="space-y-1">
                <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
                  Directional Arrows
                </h3>
                <p>
                  Numeric categories (Year, Ticker, Price, FDV) show
                  <strong> ↑</strong> if the answer is higher/later and
                  <strong> ↓</strong> if lower/earlier.
                </p>
              </div>

              {/* Price tiers */}
              <div className="space-y-1">
                <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
                  Price Tiers
                </h3>
                <div
                  className="grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg p-2 text-xs"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <span>Tier 0: &lt; $0.0001</span>
                  <span>Tier 5: $1 – $10</span>
                  <span>Tier 1: $0.0001 – $0.001</span>
                  <span>Tier 6: $10 – $100</span>
                  <span>Tier 2: $0.001 – $0.01</span>
                  <span>Tier 7: $100 – $1K</span>
                  <span>Tier 3: $0.01 – $0.1</span>
                  <span>Tier 8: $1K – $10K</span>
                  <span>Tier 4: $0.1 – $1</span>
                  <span>Tier 9: &gt; $10K</span>
                </div>
              </div>

              {/* FDV buckets */}
              <div className="space-y-1">
                <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
                  FDV Buckets
                </h3>
                <div
                  className="flex flex-wrap gap-1.5 rounded-lg p-2 text-xs"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  {["<10M", "10M-100M", "100M-1B", "1B-10B", "10B-100B", ">100B"].map(
                    (b) => (
                      <span
                        key={b}
                        className="rounded px-2 py-0.5"
                        style={{
                          background: "var(--bg-surface-3)",
                          color: "var(--text)",
                        }}
                      >
                        {b}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Modes */}
              <div className="space-y-1">
                <h3 className="font-semibold" style={{ color: "var(--accent)" }}>
                  Game Modes
                </h3>
                <p>
                  <strong>Daily</strong> — same coin for everyone, resets at
                  midnight UTC. <strong>Free Play</strong> — random coin each
                  round.
                </p>
                <p>
                  <strong>Easy</strong> mode shows a 90-day price chart as a
                  hint. <strong>Hard</strong> mode has no chart.
                </p>
                <p>
                  Use the <strong style={{ color: "var(--result-purple)" }}>Hint</strong> button
                  to reveal a secret coin&apos;s category. Hinted categories
                  show as purple on your share card.
                </p>
              </div>

              {/* Pyth */}
              <div
                className="rounded-xl p-3"
                style={{
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <h3 className="mb-1 font-semibold" style={{ color: "var(--accent)" }}>
                  Powered by Pyth Network
                </h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  All price data comes from{" "}
                  <strong style={{ color: "var(--accent)" }}>Pyth price feeds</strong>
                  {" "}— a decentralized oracle network delivering real-time
                  market data on-chain. All 140+ coins in the pool have
                  verified Pyth feeds. Coindle uses Pyth in four ways:
                </p>
                <ul className="mt-1.5 space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <li>• <strong>Live prices</strong> — refreshed every 30s via Pyth Hermes, shown next to each guess with a green dot</li>
                  <li>• <strong>24h change</strong> — calculated from historical Pyth data, displayed alongside the live price</li>
                  <li>• <strong>Game logic</strong> — Price and FDV tiers are derived from cached Pyth price snapshots for fair daily puzzles</li>
                  <li>• <strong>Easy mode sparkline</strong> — 90 days of historical Pyth prices sampled for the price hint chart</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
