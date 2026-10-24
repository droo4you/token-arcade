"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
} from "recharts";
import { gameApiUrl } from "@/lib/arcade";

type SparklineProps = ({ ticker: string; runId?: never; puzzle?: never } | { ticker?: never; runId: string; puzzle: number }) & {
  /** Ticker symbol to fetch history for (e.g. "BTC") */
  /** Chart height in pixels */
  height?: number;
  /** Line color — defaults to a neutral glow */
  color?: string;
};

interface PricePoint {
  timestamp: number;
  price: number;
}

/**
 * 90-day price shape for Daily and server-issued Rapid Fire hints.
 * Shows ONLY the price shape — no axes, no labels, no numbers.
 * Players use the chart silhouette as a hint to identify the coin.
 */
export default function Sparkline({
  ticker,
  runId,
  puzzle,
  height = 80,
  color = "#8b5cf6",
}: SparklineProps) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setData([]);
    setLoading(true);

    async function load() {
      try {
        const path = runId ? `/api/rapid/${encodeURIComponent(runId)}/hint?puzzle=${puzzle}` : `/api/history?ticker=${encodeURIComponent(ticker!)}`;
        const res = await fetch(gameApiUrl(path), { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (!cancelled && json.points?.length > 0) {
          if (runId && json.puzzle !== puzzle) return;
          setData(runId ? json.points.map((price: number, timestamp: number) => ({ price, timestamp })) : json.points);
        }
      } catch {
        // Silently fail — sparkline is an optional hint
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ticker, runId, puzzle]);

  if (loading) {
    return (
      <div
        className="flex animate-pulse items-center justify-center rounded-lg"
        style={{ height, background: "var(--bg-surface-2)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Loading chart...
        </span>
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ height, background: "var(--bg-surface-2)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Chart unavailable
        </span>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ height, width: "100%", minWidth: 0 }}
    >
      <ResponsiveContainer width="100%" height={height - 8}>
        <LineChart data={data}>
          {/* Hidden Y-axis just to auto-scale — not rendered */}
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Line
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
