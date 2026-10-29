import { useEffect, useRef, useState } from "react";
import { api, type RaidResponse } from "./api.ts";
import { useArcadeAuth } from "./auth.tsx";

/** Read-only status refreshes must never remount a cartridge or issue an attempt. */
export function useRaidAttemptStatus(raidId: string | undefined, runKey: string) {
  const auth = useArcadeAuth();
  const token = useRef(auth.getToken); token.current = auth.getToken;
  const identity = auth.ready && auth.authenticated ? auth.identityKey : null;
  const key = `${identity}:${raidId}:${runKey}`;
  const [saved, setSaved] = useState<{ key: string; data: RaidResponse | null; error: boolean }>();
  useEffect(() => {
    if (!raidId || !identity) return;
    let active = true, pending = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const refresh = async () => {
      if (!active || pending) return;
      pending = true; clearTimeout(timer);
      controller = new AbortController();
      const deadline = setTimeout(() => controller?.abort(), 10000);
      try {
        const data = await api<RaidResponse>(`/api/raids/${encodeURIComponent(raidId)}`, token.current, { signal: controller.signal });
        if (active) setSaved({ key, data, error: false });
      } catch { if (active) setSaved({ key, data: null, error: true }); }
      finally { clearTimeout(deadline); pending = false; if (active) timer = setTimeout(refresh, 5000); }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; clearTimeout(timer); controller?.abort(); window.removeEventListener("focus", refresh); };
  }, [identity, raidId, key]);
  return saved?.key === key ? saved : { key, data: null, error: false };
}
