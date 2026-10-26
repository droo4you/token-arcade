import { useEffect, useRef, useState } from "react";
import { twoPlacesUnlockedCount, type ProgressSnapshot } from "../../../packages/sdk/src/progress.ts";
import { api } from "./api.ts";
import { useArcadeAuth } from "./auth.tsx";

export function useTwoPlacesUnlocks(enabled: boolean) {
  const auth = useArcadeAuth();
  const token = useRef(auth.getToken);
  token.current = auth.getToken;
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState<{ identity: string; count: number; loading: boolean; error: string }>();
  const identity = auth.ready && auth.authenticated ? auth.identityKey : null;
  useEffect(() => {
    if (!enabled || !identity) return;
    let active = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 20000);
    setSaved({ identity, count: 1, loading: true, error: "" });
    api<{ state: ProgressSnapshot }>("/api/me/progress/two-places", token.current, { signal: controller.signal })
      .then(({ state }) => { if (active) setSaved({ identity, count: twoPlacesUnlockedCount(state), loading: false, error: "" }); })
      .catch(() => { if (active) setSaved({ identity, count: 1, loading: false, error: "Could not load your level unlocks. Retry, or open Free Play while signed in to sync your progress." }); })
      .finally(() => clearTimeout(deadline));
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearTimeout(deadline); controller.abort(); window.removeEventListener("focus", refresh); };
  }, [enabled, identity, revision]);
  const current = enabled && identity && saved?.identity === identity ? saved : undefined;
  return { count: current?.count ?? 1, loading: !!(enabled && identity && (!current || current.loading)), error: current?.error ?? "", refresh: () => setRevision(value => value + 1) };
}
