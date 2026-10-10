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
}: CategoryCellProps) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (revealed) {
      // Stagger the flip by index
      const timer = setTimeout(() => setFlipped(true), index * 200);
      return () => clearTimeout(timer);
    }
  }, [revealed, index]);

  return (
    <div className="flip-card" style={{ height: 72 }}>
      <div className={`flip-card-inner ${flipped ? "flipped" : ""}`}>
        {/* Front — unrevealed */}
        <div className="flip-card-front cell-empty">
          <span
            className="text-[10px] font-medium uppercase tracking-wide"
            style={{ color: "var(--text-dim)" }}
          >
            {label}
          </span>
        </div>

        {/* Back — revealed result */}
        <div className={`flip-card-back ${RESULT_CLASS[result]}`}>
          <span className="text-xs font-semibold leading-tight text-center">
            {value}
          </span>
          {direction && direction !== "match" && (
            <span className="mt-0.5 text-base font-bold leading-none">
              {ARROW_ICON[direction]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
