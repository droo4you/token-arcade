import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, BadgeCheck, Code2, Plus, ShieldCheck, Upload, X } from "lucide-react";
import type { GameManifest, GameMode, GameObjective, GameRecord } from "../../../packages/sdk/src/index";
import { api, ApiError, messageFor, type GameResponse, type Health } from "./api";
import { useArcadeAuth } from "./auth";

type Submission = GameRecord & { readiness?: { ready: boolean; blockers: string[] } };
const objectives: GameObjective[] = ["score", "total_score", "distance", "destruction", "completion_time", "stars", "guesses"];
const checks = [
  ["builds", "Build completes successfully"], ["mounts", "Free Play mounts and can be played"],
  ["destroys", "Leaving the cabinet stops the game, audio and listeners"], ["resultSchema", "Completed runs return the required result fields"],
  ["mobile", "Controls and orientation work on the declared devices"], ["sourceReviewed", "Source and isolated artifact reviewed; no wallet or economy code in the hosted path"],
] as const;

function SubmissionForm({ game, busy, onSubmit, onCancel }: { game?: Submission; busy: boolean; onSubmit: (body: unknown, id?: string) => Promise<void>; onCancel: () => void }) {
  const manifest = game?.manifest;
  const [draft, setDraft] = useState({
    id: manifest?.id ?? "", name: manifest?.name ?? "", description: manifest?.description ?? "", developer: manifest?.developer ?? "",
    version: manifest?.version ?? "1.0.0", adapterId: manifest?.adapterId ?? "", skeletonId: manifest?.skeletonId ?? "", url: manifest?.entry?.url ?? "",
    artwork: manifest?.artwork ?? "", genre: manifest?.presentation?.genre ?? "Arcade game", palette: manifest?.presentation?.palette ?? "cyan", glyph: manifest?.presentation?.glyph ?? "✦",
    touch: manifest?.controls?.touch ?? true, orientation: manifest?.controls?.orientation ?? "any",
    verifierKind: manifest?.verifier?.kind ?? "session_checks", verifierDescription: manifest?.verifier?.description ?? "",
    communityName: game?.communityConcept?.name ?? "", communityType: game?.communityConcept?.type ?? "concept", communityAddress: game?.communityConcept?.address ?? "", communityDescription: game?.communityConcept?.description ?? "",
    economyStatus: game?.economy?.status === "coming_soon" ? "coming_soon" : "pending", economyReason: game?.economy?.reason ?? "Optional economy awaits protocol review.",
  });
  const [modes, setModes] = useState<GameMode[]>(manifest?.supportedModes ?? ["free"]);
  const [selectedObjectives, setSelectedObjectives] = useState<GameObjective[]>(manifest?.supportedObjectives ?? ["score"]);
  const [formError, setFormError] = useState("");
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setFormError("");
    let entry: URL;
    try { entry = new URL(draft.url); } catch { setFormError("Enter the full URL of the versioned Cartridge build."); return; }
    if (!selectedObjectives.length) { setFormError("Select at least one scoring objective."); return; }
    const nextManifest: GameManifest = {
      id: draft.id.trim(), name: draft.name.trim(), description: draft.description.trim(), developer: draft.developer.trim(), version: draft.version.trim(), adapterId: draft.adapterId.trim(),
      skeletonId: draft.skeletonId.trim() || draft.adapterId.trim(), supportedModes: modes, supportedObjectives: selectedObjectives,
      communityOptional: manifest?.communityOptional ?? true, minicoinOptional: manifest?.minicoinOptional ?? true,
      entry: { kind: "iframe", url: entry.href, origin: entry.origin },
      presentation: { genre: draft.genre.trim(), palette: draft.palette, glyph: draft.glyph.trim() },
      controls: { touch: draft.touch, orientation: draft.orientation },
      ...(draft.artwork.trim() ? { artwork: draft.artwork.trim() } : {}),
      ...(modes.some((mode) => mode !== "free") ? { verifier: { kind: draft.verifierKind, description: draft.verifierDescription.trim() } } : {}),
    };
    await onSubmit({ manifest: nextManifest,
      communityConcept: draft.communityName.trim() ? { name: draft.communityName.trim(), type: draft.communityType, verification: "unverified", ...(draft.communityAddress.trim() ? { address: draft.communityAddress.trim() } : {}), ...(draft.communityDescription.trim() ? { description: draft.communityDescription.trim() } : {}) } : null,
      economy: { status: draft.economyStatus, reason: draft.economyReason.trim() },
    }, game?.manifest.id);
  };
  return <section className="console-panel creator-submission-panel">
    <div className="console-panel-heading"><div><span className="section-kicker">CREATOR SUBMISSION</span><h2>{game ? "Revise your cartridge" : "Bring a game to the arcade"}</h2></div><button type="button" aria-label="Close submission form" onClick={onCancel}><X size={20} /></button></div>
    <p className="console-hint">Submit a versioned game build for review. After approval, you decide when to deploy your cabinet.</p>
    {game && <p className="console-hint">Saving a revision sends this cabinet back for review. Its game ID and score history stay the same.</p>}
    <form className="console-form" onSubmit={submit}>
      <div className="form-row"><label>Cabinet name<input required maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} /></label><label>Game ID<input required disabled={!!game} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.id} onChange={(e) => set("id", e.target.value)} placeholder="your-cabinet" /></label></div>
      <label>Description<textarea required maxLength={2000} value={draft.description} onChange={(e) => set("description", e.target.value)} /></label>
      <div className="form-row"><label>Developer<input required value={draft.developer} onChange={(e) => set("developer", e.target.value)} /></label><label>Game version<input required value={draft.version} onChange={(e) => set("version", e.target.value)} /></label></div>
      <label>Versioned Cartridge URL<input type="url" required value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://games.example/your-cabinet/v/1.0.0/" /><small>Use an approved separate origin and an immutable /v/{draft.version || "1.0.0"}/ build. The platform operator configures approved origins.</small></label>
      <div className="form-row"><label>Gameplay Skeleton ID<input required value={draft.skeletonId} onChange={(e) => set("skeletonId", e.target.value)} placeholder="your-game-skeleton" /></label><label>Adapter ID<input required value={draft.adapterId} onChange={(e) => set("adapterId", e.target.value)} placeholder="your-reviewed-adapter" /></label></div>
      <fieldset><legend>Supported modes</legend><div className="creator-options">{(["free", "ranked", "raid"] as GameMode[]).map((mode) => <label key={mode}><input type="checkbox" checked={modes.includes(mode)} disabled={mode === "free"} onChange={(e) => setModes((prior) => e.target.checked ? [...prior, mode] : prior.filter((item) => item !== mode))} />{mode === "free" ? "Free Play" : mode === "ranked" ? "Passport Play" : "Community Raid"}</label>)}</div></fieldset>
      <fieldset><legend>Scoring objectives</legend><div className="creator-options">{objectives.map((objective) => <label key={objective}><input type="checkbox" checked={selectedObjectives.includes(objective)} onChange={(e) => setSelectedObjectives((prior) => e.target.checked ? [...prior, objective] : prior.filter((item) => item !== objective))} />{objective.replaceAll("_", " ")}</label>)}</div><small>The first selected objective is the Passport Play leaderboard metric: {selectedObjectives[0]?.replaceAll("_", " ") ?? "select one"}.</small></fieldset>
      {modes.some((mode) => mode !== "free") && <><label>Score verification<select value={draft.verifierKind} onChange={(e) => set("verifierKind", e.target.value as typeof draft.verifierKind)}><option value="session_checks">Session and telemetry checks</option><option value="server_authoritative">Server authoritative</option><option value="replay">Deterministic replay</option></select></label><label>Verifier description<textarea required value={draft.verifierDescription} onChange={(e) => set("verifierDescription", e.target.value)} placeholder="How the reviewed server verifier validates this game's result." /><small>Competitive modes require an installed server verifier. Declaring a verifier here does not install one.</small></label></>}
      <details className="creator-form-details"><summary>Artwork, controls and presentation</summary><label>Artwork URL<input type="url" value={draft.artwork} onChange={(e) => set("artwork", e.target.value)} /></label><div className="form-row"><label>Genre<input required value={draft.genre} onChange={(e) => set("genre", e.target.value)} /></label><label>Cabinet mark<input required maxLength={16} value={draft.glyph} onChange={(e) => set("glyph", e.target.value)} /></label></div><div className="form-row"><label>Color<select value={draft.palette} onChange={(e) => set("palette", e.target.value as typeof draft.palette)}>{["cyan", "pink", "violet", "lime", "ink"].map((color) => <option key={color}>{color}</option>)}</select></label><label>Orientation<select value={draft.orientation} onChange={(e) => set("orientation", e.target.value as typeof draft.orientation)}><option value="any">Any</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label></div><label className="creator-check"><input type="checkbox" checked={draft.touch} onChange={(e) => set("touch", e.target.checked)} />Touch controls supported</label></details>
      <details className="creator-form-details"><summary>Community and optional economy</summary><label>Community name<input value={draft.communityName} onChange={(e) => set("communityName", e.target.value)} placeholder="Optional community association" /></label><label>Association type<select value={draft.communityType} onChange={(e) => set("communityType", e.target.value as typeof draft.communityType)}><option value="concept">Concept / pending asset</option><option value="erc20">ERC-20 community</option><option value="erc721">ERC-721 collection</option></select></label><label>Reference address<input value={draft.communityAddress} onChange={(e) => set("communityAddress", e.target.value)} placeholder="Optional; verified separately before economic use" /></label><label>Association notes<textarea value={draft.communityDescription} onChange={(e) => set("communityDescription", e.target.value)} /></label><label>Economy request<select value={draft.economyStatus} onChange={(e) => set("economyStatus", e.target.value)}><option value="pending">Pending protocol review</option><option value="coming_soon">Coming soon</option></select></label><label>Economy notes<textarea required value={draft.economyReason} onChange={(e) => set("economyReason", e.target.value)} /></label><p className="console-hint">A cabinet can publish and remain playable while its economy is pending. An asset reference does not enable ownership checks or move funds.</p></details>
      {formError && <p className="creator-error" role="alert">{formError}</p>}
      <div className="creator-actions"><button className="action action-lime" type="submit" disabled={busy}><Upload size={18} />{game ? "Save and resubmit" : "Submit for review"}</button><button className="action action-light" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  </section>;
}

function ReviewPanel({ game, busy, action }: { game: Submission; busy: boolean; action: (path: string, body?: unknown, message?: string) => Promise<void> }) {
  const [values, setValues] = useState(() => Object.fromEntries(checks.map(([key]) => [key, game.review?.validation?.[key] ?? false])) as Record<typeof checks[number][0], boolean>);
  const [notes, setNotes] = useState(game.review?.validation?.notes ?? "");
  const [reason, setReason] = useState("");
  const base = `/api/admin/games/${encodeURIComponent(game.manifest.id)}`;
  return <section className="console-panel creator-review-panel"><div className="console-panel-heading"><div><span className="section-kicker">ADMIN REVIEW</span><h2>{game.manifest.name}</h2></div><ShieldCheck size={25} /></div>
    <p className="console-hint">Inspect this exact version and record the checks you performed. Approval returns the Deploy action to its creator.</p>
    <dl className="creator-review-details"><div><dt>Version</dt><dd>{game.manifest.version}</dd></div><div><dt>Modes</dt><dd>{game.manifest.supportedModes.join(", ")}</dd></div><div><dt>Objectives</dt><dd>{game.manifest.supportedObjectives.join(", ")}</dd></div><div><dt>Community</dt><dd>{game.communityConcept?.name ?? game.community?.name ?? "No association"}</dd></div><div><dt>Economy</dt><dd>{game.economy?.reason ?? "No economy requested"}</dd></div><div><dt>Verifier</dt><dd>{game.manifest.verifier?.description ?? "Free Play only"}</dd></div></dl>
    {game.manifest.entry && <a className="creator-artifact-link" href={game.manifest.entry.url} target="_blank" rel="noopener noreferrer">Open submitted build <ArrowUpRight size={16} /></a>}
    <form className="console-form" onSubmit={(event) => { event.preventDefault(); void action(`${base}/validate`, { ...values, notes: notes.trim() || undefined }, "Technical review saved."); }}><fieldset><legend>Technical validation</legend>{checks.map(([key, label]) => <label className="creator-check" key={key}><input type="checkbox" checked={values[key]} onChange={(e) => setValues((prior) => ({ ...prior, [key]: e.target.checked }))} />{label}</label>)}</fieldset><label>Review evidence<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Build/test commands, browser checks, source review findings and known limitations." /></label><button className="action action-light" disabled={busy} type="submit">Save technical review</button></form>
    {!!game.readiness?.blockers.length && <div className="creator-blockers"><strong>Before approval</strong><ul>{game.readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
    <button className="action action-lime" disabled={busy || !game.readiness?.ready || !["submitted", "draft"].includes(game.status)} onClick={() => void action(`${base}/approve`, undefined, "Approved. The submitting creator can now deploy.")}><BadgeCheck size={18} />Approve cartridge</button>
    <form className="console-form creator-reject-form" onSubmit={(event) => { event.preventDefault(); void action(`${base}/reject`, { reason: reason.trim() }, "Review feedback returned to the creator."); }}><label>Return with feedback<textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the changes needed before approval." /></label><button className="action action-light" type="submit" disabled={busy || !reason.trim()}>Reject with feedback</button></form>
  </section>;
}

export function CreatorPortal({ refresh, health }: { refresh: () => void; health?: Health | null }) {
  const auth = useArcadeAuth();
  const token = useRef(auth.getToken); token.current = auth.getToken;
  const [owned, setOwned] = useState<Submission[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Submission[]>([]);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!auth.authenticated) { setOwned([]); setReviewQueue([]); setAdmin(false); return; }
    const [creator, reviewer] = await Promise.allSettled([
      api<{ games: Submission[] }>("/api/creator/games", token.current),
      api<{ games: Submission[] }>("/api/admin/games", token.current),
    ]);
    if (creator.status === "fulfilled") setOwned(creator.value.games); else setError(messageFor(creator.reason));
    if (reviewer.status === "fulfilled") { setAdmin(true); setReviewQueue(reviewer.value.games.filter((game) => game.creatorId && game.status !== "published")); }
    else { setAdmin(false); setReviewQueue([]); }
  }, [auth.authenticated, auth.demoRole]);
  useEffect(() => { setEditing(null); setReviewing(null); setError(""); setNotice(""); void load(); }, [load]);
  const handleError = (reason: unknown) => { setError(messageFor(reason)); setDetails(reason instanceof ApiError ? reason.details : []); };
  const action = async (path: string, body?: unknown, message?: string) => {
    setBusy(true); setError(""); setDetails([]); setNotice("");
    try { await api<GameResponse>(path, token.current, { method: "POST", body }); setNotice(message ?? "Updated."); await load(); refresh(); }
    catch (reason) { handleError(reason); }
    finally { setBusy(false); }
  };
  const submit = async (body: unknown, id?: string) => {
    setBusy(true); setError(""); setDetails([]); setNotice("");
    try { await api<GameResponse>(id ? `/api/creator/games/${encodeURIComponent(id)}` : "/api/creator/games", token.current, { method: id ? "PATCH" : "POST", body }); setEditing(null); setNotice("Cartridge submitted for admin review."); await load(); refresh(); }
    catch (reason) { handleError(reason); }
    finally { setBusy(false); }
  };
  const editedGame = owned.find((game) => game.manifest.id === editing);
  const reviewedGame = reviewQueue.find((game) => game.manifest.id === reviewing);
  return <main className="page-width launch-page creator-portal">
    <div className="page-intro"><div className="intro-icon"><Code2 size={30} /></div><span className="section-kicker">CREATOR / ARCADE PORTAL</span><h1>Give your game a cabinet.</h1><p>Submit your cartridge, follow its review, then deploy it to the arcade.</p></div>
    <ol className="creator-lifecycle" aria-label="Publication steps"><li>Submit</li><li>Admin approves</li><li>Developer deploys</li><li>Published</li></ol>
    {!auth.authenticated ? <section className="console-panel creator-signin"><h2>Your creator account</h2><p>Sign in to submit a game and track its publication.</p>{auth.configured ? <button className="action action-lime" onClick={auth.login}>Sign in</button> : <p>Player accounts will open when sign-in is configured.</p>}{health?.auth.localDemo && <div className="demo-controls"><strong>Local review demo</strong><button onClick={() => auth.setDemoRole("player")}>Enter as creator</button>{health.auth.localDemoAdmin && <button onClick={() => auth.setDemoRole("admin")}>Enter as admin</button>}</div>}</section> : <>
      <div className="creator-toolbar"><span>{auth.identityLabel}{admin ? " · Admin reviewer" : " · Creator"}</span><button className="action action-lime" onClick={() => { setEditing("new"); setReviewing(null); }}><Plus size={18} />Submit a game</button>{health?.auth.localDemo && auth.demoRole && (health.auth.localDemoAdmin || auth.demoRole === "admin") && <div className="demo-controls"><button onClick={() => auth.setDemoRole(auth.demoRole === "admin" ? "player" : "admin")}>Switch to local {auth.demoRole === "admin" ? "creator" : "admin"}</button></div>}</div>
      {admin && <p className="console-hint"><a href="/admin-tools">Open Arcade operations <ArrowUpRight size={14} /></a> for published cabinets, raids and protocol readiness.</p>}
      {notice && <div className="success-note" role="status"><BadgeCheck size={19} />{notice}</div>}
      {error && <div className="creator-error" role="alert"><strong>{error}</strong>{details.length > 0 && <ul>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}</div>}
      <div className="console-grid creator-grid"><section className="console-panel"><div className="console-panel-heading"><div><span className="section-kicker">YOUR CABINETS</span><h2>Submissions</h2></div><span>{owned.length}</span></div>{!owned.length ? <p className="console-hint">Your first cabinet starts with a playable Cartridge build. Submit it here when it is ready for review.</p> : <div className="admin-game-list">{owned.map((game) => <article className="admin-game creator-game" key={game.manifest.id}><div><span className={`status-badge ${game.status === "published" ? "status-good" : "status-wait"}`}>{game.status}</span><strong>{game.manifest.name}</strong><small>{game.manifest.id} · v{game.manifest.version}</small>{game.review?.note && <p>{game.review.note}</p>}{game.status === "approved" && <p>Approved and ready for your Deploy action.</p>}</div><div className="admin-game-actions">{game.status === "approved" && <button disabled={busy} onClick={() => void action(`/api/creator/games/${encodeURIComponent(game.manifest.id)}/deploy`, undefined, `${game.manifest.name} is published in the arcade.`)}>Deploy <ArrowUpRight size={16} /></button>}{game.status !== "published" && <button disabled={busy} onClick={() => { setEditing(game.manifest.id); setReviewing(null); }}>Revise</button>}{game.status === "published" && <a href={`/games/${encodeURIComponent(game.manifest.id)}`}>Open cabinet <ArrowUpRight size={16} /></a>}</div></article>)}</div>}</section>
        {admin && <section className="console-panel"><div className="console-panel-heading"><div><span className="section-kicker">ADMIN REVIEW CONSOLE</span><h2>Review queue</h2></div><ShieldCheck size={24} /></div>{!reviewQueue.length ? <p className="console-hint">No creator submissions need review.</p> : <div className="admin-game-list">{reviewQueue.map((game) => <article className="admin-game" key={game.manifest.id}><div><span className="status-badge status-wait">{game.status}</span><strong>{game.manifest.name}</strong><small>v{game.manifest.version} · {game.manifest.developer}</small></div><button disabled={busy} onClick={() => { setReviewing(game.manifest.id); setEditing(null); }}>Review</button></article>)}</div>}</section>}
        {editing && (editing === "new" || editedGame) && <SubmissionForm key={editing} game={editedGame} busy={busy} onSubmit={submit} onCancel={() => setEditing(null)} />}
        {admin && reviewedGame && <ReviewPanel key={`${reviewedGame.manifest.id}:${reviewedGame.review?.validation?.reviewedAt ?? "new"}:${reviewedGame.status}`} game={reviewedGame} busy={busy} action={action} />}
      </div>
    </>}
  </main>;
}
