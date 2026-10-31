"use client";

import { useState } from "react";
import type { Coin, CachedPrices } from "@/lib/types";
import type { LivePrices } from "@/hooks/useLivePrices";
import { PRICE_TIER_LABELS, HERMES_BASE_URL } from "@/lib/constants";
import LiveDot from "./LiveDot";
import Sparkline from "./Sparkline";

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
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          Pyth price feed
        </span>
        <span
          className="ml-auto text-xs transition-transform"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <Sparkline ticker={secretCoin.ticker} color="var(--accent)" />

          <div>
            <div className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Pyth feed ID
            </div>
            <a
              href={hermesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg px-2.5 py-1 font-mono text-xs transition-colors"
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

          <div
            className="grid grid-cols-2 gap-2 rounded-xl p-3"
            style={{ background: "var(--bg-surface-2)" }}
          >
            {priceData && (
              <div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Cached price
                </div>
                <div className="font-mono text-sm font-medium tabular-nums" style={{ color: "var(--text)" }}>
                  {formatPrice(priceData.price)}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Used for game logic
                </div>
              </div>
            )}

            {livePrice && (
              <div>
                <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <LiveDot />
                  Live price
                </div>
                <div className="font-mono text-sm font-medium tabular-nums" style={{ color: "var(--text)" }}>
                  {formatPrice(livePrice.price)}
                  {livePrice.change24h != null && (
                    <span
                      className="ml-1.5 text-xs"
                      style={{ color: livePrice.change24h >= 0 ? "var(--up)" : "var(--down)" }}
                    >
                      {livePrice.change24h >= 0 ? "+" : ""}
                      {livePrice.change24h.toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Refreshed every 30s
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs" style={{ color: "var(--text-muted)" }}>
              How Pyth powers this round
            </div>
            <div className="space-y-1">
              {priceData && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span className="cell-green inline-block h-3.5 w-3.5 rounded-lg" />
                  <span>
                    Price tier: <strong style={{ color: "var(--text)" }}>{PRICE_TIER_LABELS[priceData.tier]}</strong> (Tier {priceData.tier})
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span className="cell-green inline-block h-3.5 w-3.5 rounded-lg" />
                <span>
                  FDV bucket: <strong style={{ color: "var(--text)" }}>{secretCoin.fdvBucket}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <span
                  className="inline-block h-3.5 w-3.5 rounded-lg"
                  style={{ background: "var(--up)" }}
                />
                <span>
                  Live display and 24h change from <strong style={{ color: "var(--text)" }}>Pyth Hermes</strong>
                </span>
              </div>
            </div>
          </div>

          <a
            href={hermesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition-colors"
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
