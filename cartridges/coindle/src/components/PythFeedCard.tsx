"use client";

import { useState } from "react";
import type { Coin, CachedPrices } from "@/lib/types";
import type { LivePrices } from "@/hooks/useLivePrices";
import { PRICE_TIER_LABELS, HERMES_BASE_URL } from "@/lib/constants";

interface PythFeedCardProps {
  secretCoin: Coin;
  prices: CachedPrices;
  livePrices?: LivePrices;
}

function formatPrice(price: number): string {
  if (price >= 1000)
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(3)}`;
}

function truncateFeedId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 10)}...${id.slice(-6)}`;
}

/**
 * Shows transparent Pyth feed data for the secret coin after game over.
 * Demonstrates exactly how Pyth powers the game — great for hackathon judges.
 */
export default function PythFeedCard({
  secretCoin,
  prices,
  livePrices,
}: PythFeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const priceData = prices[secretCoin.ticker];
  const livePrice = livePrices?.[secretCoin.ticker];

  const feedId = secretCoin.pythFeedId;
  const hermesUrl = `${HERMES_BASE_URL}/v2/updates/price/latest?ids[]=${feedId}&parsed=true`;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-light)",
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
          ⓘ Pyth Price Feed
        </span>
        <span
          className="ml-auto text-xs transition-transform"
          style={{
            color: "var(--text-dim)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Feed ID */}
          <div>
            <div
              className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-dim)" }}
            >
              Pyth Feed ID
            </div>
            <a
              href={hermesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg px-2.5 py-1 font-mono text-[11px] transition-colors"
              style={{
                background: "var(--bg-surface-2)",
                color: "var(--accent)",
                border: "1px solid var(--border)",
                wordBreak: "break-all",
              }}
              title="View raw feed on Pyth Hermes"
            >
              {truncateFeedId(feedId)} ↗
            </a>
          </div>

          {/* Price breakdown */}
          <div
            className="grid grid-cols-2 gap-2 rounded-xl p-3"
            style={{ background: "var(--bg-surface-2)" }}
          >
            {/* Cached price (used for game logic) */}
            {priceData && (
              <div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-dim)" }}
                >
                  Cached Price
                </div>
                <div
                  className="text-sm font-bold"
                  style={{ color: "var(--text)" }}
                >
                  {formatPrice(priceData.price)}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Used for game logic
                </div>
              </div>
            )}

            {/* Live price */}
            {livePrice && (
              <div>
                <div
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-dim)" }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: "#22c55e" }}
                  />
                  Live Price
                </div>
                <div
                  className="text-sm font-bold"
                  style={{ color: "var(--text)" }}
                >
                  {formatPrice(livePrice.price)}
                  {livePrice.change24h != null && (
                    <span
                      className="ml-1.5 text-xs font-semibold"
                      style={{
                        color:
                          livePrice.change24h >= 0 ? "#22c55e" : "#f87171",
                      }}
                    >
                      {livePrice.change24h >= 0 ? "+" : ""}
                      {livePrice.change24h.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Refreshed every 30s
                </div>
              </div>
            )}
          </div>

          {/* How it maps to the game */}
          <div>
            <div
              className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-dim)" }}
            >
              How Pyth Powers This Round
            </div>
            <div className="space-y-1">
              {priceData && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="cell-green inline-block h-3.5 w-3.5 rounded" />
                  <span>
                    Price tier: <strong style={{ color: "var(--text)" }}>{PRICE_TIER_LABELS[priceData.tier]}</strong> (Tier {priceData.tier})
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="cell-green inline-block h-3.5 w-3.5 rounded" />
                <span>
                  FDV bucket: <strong style={{ color: "var(--text)" }}>{secretCoin.fdvBucket}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span
                  className="inline-block h-3.5 w-3.5 rounded"
                  style={{ background: "#22c55e" }}
                />
                <span>
                  Live display + 24h change from <strong style={{ color: "var(--text)" }}>Pyth Hermes</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Verify link */}
          <a
            href={hermesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border: "1px solid var(--accent-muted, var(--border))",
            }}
          >
            Verify on Pyth Hermes ↗
          </a>
        </div>
      )}
    </div>
  );
}
