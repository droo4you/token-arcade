import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import type { GameRecord } from "../../../packages/sdk/src/index";
import type { TestnetTokenConfig, TestnetTokenLaunch } from "../../../packages/sdk/src/testnet";
import { api, messageFor } from "./api";
import { useArcadeAuth } from "./auth";

type Reply = { config: TestnetTokenConfig; launch: TestnetTokenLaunch | null };
export function TestnetTokenPanel({ game, review = false }: { game: GameRecord; review?: boolean }) {
  const auth = useArcadeAuth();
  const base = `/api/${review ? "admin" : "creator"}/games/${encodeURIComponent(game.manifest.id)}/testnet-minicoin`;
  const [state, setState] = useState<Reply>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [hash, setHash] = useState("");
  const [draft, setDraft] = useState({ name: `${game.manifest.name} Test Coin`, symbol: "", metadataURI: "", supply: "1000000" });
  useEffect(() => {
    let alive = true;
    void api<Reply>(base, auth.getToken).then((value) => { if (alive) setState(value); }).catch((reason) => { if (alive) setError(messageFor(reason)); });
    return () => { alive = false; };
  }, [base, auth.identityLabel, game.manifest.version, game.status]);
  const launch = state?.launch;
  const act = async (action: string, body: unknown) => {
    setBusy(true); setError("");
    try { setState(await api<Reply>(base + action, auth.getToken, { method: "POST", body })); setConfirmed(false); }
    catch (reason) { setError(messageFor(reason)); }
    finally { setBusy(false); }
  };
  if (review && !launch && !error) return null;
  const explorer = state?.config.chainId === 10143 ? "https://testnet.monadscan.com" : undefined;
  return <section className="console-panel testnet-token-panel">
    <div className="console-panel-heading"><div><span className="section-kicker">TESTNET TOKEN</span><h2>{game.manifest.name}</h2></div><span className="status-badge status-wait">{launch?.status ?? "Not requested"}</span></div>
    <p className="console-hint">Deploy a fixed-supply test token on Monad testnet. Trading pools, fee routing, community assets and raid funding are a separate launch step.</p>
    {error && <p role="alert" className="creator-error">{error}</p>}
    {!state && !error && <p role="status">Loading testnet configuration…</p>}
    {state && <><p>Network: {state.config.chainId === 10143 ? "Monad testnet" : "Local rehearsal"} ({state.config.chainId})</p>
      {!state.config.ready && <p className="setup-note">{state.config.reason}</p>}
      <details><summary>Deployment addresses</summary><p>Factory: <code>{state.config.factoryAddress ?? "Not configured"}</code></p><p>Test token recipient: <code>{state.config.supplyRecipient ?? "Not configured"}</code></p><p>Treasury: <code>{state.config.treasuryAddress ?? "Not configured"}</code></p></details></>}
    {launch && <><dl><dt>Token</dt><dd>{launch.input.name} ({launch.input.symbol})</dd><dt>Fixed supply</dt><dd>{formatUnits(BigInt(launch.input.initialSupply), 18)}</dd><dt>Metadata</dt><dd>{launch.input.metadataURI}</dd></dl>
      {launch.note && <p role="status">{launch.note}</p>}
      {launch.transactionHash && <p>Transaction: {explorer ? <a href={`${explorer}/tx/${launch.transactionHash}`} target="_blank" rel="noreferrer">View on testnet explorer</a> : <code>{launch.transactionHash}</code>}</p>}
      {launch.token && <p role="status">Confirmed test token: {explorer ? <a href={`${explorer}/address/${launch.token.address}`} target="_blank" rel="noreferrer">{launch.token.address}</a> : <code>{launch.token.address}</code>}</p>}
    </>}
    {review && launch?.status === "submitted" && <div className="console-form"><button disabled={busy} className="action action-lime" onClick={() => void act("/approve", { requestId: launch.id })}>Approve these token settings</button><label>Review feedback<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label><button disabled={busy || !note.trim()} onClick={() => void act("/reject", { requestId: launch.id, note })}>Return for changes</button></div>}
    {!review && (!launch || ["submitted", "rejected", "approved"].includes(launch.status)) && <details open={!launch || launch.status === "rejected"}><summary>{launch ? "Revise token request (requires new approval)" : "Request a test token"}</summary>
      <form className="console-form" onSubmit={(event) => {
        event.preventDefault();
        if (!/^[1-9][0-9]{0,58}$/.test(draft.supply)) { setError("Enter a positive whole-token supply"); return; }
        void act("", { name: draft.name, symbol: draft.symbol, metadataURI: draft.metadataURI, initialSupply: parseUnits(draft.supply, 18).toString() });
      }}><label>Token name<input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Symbol<input required pattern="[A-Za-z][A-Za-z0-9]{0,19}" value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} /></label>
        <label>Supply (whole tokens)<input required inputMode="numeric" pattern="[1-9][0-9]{0,58}" value={draft.supply} onChange={(e) => setDraft({ ...draft, supply: e.target.value })} /></label>
        <label>Metadata URL (HTTPS or IPFS)<input required value={draft.metadataURI} onChange={(e) => setDraft({ ...draft, metadataURI: e.target.value })} /></label>
        <button className="action action-light" disabled={busy || !state?.config.ready || !["approved", "published"].includes(game.status)}>Submit token settings for review</button>
      </form></details>}
    {!review && launch?.status === "approved" && <div className="console-form"><label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Launch these approved settings on testnet. Test tokens go to the recipient shown above.</label><button className="action action-lime" disabled={busy || !confirmed || !state?.config.ready} onClick={() => void act("/deploy", { requestId: launch.id, confirmTestnet: true })}>{busy ? "Launching…" : "Launch test token"}</button></div>}
    {launch?.status === "pending" && <div className="console-form">{!launch.transactionHash && <label>Submitted transaction hash<input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x…" /></label>}<button disabled={busy || (!launch.transactionHash && !/^0x[0-9a-fA-F]{64}$/.test(hash))} onClick={() => void act("/reconcile", { requestId: launch.id, transactionHash: hash })}>Check confirmation</button></div>}
  </section>;
}
