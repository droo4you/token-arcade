import type { FreePlayLifecycleEvent, GameRunResult } from "../../../packages/sdk/src/index";
import { api, ApiError, type TokenGetter } from "./api";

let fallbackId: string | undefined;
function guestId(): string {
  try {
    const saved = localStorage.getItem("ta:free-play-guest");
    if (saved && /^[a-f0-9-]{36}$/i.test(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem("ta:free-play-guest", id);
    return id;
  } catch { return fallbackId ??= crypto.randomUUID(); }
}

/** Exit delivery must not wait for Privy: the start stores any authenticated identity. */
export async function recordFreePlayLifecycle(event: FreePlayLifecycleEvent, token: TokenGetter): Promise<void> {
  if (event.run.mode !== "free") return;
  const body = { guestId: guestId(), type: event.type, run: event.run, context: event.context, reason: event.reason };
  if (event.type === "exited") {
    try {
      const json = JSON.stringify(body);
      if (navigator.sendBeacon?.("/api/free-play/events", new Blob([json], { type: "application/json" }))) return;
      await fetch("/api/free-play/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true });
    } catch { /* Best effort: missing exits remain unresolved, never assumed quits. */ }
    return;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await api("/api/free-play/events", token, { method: "POST", body }); return; }
    catch (error) { if (error instanceof ApiError && error.status > 0 && error.status < 500) return; }
  }
}

/** Best effort analytics. Failure must never interrupt a local run or its save. */
export async function recordFreePlay(result: GameRunResult, token: TokenGetter): Promise<void> {
  const { proof: _proof, ...summary } = result;
  const body = { guestId: guestId(), result: summary };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await api("/api/free-play/summaries", token, { method: "POST", body });
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status > 0 && error.status < 500) return;
    }
  }
}
