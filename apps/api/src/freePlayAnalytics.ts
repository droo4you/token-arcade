import type { ArcadeStore } from "./store.ts";

export type FreePlaySample = {
  runId: string; gameId: string; gameVersion: string; objective: string;
  primaryMetric: number; secondaryMetrics: Record<string, number>;
  result: "completed" | "failed"; startedAt: string; finishedAt: string;
  audience: "guest" | "account"; receivedAt: string;
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
  const rows = store.db.prepare("SELECT player_id, received_at, json FROM free_play_summaries WHERE received_at >= ? ORDER BY received_at DESC, run_id DESC LIMIT 10000").all(since) as { player_id: string | null; received_at: string; json: string }[];
  const samples: FreePlaySample[] = rows.map(row => {
    const r = JSON.parse(row.json);
    return { runId: r.runId, gameId: r.gameId, gameVersion: r.gameVersion, objective: r.objective,
      primaryMetric: r.primaryMetric, secondaryMetrics: r.secondaryMetrics ?? {}, result: r.result,
      startedAt: r.startedAt, finishedAt: r.finishedAt, audience: row.player_id ? "account" : "guest", receivedAt: row.received_at };
  });
  return { generatedAt: new Date().toISOString(), since, days, total, sampled: samples.length, truncated: total > samples.length, groups: summarizeFreePlay(samples) };
}
export type FreePlayReport = ReturnType<typeof freePlayReport>;
