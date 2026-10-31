"use client";

import { useEffect, useState } from "react";
import type { MatchResult } from "@/lib/types";

type CellResult = MatchResult | "purple";

interface CategoryCellProps {
  /** Category label (shown on back of card) */
  label: string;
  /** Display value (e.g. "2020", "Orange", "L1") */
  value: string;
  /** Match result color */
  result: CellResult;
  /** Directional arrow for numeric categories */
  direction?: "up" | "down" | "match";
  /** Stagger index (0-5) for flip delay */
  index: number;
  /** Whether this cell should be revealed (flipped) */
  revealed: boolean;
  /** Year, price, FDV, and counts use the mono face */
  mono?: boolean;
}

const RESULT_CLASS: Record<CellResult, string> = {
  green: "cell-green",
  yellow: "cell-yellow",
  red: "cell-red",
  purple: "cell-purple",
  unavailable: "cell-unavailable",
};

const ARROW_ICON: Record<string, string> = {
  up: "↑",
  down: "↓",
  match: "",
};

export default function CategoryCell({
  label,
  value,
  result,
  direction,
  index,
  revealed,
  mono,
}: CategoryCellProps) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (revealed) {
      const timer = setTimeout(() => setFlipped(true), index * 120);
      return () => clearTimeout(timer);
    }
  }, [revealed, index]);

  const valueClass = `text-center text-xs font-medium leading-tight ${mono ? "font-mono tabular-nums" : ""}`;

  return (
    <div className="flip-card" style={{ height: 64 }}>
      <div className={`flip-card-inner ${flipped ? "flipped" : ""}`}>
        <div className="flip-card-front cell-empty">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {label}
          </span>
        </div>

        <div className={`flip-card-back ${RESULT_CLASS[result]}`}>
          <span className={valueClass}>{value}</span>
          {direction && direction !== "match" && (
            <span className="mt-0.5 text-base font-medium leading-none">
              {ARROW_ICON[direction]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
