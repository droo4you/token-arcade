import { progressKeys, type ProgressSnapshot, type ProgressOperation, type ProgressRead } from "../../../packages/sdk/src/progress.ts";
import type { ArcadeStore } from "./store.ts";

type Obj = Record<string, any>;
const obj = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const n = (v: unknown, max = 1e9) => Number.isFinite(v) && Number(v) >= 0 ? Math.min(max, Math.floor(Number(v))) : 0;
const union = (a: unknown, b: unknown) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])].slice(0, 100);
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
const max = (a: unknown, b: unknown) => Math.max(n(a), n(b));
const delta = (remote: unknown, local: unknown, base: unknown, initial: boolean) => initial ? max(remote, local) : Math.max(0, Math.min(1e9, n(remote) + n(local) - n(base)));

function normalize(gameId: string, key: string, value: unknown): Obj {
  const v = obj(value);
  if (gameId === "two-places") {
    const best: Obj = {};
    for (let i = 0; i < 20; i++) if (obj(v.best)[i] && n(v.best[i].time) > 0) best[i] = { time: n(v.best[i].time), apples: n(v.best[i].apples ?? v.best[i].juice, 100), total: n(v.best[i].total, 100) };
    return { unlocked: Math.max(1, n(v.unlocked, 20)), best, muted: !!v.muted };
  }
  if (gameId === "skip-to-10k") {
    const up = Object.fromEntries(["arm", "rock", "hands", "aero", "bounce", "rc", "volume"].map(k => [k, n(obj(v.up)[k] ?? (k === "bounce" ? obj(v.up).farts : 0), 5)]));
    const rocks = union(v.rocks, []).filter(x => Number.isInteger(x) && x >= 0 && x < 100);
    return { gwei: n(v.gwei), runs: n(v.runs), up, best: { days: n(obj(v.best).days), peak: n(obj(v.best).peak) },
      flags: Object.fromEntries(Object.entries(obj(v.flags)).filter(([k]) => /^[a-zA-Z0-9:_-]{1,60}$/.test(k)).slice(0, 100).map(([k, b]) => [k, !!b])),
      missions: union(v.missions, []).filter(x => Number.isInteger(x) && x >= 0 && x < 100), rocks,
      rock: rocks.includes(v.rock) ? v.rock : rocks[0] ?? 0, muted: !!v.muted, music: v.music !== false };
  }
  if (gameId === "emonad-cabinet") {
    const costs: Obj = { emonad: 0, weather: 0, skrumpey: 15, molandak: 30, afterglow: 10, moonrise: 20 };
    const unlocked = union(["emonad", "weather"], v.unlocked).filter(x => typeof x === "string" && Object.hasOwn(costs, x));
    return { bestMood: n(v.bestMood), earned: Math.max(n(v.earned), unlocked.reduce((s, k) => s + costs[k], 0)), unlocked,
      avatar: ["emonad", "skrumpey", "molandak"].includes(v.avatar) && unlocked.includes(v.avatar) ? v.avatar : "emonad",
      theme: ["weather", "afterglow", "moonrise"].includes(v.theme) && unlocked.includes(v.theme) ? v.theme : "weather" };
  }
  if (gameId === "skrumpey-slide") return { bestScore: n(v.bestScore), earnedNuts: n(v.earnedNuts), runs: n(v.runs), selected: n(v.selected, 10000) };
  if (key.endsWith("coindle-daily")) return { date: /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : "", guessedTickers: union(v.guessedTickers, []).filter(x => typeof x === "string" && /^[A-Za-z0-9.-]{1,16}$/.test(x)).slice(0, 6), gameOver: !!v.gameOver, won: !!v.won };
  return { played: n(v.played), won: Math.min(n(v.played), n(v.won)), streak: n(v.streak), maxStreak: Math.max(n(v.maxStreak), n(v.streak)),
    distribution: Array.from({ length: 6 }, (_, i) => n(v.distribution?.[i])), lastPlayedDate: /^\d{4}-\d{2}-\d{2}$/.test(v.lastPlayedDate) ? v.lastPlayedDate : "" };
}

export function cleanProgress(gameId: string, state: unknown): ProgressSnapshot {
  if (!state || typeof state !== "object" || Array.isArray(state) || JSON.stringify(state).length > 24_000) throw new TypeError("Progress must be a small save object");
  const keys = progressKeys(gameId), result: ProgressSnapshot = {};
  for (const [key, value] of Object.entries(state)) {
    if (!keys.includes(key)) throw new TypeError("Unknown progress key");
    if (value !== null) result[key] = normalize(gameId, key, value);
  }
  return result;
}

/** A three-way merge preserves independent changes and spendable balances. */
export function mergeProgress(gameId: string, remote: ProgressSnapshot, local: ProgressSnapshot, base: ProgressSnapshot, initial = false): ProgressSnapshot {
  const out = { ...remote };
  for (const [key, value] of Object.entries(local)) {
    if (!changed(value, base[key])) continue;
    const r = obj(remote[key]), l = obj(value), b = obj(base[key]);
    if (!remote[key]) { out[key] = value; continue; }
    let m: Obj = { ...r };
    const pick = (k: string) => changed(l[k], b[k]) ? l[k] : r[k];
    if (gameId === "two-places") {
      const best: Obj = { ...obj(r.best) };
      for (const [i, v] of Object.entries(obj(l.best))) {
        const prior = obj(best[i]), next = obj(v);
        best[i] = { time: prior.time ? Math.min(prior.time, next.time) : next.time, apples: max(prior.apples, next.apples), total: max(prior.total, next.total) };
      }
      m = { unlocked: max(r.unlocked, l.unlocked), best, muted: pick("muted") };
    } else if (gameId === "skip-to-10k") {
      m = { ...r, gwei: delta(r.gwei, l.gwei, b.gwei, initial), runs: delta(r.runs, l.runs, b.runs, initial),
        up: Object.fromEntries(Object.keys(obj(l.up)).map(k => [k, max(obj(r.up)[k], l.up[k])])),
        best: { days: max(obj(r.best).days, obj(l.best).days), peak: max(obj(r.best).peak, obj(l.best).peak) },
        flags: Object.fromEntries(union(Object.keys(obj(r.flags)), Object.keys(obj(l.flags))).map(k => [k, !!(obj(r.flags)[k] || obj(l.flags)[k])])),
        missions: union(r.missions, l.missions), rocks: union(r.rocks, l.rocks), rock: pick("rock"), muted: pick("muted"), music: pick("music") };
    } else if (gameId === "emonad-cabinet") {
      m = { bestMood: max(r.bestMood, l.bestMood), earned: delta(r.earned, l.earned, b.earned, initial), unlocked: union(r.unlocked, l.unlocked), avatar: pick("avatar"), theme: pick("theme") };
    } else if (gameId === "skrumpey-slide") {
      m = { bestScore: max(r.bestScore, l.bestScore), earnedNuts: delta(r.earnedNuts, l.earnedNuts, b.earnedNuts, initial), runs: delta(r.runs, l.runs, b.runs, initial), selected: pick("selected") };
    } else if (key.endsWith("coindle-daily")) {
      // Never join guesses from two different puzzles or invent a combined guess sequence.
      m = l.date > r.date || (l.date === r.date && (l.won && !r.won || (!r.gameOver && (l.gameOver || l.guessedTickers.length > r.guessedTickers.length)))) ? l : r;
    } else {
      const latest = l.lastPlayedDate > r.lastPlayedDate ? l : r;
      // Legacy stats have no dated ledger: keep high-water totals instead of adding overlapping histories.
      m = { played: max(r.played, l.played), won: max(r.won, l.won), streak: latest.streak, lastPlayedDate: latest.lastPlayedDate,
        maxStreak: max(r.maxStreak, l.maxStreak), distribution: Array.from({ length: 6 }, (_, i) => max(r.distribution?.[i], l.distribution?.[i])) };
    }
    out[key] = normalize(gameId, key, m);
  }
  return out;
}

export function initializeProgress(store: ArcadeStore): void {
  store.db.exec(`CREATE TABLE IF NOT EXISTS account_progress (player_id TEXT NOT NULL, game_id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(player_id,game_id));
    CREATE TABLE IF NOT EXISTS progress_imports (player_id TEXT NOT NULL, game_id TEXT NOT NULL, device_id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(player_id,game_id,device_id));
    CREATE TABLE IF NOT EXISTS progress_operations (player_id TEXT NOT NULL, game_id TEXT NOT NULL, operation_id TEXT NOT NULL, PRIMARY KEY(player_id,game_id,operation_id));`);
}
export function readProgress(store: ArcadeStore, player: string, game: string): ProgressSnapshot {
  const row = store.db.prepare("SELECT json FROM account_progress WHERE player_id=? AND game_id=?").get(player, game) as { json: string } | undefined;
  return row ? JSON.parse(row.json) : {};
}
function id(value: unknown): string { if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(value)) throw new TypeError("Invalid progress operation"); return value; }
export function syncProgress(store: ArcadeStore, player: string, game: string, input: { prepare?: ProgressRead; operation?: ProgressOperation }): ProgressSnapshot {
  store.db.exec("BEGIN IMMEDIATE");
  try {
    let state = readProgress(store, player, game);
    const apply = (op: ProgressOperation) => {
      const opId = id(op.id), local = cleanProgress(game, op.state), base = cleanProgress(game, op.base);
      if (store.db.prepare("SELECT 1 FROM progress_operations WHERE player_id=? AND game_id=? AND operation_id=?").get(player, game, opId)) return;
      state = mergeProgress(game, state, local, base);
      store.db.prepare("INSERT INTO progress_operations VALUES (?,?,?)").run(player, game, opId);
    };
    if (input.prepare) {
      const p = input.prepare, device = id(p.deviceId), guest = cleanProgress(game, p.guest);
      const prior = store.db.prepare("SELECT json FROM progress_imports WHERE player_id=? AND game_id=? AND device_id=?").get(player, game, device) as { json: string } | undefined;
      state = mergeProgress(game, state, guest, prior ? JSON.parse(prior.json) : {}, !prior);
      store.db.prepare("INSERT INTO progress_imports VALUES (?,?,?,?) ON CONFLICT(player_id,game_id,device_id) DO UPDATE SET json=excluded.json").run(player, game, device, JSON.stringify(guest));
      if (p.pending) apply(p.pending);
      if (p.local) apply(p.local);
    } else if (input.operation) apply(input.operation);
    else throw new TypeError("Missing progress update");
    store.db.prepare("INSERT INTO account_progress VALUES (?,?,?) ON CONFLICT(player_id,game_id) DO UPDATE SET json=excluded.json").run(player, game, JSON.stringify(state));
    store.db.exec("COMMIT"); return state;
  } catch (error) { store.db.exec("ROLLBACK"); throw error; }
}
