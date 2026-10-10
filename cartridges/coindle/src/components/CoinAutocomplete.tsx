"use client";

import { useState, useRef, useEffect } from "react";
import { COINS } from "@/lib/coins";
import type { Coin } from "@/lib/types";

interface CoinAutocompleteProps {
  onSelect: (ticker: string) => void;
  /** Tickers already guessed (to dim them) */
  guessedTickers: string[];
  disabled?: boolean;
}

export default function CoinAutocomplete({
  onSelect,
  guessedTickers,
  disabled,
}: CoinAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = query.length > 0
    ? COINS.filter(
        (c) =>
          // Retired feeds have no price, so they can't be guessed.
          !c.retired &&
          (c.ticker.toLowerCase().includes(query.toLowerCase()) ||
            c.name.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 20)
    : [];

  const isGuessed = (c: Coin) => guessedTickers.includes(c.ticker);

  function handleSelect(coin: Coin) {
    if (isGuessed(coin)) return;
    onSelect(coin.ticker);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) {
      if (e.key === "Enter" && filtered.length === 1) {
        handleSelect(filtered[0]);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIdx]) {
        handleSelect(filtered[highlightIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && dropdownRef.current) {
      const items = dropdownRef.current.children;
      if (items[highlightIdx]) {
        (items[highlightIdx] as HTMLElement).scrollIntoView({
          block: "nearest",
        });
      }
    }
  }, [highlightIdx, open]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(e.target.value.length > 0);
          setHighlightIdx(0);
        }}
        onFocus={() => query.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Search coin name or ticker..."
        className="w-full rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all placeholder:font-normal"
        style={{
          background: "var(--bg-surface-2)",
          color: "var(--text)",
          border: "1px solid var(--border)",
        }}
      />

      {open && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className="autocomplete-dropdown absolute left-0 right-0 top-full z-50 mt-1 rounded-xl shadow-lg"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
          }}
        >
          {filtered.map((coin, i) => {
            const guessed = isGuessed(coin);
            return (
              <button
                key={coin.ticker}
                onClick={() => handleSelect(coin)}
                disabled={guessed}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  guessed ? "opacity-35" : ""
                }`}
                style={{
                  background:
                    i === highlightIdx && !guessed
                      ? "var(--bg-surface-2)"
                      : "transparent",
                  color: "var(--text)",
                }}
              >
                <img
                  src={coin.logoUrl}
                  alt={coin.ticker}
                  className="h-6 w-6 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="font-semibold">{coin.ticker}</span>
                <span style={{ color: "var(--text-muted)" }}>{coin.name}</span>
                {guessed && (
                  <span className="ml-auto text-xs" style={{ color: "var(--text-dim)" }}>
                    guessed
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
