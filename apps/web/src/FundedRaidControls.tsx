import { useEffect, useState } from "react";
import type { Raid } from "../../../packages/sdk/src/index";
import { api, messageFor } from "./api";
import { useArcadeAuth } from "./auth";

export function FundedRaidControls() {
  const auth = useArcadeAuth();
  const [raids, setRaids] = useState<Raid[]>([]);
  const [id, setId] = useState("");
  const [plan, setPlan] = useState("");
  const [chainId, setChainId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async () => {
    const response = await api<{ raids: Raid[] }>("/api/admin/raids", auth.getToken);
    setRaids(response.raids.filter(r => r.gameId === "skrumpey-slide" && r.reward.type === "erc20"));
  };
  useEffect(() => { void refresh().catch(e => setMessage(messageFor(e))); }, [auth.identityKey]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await work(); } catch (e) { setMessage(messageFor(e)); } finally { setBusy(false); }
  };
  const create = () => act(async () => {
    const existing = await api<{ raids: Raid[] }>("/api/admin/raids", auth.getToken);
    const pending = existing.raids.find(r => r.gameId === "skrumpey-slide" && r.reward.type === "erc20" && (r.status === "draft" || r.status === "open"));
    if (pending) { setId(pending.id); await refresh(); setMessage("An existing funded draft or open raid is selected. Resume it before creating another."); return; }
    const response = await api<{ raid: Raid }>("/api/admin/raids", auth.getToken, { method: "POST", body: {
      name: "Skrumpey Slide · funded testnet pilot", gameId: "skrumpey-slide", communityId: "skrumpeys", objective: "score", maxAttempts: 3,
      startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString(), rules: {},
      reward: { type: "erc20", asset: "0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541" },
      feeSplitBps: { prize: 0, community: 0, treasury: 10000 },
    } });
    setId(response.raid.id); setPlan(""); await refresh(); setMessage("Draft created. The timer has not started.");
  });
  const getPlan = (stage: "rules" | "settlement") => act(async () => {
    setPlan("");
    const response = await api<unknown>(`/api/admin/raids/${encodeURIComponent(id)}/funded/${stage}`, auth.getToken);
    setPlan(JSON.stringify(response, null, 2));
  });
  const bind = () => act(async () => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(chainId.trim())) throw new Error("Enter the on-chain raid ID returned by the operator.");
    const response = await api<{ raid: Raid }>(`/api/admin/raids/${encodeURIComponent(id)}/funded/bind`, auth.getToken, { method: "POST", body: { chainRaidId: chainId.trim() } });
    await refresh(); setMessage(`Funded raid open until ${new Date(response.raid.endsAt).toLocaleString()}.`);
  });
  const selected = raids.find(r => r.id === id);
  return <section className="console-panel">
    <h2>Funded Skrumpey testnet pilot</h2>
    <p>Free entry, three attempts, test WMON prize. Create a draft, give its rules plan to the vault operator, then link the opened chain raid. The operator starts the 30-minute clock.</p>
    <button disabled={busy} onClick={() => void create()}>Prepare funded draft</button>
    <label>Funded pilot<select value={id} onChange={e => { setId(e.target.value); setPlan(""); setChainId(""); setMessage(""); }}><option value="">Select a pilot</option>{raids.map(r => <option key={r.id} value={r.id}>{r.name} · {r.status} · {r.id}</option>)}</select></label>
    {selected && <>
      <p>Website raid ID: <code>{selected.id}</code></p>
      <a href={`/raids/${selected.id}`}>Open pilot lobby</a>
      <div><button disabled={busy || selected.status !== "draft"} onClick={() => void getPlan("rules")}>Show rules plan</button><button disabled={busy || selected.status !== "closed"} onClick={() => void getPlan("settlement")}>Show settlement plan</button></div>
      {plan && <label>Operator plan (public data)<textarea readOnly rows={12} value={plan} /></label>}
      {selected.status === "draft" && <><label>On-chain raid ID<input value={chainId} onChange={e => setChainId(e.target.value)} /></label><button disabled={busy || !chainId} onClick={() => void bind()}>Link funded raid</button></>}
    </>}
    <p role="status">{busy ? "Working…" : message}</p>
  </section>;
}
