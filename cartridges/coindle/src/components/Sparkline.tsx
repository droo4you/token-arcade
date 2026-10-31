"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { gameApiUrl } from "@/lib/arcade";

type SparklineProps = ({ ticker: string; runId?: never; puzzle?: never } | { ticker?: never; runId: string; puzzle: number }) & {
  /** Chart height in pixels */
  height?: number;
  /** Line color */
  color?: string;
};

interface PricePoint {
  timestamp: number;
  price: number;
}

function formatPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(3)}`;
}

/**
 * 90-day price shape. The line is the one rich moment: faint grid, a baseline
 * at the start price, start and end prices, and a flat end dot. No fill.
 */
export default function Sparkline({
  ticker,
  runId,
  puzzle,
  height = 112,
  color = "var(--accent)",
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
        className="flex items-center justify-center rounded-lg"
        style={{ height, background: "var(--bg-surface-2)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Loading chart
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
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Chart unavailable
        </span>
      </div>
    );
  }

  const start = data[0].price;
  const end = data[data.length - 1].price;
  const last = data.length - 1;

  return (
    <div className="w-full min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text)" }}>
          {formatPrice(start)}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          90 days
        </span>
        <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text)" }}>
          {formatPrice(end)}
        </span>
      </div>
      <div className="overflow-hidden" style={{ height, width: "100%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
            <ReferenceLine y={start} stroke="var(--text-dim)" strokeOpacity={0.45} />
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Line
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={1.75}
              isAnimationActive={false}
              activeDot={false}
              dot={(props) => {
                const { cx, cy, index } = props as { cx?: number; cy?: number; index?: number };
                if (cx == null || cy == null || index !== last) return <g key={index ?? "dot"} />;
                return <circle key="end" cx={cx} cy={cy} r={3} fill={color} />;
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
