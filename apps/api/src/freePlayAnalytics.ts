import type { ArcadeStore } from "./store.ts";

export type FreePlaySample = {
  runId: string; gameId: string; gameVersion: string; objective: string;
  primaryMetric: number; secondaryMetrics: Record<string, number>;
  result: "completed" | "failed"; startedAt: string; finishedAt: string;
  audience: "guest" | "account"; receivedAt: string;
  startContext?: Record<string, number>;
};
export function distribution(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const percentile = (p: number) => {
    const i = (sorted.length - 1) * p;
    return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1);
  };
  return { count: sorted.length, min: sorted[0], median: percentile(.5), p90: percentile(.9), max: sorted.at(-1)! };
}
export function summarizeFreePlay(samples: FreePlaySample[]) {
  const groups = new Map<string, FreePlaySample[]>();
  for (const sample of samples) {
    const key = JSON.stringify([sample.gameId, sample.gameVersion, sample.objective]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(sample);
  }
  return [...groups.values()].map(runs => {
    const first = runs[0];
    const keys = [...new Set(runs.flatMap(r => Object.keys(r.secondaryMetrics)))].sort();
    return { gameId: first.gameId, gameVersion: first.gameVersion, objective: first.objective,
      runs: runs.length, guests: runs.filter(r => r.audience === "guest").length,
      accounts: runs.filter(r => r.audience === "account").length,
      completed: runs.filter(r => r.result === "completed").length,
      failed: runs.filter(r => r.result === "failed").length,
      primary: distribution(runs.map(r => r.primaryMetric))!,
      durationSeconds: distribution(runs.map(r => (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000).filter(n => n >= 0)),
      metrics: Object.fromEntries(keys.map(key => [key, distribution(runs.flatMap(r => typeof r.secondaryMetrics[key] === "number" ? [r.secondaryMetrics[key]] : []))])),
      recent: runs.slice(0, 25),
    };
  });
}
export function freePlayReport(store: ArcadeStore, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const total = (store.db.prepare("SELECT COUNT(*) AS n FROM free_play_summaries WHERE received_at >= ?").get(since) as { n: number }).n;
  const rows = store.db.prepare("SELECT s.player_id, s.received_at, s.json, e.json AS start_json FROM free_play_summaries s LEFT JOIN free_play_events e ON e.run_id=s.run_id AND e.type='started' AND e.guest_id=s.guest_id AND e.game_id=s.game_id WHERE s.received_at >= ? ORDER BY s.received_at DESC, s.run_id DESC LIMIT 10000").all(since) as { player_id: string | null; received_at: string; json: string; start_json: string | null }[];
  const samples: FreePlaySample[] = rows.map(row => {
    const r = JSON.parse(row.json);
    return { runId: r.runId, gameId: r.gameId, gameVersion: r.gameVersion, objective: r.objective,
      primaryMetric: r.primaryMetric, secondaryMetrics: r.secondaryMetrics ?? {}, result: r.result,
      startedAt: r.startedAt, finishedAt: r.finishedAt, audience: row.player_id ? "account" : "guest", receivedAt: row.received_at,
      ...(row.start_json ? { startContext: JSON.parse(row.start_json).context } : {}) };
  });
  return { generatedAt: new Date().toISOString(), since, days, total, sampled: samples.length, truncated: total > samples.length, groups: summarizeFreePlay(samples), lifecycle: lifecycleReport(store, since) };
}

function lifecycleReport(store: ArcadeStore, since: string) {
  const total = (store.db.prepare("SELECT COUNT(*) AS n FROM free_play_events WHERE type='started' AND received_at>=?").get(since) as { n: number }).n;
  const rows = store.db.prepare(`SELECT e.json, s.run_id AS finished, x.json AS exit_json
    FROM free_play_events e
    LEFT JOIN free_play_summaries s ON s.run_id=e.run_id AND s.guest_id=e.guest_id AND s.game_id=e.game_id
    LEFT JOIN free_play_events x ON x.run_id=e.run_id AND x.type='exited' AND x.guest_id=e.guest_id AND x.game_id=e.game_id
    WHERE e.type='started' AND e.received_at>=? ORDER BY e.received_at DESC,e.run_id DESC LIMIT 10000`).all(since) as { json: string; finished: string | null; exit_json: string | null }[];
  const groups = new Map<string, { gameId: string; gameVersion: string; objective: string; started: number; finished: number; exited: number; unresolved: number; withContext: number; reasons: Record<string, number> }>();
  for (const row of rows) {
    const run = JSON.parse(row.json);
    const key = JSON.stringify([run.gameId, run.gameVersion, run.objective]);
    if (!groups.has(key)) groups.set(key, { gameId: run.gameId, gameVersion: run.gameVersion, objective: run.objective, started: 0, finished: 0, exited: 0, unresolved: 0, withContext: 0, reasons: {} });
    const group = groups.get(key)!;
    group.started++;
    if (Object.keys(run.context ?? {}).length) group.withContext++;
    if (row.finished) group.finished++;
    else if (row.exit_json) { group.exited++; const reason = JSON.parse(row.exit_json).reason; group.reasons[reason] = (group.reasons[reason] ?? 0) + 1; }
    else group.unresolved++;
  }
  return { total, sampled: rows.length, truncated: total > rows.length, groups: [...groups.values()] };
}
export type FreePlayReport = ReturnType<typeof freePlayReport>;
