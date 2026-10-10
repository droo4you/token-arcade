"use client";

import { useState, useEffect } from "react";
import { msUntilMidnightUTC } from "@/lib/daily";

/**
 * Countdown to the next daily Coindle puzzle (UTC midnight).
 */
export default function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    function update() {
      const ms = msUntilMidnightUTC();
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setTimeLeft(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!timeLeft) return null;

  return (
    <div className="text-center">
      <p
        className="text-[10px] uppercase tracking-wide"
        style={{ color: "var(--text-dim)" }}
      >
        Next Coindle in
      </p>
      <p
        className="font-mono text-xl font-bold tabular-nums"
        style={{ color: "var(--text)" }}
      >
        {timeLeft}
      </p>
    </div>
  );
}
