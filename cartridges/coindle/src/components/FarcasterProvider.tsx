"use client";

import { useEffect } from "react";

export function FarcasterProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const init = async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        await sdk.actions.ready();
      } catch {
        // Not in a Farcaster context — no-op
      }
    };
    init();
  }, []);

  return <>{children}</>;
}
