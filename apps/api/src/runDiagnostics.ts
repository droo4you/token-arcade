import { randomUUID } from "node:crypto";
import type { ArcadeStore } from "./store.ts";
import { RUN_EVENTS } from "../../../packages/sdk/src/diagnostics.ts";

const RETENTION_MS = 30 * 86400_000;
export function initRunDiagnostics(store: ArcadeStore) {
  store.db.exec(`CREATE TABLE IF NOT EXISTS run_diagnostics (
    id TEXT PRIMARY KEY, received_at TEXT NOT NULL, player_id TEXT NOT NULL,
    run_id TEXT, raid_id TEXT, source TEXT NOT NULL, json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS diagnostics_run ON run_diagnostics(run_id, received_at);
  CREATE INDEX IF NOT EXISTS diagnostics_raid ON run_diagnostics(raid_id, received_at);
  CREATE INDEX IF NOT EXISTS diagnostics_player ON run_diagnostics(player_id, received_at);
  CREATE INDEX IF NOT EXISTS diagnostics_time ON run_diagnostics(received_at);`);
  store.db.prepare("DELETE FROM run_diagnostics WHERE received_at < ?").run(new Date(Date.now() - RETENTION_MS).toISOString());
}

// Diagnostics must never change the outcome of a run or payment.
export function recordRunDiagnostic(store: ArcadeStore, context: { playerId: string; runId?: string; raidId?: string }, source: "client" | "server", data: object) {
  try {
    const now = new Date().toISOString();
    store.db.prepare("DELETE FROM run_diagnostics WHERE received_at < ?").run(new Date(Date.now() - RETENTION_MS).toISOString());
    store.db.prepare("INSERT INTO run_diagnostics VALUES (?,?,?,?,?,?,?)").run(randomUUID(), now, context.playerId, context.runId ?? null, context.raidId ?? null, source, JSON.stringify(data));
  } catch { console.warn("Run diagnostic could not be stored"); }
}

export function clientDiagnostic(body: Record<string, unknown>) {
  const { event, mountId, sequence, elapsedMs, hidden, stage, browser, platform, requestId, code } = body;
  if (!RUN_EVENTS.includes(event as never) || typeof mountId !== "string" || !/^[a-f0-9-]{36}$/i.test(mountId) ||
      !Number.isSafeInteger(sequence) || Number(sequence) < 0 || Number(sequence) > 10000 ||
      !Number.isSafeInteger(elapsedMs) || Number(elapsedMs) < 0 || Number(elapsedMs) > 86400_000 || typeof hidden !== "boolean" ||
      typeof stage !== "string" || !["idle", "opening", "reading", "preparing", "applying", "done", "submission"].includes(stage) ||
      typeof browser !== "string" || !["Chrome", "Edge", "Firefox", "Safari", "Other"].includes(browser) ||
      typeof platform !== "string" || !["macOS", "Windows", "iOS", "Android", "Linux", "Other"].includes(platform) ||
      (requestId !== undefined && (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId))) ||
      (code !== undefined && (typeof code !== "string" || !/^[A-Z_]{1,64}$/.test(code)))) throw new TypeError("Invalid diagnostic event");
  // Deliberately select fields; never persist arbitrary errors, URLs, headers or payloads.
  return { event, mountId, sequence, elapsedMs, hidden, stage, browser, platform, ...(requestId ? { requestId } : {}), ...(code ? { code } : {}) };
}

export function diagnosticsReport(store: ArcadeStore, key: "run_id" | "raid_id", id: string) {
  const rows = store.db.prepare(`SELECT received_at,player_id,run_id,raid_id,source,json FROM run_diagnostics WHERE ${key}=? AND received_at >= ? ORDER BY received_at DESC,rowid DESC LIMIT 1001`)
    .all(id, new Date(Date.now() - RETENTION_MS).toISOString()) as { received_at: string; player_id: string; run_id: string | null; raid_id: string | null; source: string; json: string }[];
  return { retentionDays: 30, truncated: rows.length > 1000, events: rows.slice(0, 1000).reverse().map(r => ({ receivedAt: r.received_at, playerId: r.player_id, runId: r.run_id, raidId: r.raid_id, source: r.source, ...JSON.parse(r.json) })) };
}
