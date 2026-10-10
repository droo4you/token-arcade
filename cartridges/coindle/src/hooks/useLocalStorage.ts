"use client";

import { useState, useEffect, useCallback } from "react";
import { arcadeStorageKey } from "@/lib/arcade";

/**
 * useState backed by localStorage. SSR-safe — uses lazy initializer
 * to hydrate synchronously on first client render (avoids race conditions).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  key = arcadeStorageKey(key);
  const [storedValue, setStoredValue] = useState<T>(() => {
    // Lazy initializer — runs only on first render (client-side)
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      if (item) return JSON.parse(item) as T;
    } catch {
      // Ignore parse errors
    }
    return initialValue;
  });

  // Sync if key changes (rare)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch {
      // Ignore
    }
  }, [key]);

  // Setter that also writes to localStorage
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          // Quota exceeded, etc.
        }
        return nextValue;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}
