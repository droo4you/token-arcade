import { createHmac, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { ArcadeStore } from "./store.ts";

const DAY = 86400_000;
const cookieName = "ta_age";
// Process-scoped key: a restart requires screening again rather than trusting a stale receipt.
const key = randomBytes(32);
export function ageStatus(request: IncomingMessage): "adult" | "blocked" | "unknown" {
  const value = request.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!value || value.length > 200) return "unknown";
  const [state, expiry, signature] = value.split(".");
  if (!["adult", "blocked"].includes(state) || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now()) return "unknown";
  const expected = createHmac("sha256", key).update(`${state}.${expiry}`).digest("hex");
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return "unknown";
  return state as "adult" | "blocked";
}
export function ageCookie(state: "adult" | "blocked", secure: boolean): string {
  const ttl = state === "adult" ? 30 * DAY : DAY;
  const payload = `${state}.${Date.now() + ttl}`;
  const value = `${payload}.${createHmac("sha256", key).update(payload).digest("hex")}`;
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ttl / 1000}${secure ? "; Secure" : ""}`;
}
export function adultFromDate(value: unknown, now = new Date()): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Enter a valid date of birth.");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date > now || date.getUTCFullYear() < now.getUTCFullYear() - 120) throw new TypeError("Enter a valid date of birth.");
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  return date <= cutoff;
}
export function initializePrivacy(store: ArcadeStore): void {
  store.db.exec(`CREATE TABLE IF NOT EXISTS privacy_requests (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL UNIQUE, requested_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', completed_at TEXT
  )`);
  prunePrivacyData(store);
}
export function prunePrivacyData(store: ArcadeStore): void {
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
  for (const table of ["free_play_events", "free_play_summaries", "run_diagnostics"]) {
    store.db.prepare(`DELETE FROM ${table} WHERE received_at < ?`).run(cutoff);
  }
  store.db.prepare("DELETE FROM wallet_challenges WHERE expires_at < ?").run(new Date(Date.now() - DAY).toISOString());
  store.db.prepare("DELETE FROM privacy_requests WHERE status = 'completed' AND completed_at < ?").run(cutoff);
}
export function requestDeletion(store: ArcadeStore, playerId: string) {
  store.db.prepare("INSERT OR IGNORE INTO privacy_requests (id,player_id,requested_at) VALUES (?,?,?)").run(randomUUID(), playerId, new Date().toISOString());
  return store.db.prepare("SELECT id,requested_at AS requestedAt,status FROM privacy_requests WHERE player_id=?").get(playerId);
}
export function exportPlayerData(store: ArcadeStore, playerId: string) {
  const tables = ["run_sessions", "accepted_results", "linked_wallets", "wallet_challenges", "funded_raid_players", "free_play_events", "free_play_summaries", "account_progress", "progress_imports", "progress_operations", "run_diagnostics", "privacy_requests"];
  const data = Object.fromEntries(tables.map(table => [table, store.db.prepare(`SELECT * FROM ${table} WHERE player_id=?`).all(playerId)]));
  return { exportedAt: new Date().toISOString(), passport: store.getPassport(playerId), data,
    note: "This export contains Token Arcade's account records. Contact us about provider records and records embedded in shared community events. Public blockchain records cannot be erased." };
}

/** Operator-reviewed local erasure. Provider/wallet review must happen first. */
export function completeDeletion(store: ArcadeStore, requestId: string): void {
  const request = store.db.prepare("SELECT player_id,status FROM privacy_requests WHERE id=?").get(requestId) as { player_id: string; status: string } | undefined;
  if (!request) throw new Error("Request not found");
  if (request.status === "completed") return;
  const playerId = request.player_id;
  // Do not erase evidence needed for an unsettled payment or creator obligations.
  if (store.db.prepare("SELECT 1 FROM funded_raid_players WHERE player_id=? LIMIT 1").get(playerId)) throw new Error("Funded-event records require manual review and a documented retention/redaction decision.");
  if (store.listGames().some(g => g.creatorId === playerId)) throw new Error("Transfer or retire creator-owned cabinets before erasure.");
  const raids = store.listRaids();
  const sessions = store.db.prepare("SELECT id,raid_id FROM run_sessions WHERE player_id=?").all(playerId) as { id: string; raid_id: string | null }[];
  if (sessions.some(s => s.raid_id && raids.some(r => r.id === s.raid_id && !r.finalResult && r.status !== "cancelled"))) throw new Error("Resolve active community-event participation before erasure.");
  if (raids.some(r => r.funding && r.finalResult?.entries.some(e => e.playerId === playerId))) throw new Error("Funded-event history requires manual review.");
  store.db.exec("BEGIN IMMEDIATE");
  try {
    const hasRapid = store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='coindle_rapid'").get();
    if (hasRapid) for (const session of sessions) store.db.prepare("DELETE FROM coindle_rapid WHERE run_id=?").run(session.id);
    for (const raid of raids) {
      if (raid.finalResult?.entries.some(e => e.playerId === playerId)) {
        raid.finalResult.entries = raid.finalResult.entries.map(e => e.playerId === playerId ? { ...e, playerId: `deleted:${randomUUID()}`, displayName: "Deleted player", runId: "deleted" } : e);
        store.saveRaid(raid);
      }
    }
    for (const table of ["run_sessions", "accepted_results", "linked_wallets", "wallet_challenges", "free_play_events", "free_play_summaries", "account_progress", "progress_imports", "progress_operations", "run_diagnostics"]) store.db.prepare(`DELETE FROM ${table} WHERE player_id=?`).run(playerId);
    store.db.prepare("DELETE FROM players WHERE id=?").run(playerId);
    store.db.prepare("UPDATE privacy_requests SET status='completed',completed_at=? WHERE id=?").run(new Date().toISOString(), requestId);
    store.db.exec("COMMIT");
  } catch (e) { store.db.exec("ROLLBACK"); throw e; }
}
