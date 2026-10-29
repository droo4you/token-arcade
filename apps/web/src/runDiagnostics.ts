import type { GameRunConfig } from "../../../packages/sdk/src/index.ts";
import type { RunDiagnostic } from "../../../packages/sdk/src/diagnostics.ts";
import { ApiError, type TokenGetter } from "./api.ts";

export function diagnosticDevice(ua: string) {
  return {
    browser: /Edg\//.test(ua) ? "Edge" : /Firefox\/|FxiOS\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other",
    platform: /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Macintosh|Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Other",
  };
}

export function runDiagnostics(config: GameRunConfig, token: TokenGetter) {
  let count = 0;
  return (event: RunDiagnostic & { requestId?: string; code?: string }) => {
    if (config.mode === "free" || count++ >= 80) return;
    // No retry loop: logging failures must never interfere with the game.
    void (async () => {
      const accessToken = await token();
      if (!accessToken) return;
      await fetch(`/api/runs/${encodeURIComponent(config.runId)}/diagnostics`, {
        method: "POST", keepalive: true, signal: AbortSignal.timeout(5000),
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ ...event, ...diagnosticDevice(navigator.userAgent) }),
      });
    })().catch(() => {});
  };
}

export function recordSubmissionFailure(config: GameRunConfig, token: TokenGetter, error: unknown) {
  runDiagnostics(config, token)({ event: "submission_failed", mountId: crypto.randomUUID(), sequence: 0, elapsedMs: 0,
    hidden: document.hidden, stage: "submission", code: error instanceof ApiError ? error.code ?? (error.status === 0 ? "NETWORK_ERROR" : "HTTP_ERROR") : "CLIENT_ERROR",
    ...(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {}) });
}
