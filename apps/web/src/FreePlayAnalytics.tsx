import { useEffect, useState } from "react";
import type { FreePlayReport } from "../../api/src/freePlayAnalytics";
import { api, messageFor } from "./api";
import { useArcadeAuth } from "./auth";

const number = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const label = (key: string) => key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");

export function FreePlayAnalytics() {
  const auth = useArcadeAuth();
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<FreePlayReport | null>(null);
  const [selection, setSelection] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(""); setReport(null);
    api<FreePlayReport>(`/api/admin/free-play/report?days=${days}`, auth.getToken, { signal: controller.signal })
      .then(next => { if (!controller.signal.aborted) setReport(next); }).catch(e => { if (!controller.signal.aborted) setError(messageFor(e)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [days, revision, auth.identityKey]);
  const groupKey = (g: FreePlayReport["groups"][number]) => JSON.stringify([g.gameId, g.gameVersion, g.objective]);
  const group = report?.groups.find(g => groupKey(g) === selection) ?? report?.groups[0];
  const exportReport = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `free-play-${days}d-${report.generatedAt.slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="console-panel free-play-analytics" id="free-play-analytics">
    <span className="section-kicker">PLAYTEST DATA</span><h2>Free Play analytics</h2>
    <p>Reported runs from guests and signed-in players. These results are unverified and do not award competitive scores.</p>
    <div className="form-row"><label>Received in the last<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>24 hours</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label><button disabled={busy} onClick={() => setRevision(n => n + 1)}>Refresh data</button><button disabled={!report} onClick={exportReport}>Download report</button></div>
    <p role="status">{busy ? "Loading run summaries…" : error || (report ? `${number(report.sampled)} reported runs. Updated ${new Date(report.generatedAt).toLocaleString()}.` : "")}</p>
    {report?.truncated && <p>Showing the newest 10,000 of {number(report.total)} reports in this window. All statistics below describe this sample.</p>}
    {report?.lifecycle && <>
      <h3>Started runs and exits</h3>
      <p>{report.lifecycle.sampled} observed starts in this window. Finished means a result was received; exited means the host reported an exit without a result. Unresolved may mean still playing, a closed browser, or a missed upload.</p>
      {report.lifecycle.truncated && <p>Lifecycle counts describe the newest 10,000 of {report.lifecycle.total} starts.</p>}
      {report.lifecycle.groups.length ? <div className="analytics-table-scroll"><table><thead><tr><th>Game / version / objective</th><th>Started</th><th>Finished</th><th>Exited without result</th><th>Unresolved</th><th>Start context captured</th><th>Exit reasons</th></tr></thead><tbody>{report.lifecycle.groups.map(g => <tr key={JSON.stringify([g.gameId, g.gameVersion, g.objective])}><th scope="row">{g.gameId} · {g.gameVersion} · {label(g.objective)}</th><td>{g.started}</td><td>{g.finished}</td><td>{g.exited}</td><td>{g.unresolved}</td><td>{g.withContext}</td><td>{Object.entries(g.reasons).map(([reason, count]) => `${reason}: ${count}`).join(", ") || "—"}</td></tr>)}</tbody></table></div> : <p>No starts captured yet. Tracking applies to new runs after this release; historical summaries cannot supply missing starts.</p>}
    </>}
    {report && !report.groups.length && <p>No run summaries received in this window. Only games played inside the arcade that emit a run result appear here.</p>}
    {group && <>
      <label>Game / version / objective<select value={groupKey(group)} onChange={e => setSelection(e.target.value)}>{report!.groups.map(g => <option key={groupKey(g)} value={groupKey(g)}>{g.gameId} · v{g.gameVersion} · {label(g.objective)} ({g.runs} runs)</option>)}</select></label>
      <p><strong>{group.runs} runs</strong> · {group.guests} guest runs · {group.accounts} account runs. Counts are runs, not unique people.</p>
      <p>{group.completed} reported “completed” · {group.failed} reported “failed”. Games define these outcomes differently; “completed” may simply mean the run ended.</p>
      <div className="analytics-table-scroll"><table><caption>Performance within this game version</caption><thead><tr><th>Metric</th><th>Reports</th><th>Min</th><th>Median</th><th>90th percentile</th><th>Max</th></tr></thead><tbody>
        {[{ name: label(group.objective), stats: group.primary }, { name: "Reported duration (seconds)", stats: group.durationSeconds }, ...Object.entries(group.metrics).map(([name, stats]) => ({ name: label(name), stats }))].filter(row => row.stats).map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>{number(row.stats?.count)}</td><td>{number(row.stats?.min)}</td><td>{number(row.stats?.median)}</td><td>{number(row.stats?.p90)}</td><td>{number(row.stats?.max)}</td></tr>)}
      </tbody></table></div>
      <details><summary>Latest {group.recent.length} reported runs</summary><div className="analytics-table-scroll"><table><thead><tr><th>Received</th><th>Player type</th><th>Result</th><th>{label(group.objective)}</th><th>Details</th></tr></thead><tbody>{group.recent.map(run => <tr key={run.runId}><td>{new Date(run.receivedAt).toLocaleString()}</td><td>{run.audience}</td><td>{run.result}</td><td>{number(run.primaryMetric)}</td><td><details><summary>Run metrics</summary><strong>At start (levelIndex is zero-based)</strong><pre>{run.startContext && Object.keys(run.startContext).length ? JSON.stringify(run.startContext, null, 2) : "Not captured"}</pre><strong>At finish</strong><pre>{JSON.stringify(run.secondaryMetrics, null, 2)}</pre></details></td></tr>)}</tbody></table></div></details>
    </>}
    <p className="console-hint">Coverage: best-effort start, exit and result observations. Switching tabs pauses a game and is not an exit. Missing uploads stay unresolved; they are not automatically counted as quits. Performance statistics use received results only. Missing metrics are excluded, not treated as zero. Free Play upgrades and selected levels can differ even within a version; inspect start context before comparing performance.</p>
  </section>;
}
