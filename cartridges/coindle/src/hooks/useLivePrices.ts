"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { COINS } from "@/lib/coins";
import { gameApiUrl } from "@/lib/arcade";

interface LivePrice {
  price: number;
  updatedAt: number; // unix ms
  change24h?: number; // percentage, e.g. +2.4 or -1.2
}

export type LivePrices = Record<string, LivePrice>;

const POLL_INTERVAL = 30_000; // 30 seconds
const MAX_IDS_PER_REQUEST = 50; // Keep URL reasonable

/**
 * Client-side hook that polls /api/live for live prices, which proxies Pyth
 * Hermes server-side (Hermes now requires an API key that can't ship to the
 * browser).
 * Also fetches 24h-ago prices once to compute daily % change.
 * Only fetches prices for tickers in the `tickers` set.
 */
export function useLivePrices(tickers: string[]) {
  const [livePrices, setLivePrices] = useState<LivePrices>({});
  const tickersRef = useRef(tickers);
  tickersRef.current = tickers;

  // Store 24h-ago reference prices (fetched once per ticker)
  const refPricesRef = useRef<Record<string, number>>({});
  const fetchedRefTickersRef = useRef<Set<string>>(new Set());
  const requestsRef = useRef<Set<AbortController>>(new Set());

  const fetchLive = useCallback(async () => {
    const currentTickers = tickersRef.current;
    if (currentTickers.length === 0) return;

    const feeds = currentTickers
      .map((t) => COINS.find((c) => c.ticker === t))
      .filter(Boolean) as typeof COINS;

    if (feeds.length === 0) return;

    // Build URL with feed IDs
    const params = new URLSearchParams();
    feeds.slice(0, MAX_IDS_PER_REQUEST).forEach((c) => {
      params.append("ids[]", c.pythFeedId);
    });
    params.append("parsed", "true");

    const controller = new AbortController();
    requestsRef.current.add(controller);
    try {
      const res = await fetch(gameApiUrl(`/api/live?${params.toString()}`), { signal: controller.signal });
      if (!res.ok) return;

      const data = await res.json();
      const now = Date.now();
      const updated: LivePrices = {};

      for (const parsed of data.parsed ?? []) {
        const feedId = "0x" + parsed.id;
        const coin = feeds.find((c) => c.pythFeedId === feedId);
        if (!coin) continue;

        const price =
          Number(parsed.price.price) * Math.pow(10, Number(parsed.price.expo));

        const refPrice = refPricesRef.current[coin.ticker];
        const change24h =
          refPrice && refPrice > 0
            ? ((price - refPrice) / refPrice) * 100
            : undefined;

        updated[coin.ticker] = { price, updatedAt: now, change24h };
      }

      if (!controller.signal.aborted) setLivePrices((prev) => ({ ...prev, ...updated }));
    } catch {
      // Silently fail — display falls back to cached prices
    } finally { requestsRef.current.delete(controller); }
  }, []);

  // Fetch 24h-ago reference prices for new tickers
  const fetch24hRef = useCallback(async (newTickers: string[]) => {
    const feeds = newTickers
      .map((t) => COINS.find((c) => c.ticker === t))
      .filter(Boolean) as typeof COINS;

    if (feeds.length === 0) return;

    const timestamp24hAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

    const params = new URLSearchParams();
    feeds.slice(0, MAX_IDS_PER_REQUEST).forEach((c) => {
      params.append("ids[]", c.pythFeedId);
    });
    params.append("parsed", "true");

    const controller = new AbortController();
    requestsRef.current.add(controller);
    try {
      const res = await fetch(gameApiUrl(
        `/api/live?${params.toString()}&at=${timestamp24hAgo}`
      ), { signal: controller.signal });
      if (!res.ok) return;

      const data = await res.json();

      for (const parsed of data.parsed ?? []) {
        const feedId = "0x" + parsed.id;
        const coin = feeds.find((c) => c.pythFeedId === feedId);
        if (!coin) continue;

        const price =
          Number(parsed.price.price) * Math.pow(10, Number(parsed.price.expo));

        refPricesRef.current[coin.ticker] = price;
      }
    } catch {
      // Non-critical — change just won't show
    } finally { requestsRef.current.delete(controller); }
  }, []);

  // Fetch on ticker change + poll
  useEffect(() => {
    if (tickers.length === 0) return;
    let disposed = false;

    // Check for new tickers that need 24h reference prices
    const newTickers = tickers.filter(
      (t) => !fetchedRefTickersRef.current.has(t)
    );
    if (newTickers.length > 0) {
      newTickers.forEach((t) => fetchedRefTickersRef.current.add(t));
      fetch24hRef(newTickers).then(() => { if (!disposed) return fetchLive(); });
    } else {
      fetchLive();
    }

    const interval = setInterval(fetchLive, POLL_INTERVAL);
    return () => {
      disposed = true;
      clearInterval(interval);
      requestsRef.current.forEach((controller) => controller.abort());
      requestsRef.current.clear();
    };
  }, [tickers.join(","), fetchLive, fetch24hRef]);

  return livePrices;
}
