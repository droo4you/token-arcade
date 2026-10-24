import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, BadgeCheck, Code2, Plus, ShieldCheck, Upload, X } from "lucide-react";
import type { GameManifest, GameMode, GameObjective, GameRecord, GamePlayGuide } from "../../../packages/sdk/src/index";
import { api, ApiError, messageFor, type GameResponse, type Health, type PassportResponse } from "./api";
import { useArcadeAuth } from "./auth";
import { TestnetTokenPanel } from "./TestnetTokenPanel";

type Submission = GameRecord & { readiness?: { ready: boolean; blockers: string[] } };
const objectives: GameObjective[] = ["score", "total_score", "distance", "destruction", "completion_time", "stars", "guesses", "coins_solved"];
const modeNames = { free: "Free Play", ranked: "Passport Play", raid: "Community Raid" };
function PlayGuideFields({ guide, modes, change }: { guide: GamePlayGuide; modes: GameMode[]; change: (value: GamePlayGuide) => void }) {
  return <fieldset><legend>How your game plays</legend><p>The arcade mode names stay the same for every game. Describe your challenge inside each mode. If undecided, say what you need help deciding.</p>
    {modes.map(mode => <label key={mode}>{modeNames[mode]} challenge<textarea required maxLength={1000} value={guide[mode] ?? ''} onChange={e => change({ ...guide, [mode]: e.target.value })} placeholder={mode === 'free' ? 'What can players do casually? What progress is saved?' : 'Challenge name, start conditions, duration or finish condition, and attempts.'} /></label>)}
    {modes.some(mode => mode !== 'free') && <><label>Scoring rules<textarea required maxLength={1000} value={guide.scoring ?? ''} onChange={e => change({ ...guide, scoring: e.target.value })} placeholder="What counts? Is higher or lower better? Does the raid combine runs?" /></label><label>Tie-break rules<textarea required maxLength={1000} value={guide.tieBreak ?? ''} onChange={e => change({ ...guide, tieBreak: e.target.value })} placeholder="What decides equal scores? Say if you need help choosing." /></label></>}
  </fieldset>;
}
function PlayGuideSummary({ guide }: { guide?: GamePlayGuide }) {
  if (!guide) return <p>Challenge descriptions have not been supplied yet.</p>;
  return <dl className="creator-review-details">{Object.entries(guide).map(([key, value]) => value && <div key={key}><dt>{modeNames[key as GameMode] ?? (key === 'scoring' ? 'Scoring' : 'Tie-breaks')}</dt><dd>{value}</dd></div>)}</dl>;
}
const checks = [
  ["builds", "Build completes successfully"], ["mounts", "Free Play mounts and can be played"],
  ["destroys", "Leaving the cabinet stops the game, audio and listeners"], ["resultSchema", "Completed runs return the required result fields"],
  ["mobile", "Controls and orientation work on the declared devices"], ["sourceReviewed", "Source and isolated artifact reviewed; no wallet or economy code in the hosted path"],
] as const;

function integrationPrompt(name: string, source: string, guide?: GamePlayGuide) {
  return `Prepare my browser game "${name || 'My game'}" for Token Arcade. Source: ${source || '[my game repository]'}.
Use the Token Arcade browser bridge in packages/sdk/browser/bridge.js from droo4you/token-arcade (ask me for the SDK files if that repository is inaccessible). Register mount, start, pause, resume, restart, audio and destroy handlers. Report one completed result per run, including score and duration. Remove standalone account, wallet and payment flows from the embedded build.
Free Play comes first. Keep the platform mode names Free Play, Passport Play and Community Raid. Preserve this creator brief: ${JSON.stringify(guide ?? {})}. Ask the creator about unresolved format/scoring choices instead of inventing a new mode. For competitive play, use issued rules and a matching deterministic replay verifier or a reviewed server-authoritative judge. Do not invent verification or mark it finished without tests. Power Play is not supported yet.
Return the source changes, build instructions, controls/orientation, scoring rules and test results. Coordinate hosting with the arcade operator: a separate approved origin, with an immutable /game-id/v/1.0.0/ build. The operator configures IDs, validates and approves the cartridge; I publish it afterward.`;
}

function IntakeForm({ game, creatorName, busy, submit, cancel }: { game?: Submission; creatorName: string; busy: boolean; submit: (body: unknown) => Promise<void>; cancel: () => void }) {
  const [name, setName] = useState(game?.manifest.name ?? ''), [description, setDescription] = useState(game?.manifest.description ?? ''), [sourceUrl, setSource] = useState(game?.submission?.sourceUrl ?? '');
  const [developer, setDeveloper] = useState(game?.manifest.developer ?? creatorName), [preparation, setPreparation] = useState<'help' | 'agent'>(game?.submission?.preparation ?? 'help');
  const [requestedModes, setRequestedModes] = useState<GameMode[]>(game?.submission?.requestedModes ?? game?.manifest.supportedModes ?? ['free']), [community, setCommunity] = useState(game?.communityConcept?.name ?? '');
  const [guide, setGuide] = useState<GamePlayGuide>(game?.submission?.playGuide ?? game?.manifest.playGuide ?? { free: '' });
  return <section className="console-panel creator-submission-panel"><h2>Bring your game</h2><p>Share what you made. We’ll prepare and review its arcade version before you publish.</p>
    <form className="console-form" onSubmit={e => { e.preventDefault(); void submit({ name, description, developer, sourceUrl, preparation, playGuide: guide, requestedModes, communityConcept: community.trim() ? { name: community.trim(), type: game?.communityConcept?.type ?? 'concept', verification: 'unverified' } : null }); }}>
      <label>Game name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>What do players do?<textarea required maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Made by<input required maxLength={100} value={developer} onChange={e => setDeveloper(e.target.value)} /></label>
      <label>Repository or source download link<input required type="url" value={sourceUrl} onChange={e => setSource(e.target.value)} placeholder="https://github.com/you/your-game" /><small>Share a repository or a link to your source ZIP. Don’t include passwords or access tokens. Private repository access is arranged with the reviewer.</small></label>
      <fieldset><legend>How would you like to prepare it?</legend><label><input type="radio" checked={preparation === 'help'} onChange={() => setPreparation('help')} /> Help me prepare the cartridge</label><label><input type="radio" checked={preparation === 'agent'} onChange={() => setPreparation('agent')} /> Give me a prompt for my coding agent</label></fieldset>
      {preparation === 'agent' && <label>Copy this into your coding environment<textarea readOnly rows={10} value={integrationPrompt(name, sourceUrl, guide)} onFocus={e => e.target.select()} /></label>}
      <fieldset><legend>Requested arcade modes</legend><p>Free Play is included. Competitive modes require a reviewed verifier.</p>{(["ranked", "raid"] as GameMode[]).map(mode => <label className="creator-check" key={mode}><input type="checkbox" checked={requestedModes.includes(mode)} onChange={e => setRequestedModes(prior => e.target.checked ? [...prior, mode] : prior.filter(item => item !== mode))} />{modeNames[mode]}</label>)}</fieldset>
      <PlayGuideFields guide={guide} modes={requestedModes} change={setGuide} />
      <label>Community name (optional)<input value={community} onChange={e => setCommunity(e.target.value)} placeholder="For example, Skrumpeys" /></label>
      <div className="creator-actions"><button className="action action-lime" disabled={busy}>Send for preparation</button><button type="button" className="action action-light" onClick={cancel}>Cancel</button></div>
    </form></section>;
}

function SubmissionForm({ game, creatorName, busy, onSubmit, onCancel }: { game?: Submission; creatorName: string; busy: boolean; onSubmit: (body: unknown, id?: string) => Promise<void>; onCancel: () => void }) {
  const manifest = game?.manifest;
  const [draft, setDraft] = useState({
    id: manifest?.id ?? "", name: manifest?.name ?? "", description: manifest?.description ?? "", developer: manifest?.developer ?? creatorName,
    version: manifest?.version ?? "1.0.0", adapterId: manifest?.adapterId ?? "", skeletonId: manifest?.skeletonId ?? "", url: manifest?.entry?.url ?? "",
    artwork: manifest?.artwork ?? "", genre: manifest?.presentation?.genre ?? "Arcade game", palette: manifest?.presentation?.palette ?? "cyan", glyph: manifest?.presentation?.glyph ?? "✦",
    touch: manifest?.controls?.touch ?? true, orientation: manifest?.controls?.orientation ?? "any",
    verifierKind: manifest?.verifier?.kind ?? "session_checks", verifierDescription: manifest?.verifier?.description ?? "",
    communityName: game?.communityConcept?.name ?? "", communityType: game?.communityConcept?.type ?? "concept", communityAddress: game?.communityConcept?.address ?? "", communityDescription: game?.communityConcept?.description ?? "",
    economyStatus: game?.economy?.status === "coming_soon" ? "coming_soon" : "pending", economyReason: game?.economy?.reason ?? "Optional economy awaits protocol review.",
  });
  const [modes, setModes] = useState<GameMode[]>(manifest?.supportedModes ?? ["free"]);
  const [guide, setGuide] = useState<GamePlayGuide>(manifest?.playGuide ?? game?.submission?.playGuide ?? { free: '' });
  const [selectedObjectives, setSelectedObjectives] = useState<GameObjective[]>(manifest?.supportedObjectives ?? ["score"]);
  const [fallbackId] = useState(() => 'game-' + (globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)));
  const suggestedId = draft.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/g, '') || fallbackId;
  const [formError, setFormError] = useState("");
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setFormError("");
    let entry: URL;
    try { entry = new URL(draft.url); } catch { setFormError("Paste the full link to your playable game, starting with https://."); return; }
    if (!selectedObjectives.length) { setFormError("Select at least one scoring objective."); return; }
    const buildPath = entry.pathname.match(/^\/([a-z0-9-]+)\/v\/(\d+\.\d+\.\d+)\//);
    const gameId = draft.id.trim() || buildPath?.[1] || suggestedId;
    const adapterId = draft.adapterId.trim() || gameId;
    const nextManifest: GameManifest = {
      id: gameId, name: draft.name.trim(), description: draft.description.trim(), developer: draft.developer.trim(), version: !game && buildPath ? buildPath[2] : draft.version.trim(), adapterId,
      skeletonId: draft.skeletonId.trim() || adapterId, supportedModes: modes, supportedObjectives: selectedObjectives,
      playGuide: guide,
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
    <div className="console-panel-heading"><div><span className="section-kicker">CARTRIDGE CONFIGURATION</span><h2>Configure cartridge</h2></div><button type="button" aria-label="Close submission form" onClick={onCancel}><X size={20} /></button></div>
    <p className="console-hint">Tell us about your game and share its playable build. We review it, then you choose when to publish.</p>
    {game && <p className="console-hint">Saving a revision sends this cabinet back for review. Its game ID and score history stay the same.</p>}
    <form className="console-form" onSubmit={submit}>
      <label>Game name<input required maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="What is your game called?" /></label>
      <label>What do players do?<textarea required maxLength={2000} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="A short description for your game’s arcade page." /></label>
      <label>Made by<input required value={draft.developer} onChange={(e) => set("developer", e.target.value)} /><small>The creator or studio name shown on your cabinet.</small></label>
      <label>Playable build link<input type="url" required value={draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /><small>Paste the playable arcade build supplied by your developer or coding agent. The arcade team must approve its hosting.</small></label>
      <details className="creator-form-details"><summary>Need help preparing your game?</summary><p className="console-hint">Ask your coding agent: “Package my browser game for Token Arcade using its cartridge SDK. It needs start, pause, restart, cleanup and score reporting. Give me the hosted, versioned build link.” The link needs a version folder such as /v/1.0.0/ on an approved game host. A repository link alone cannot be played. File uploads and automatic game packaging are not available yet.</p><a href="/guide/console">See how submission works</a></details>
      <p className="console-hint">Free Play is included. Verified leaderboards and raids can be configured with the arcade team in technical settings.</p>
      <details className="creator-form-details"><summary>Technical settings · for your developer</summary>
      <p className="console-hint">Identifiers are filled in automatically for new games. Existing game settings are preserved. Your developer only needs to change these for a custom integration.</p>
      <div className="form-row"><label>Game ID<input disabled={!!game} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.id} onChange={(e) => set("id", e.target.value)} placeholder={suggestedId} /></label><label>Build version<input value={draft.version} onChange={(e) => set("version", e.target.value)} /><small>Detected from versioned links for new games.</small></label></div>
      <div className="form-row"><label>Gameplay Skeleton ID<input value={draft.skeletonId} onChange={(e) => set("skeletonId", e.target.value)} placeholder="Automatic" /></label><label>Adapter ID<input value={draft.adapterId} onChange={(e) => set("adapterId", e.target.value)} placeholder="Automatic" /></label></div>
      <fieldset><legend>Supported modes</legend><div className="creator-options">{(["free", "ranked", "raid"] as GameMode[]).map((mode) => <label key={mode}><input type="checkbox" checked={modes.includes(mode)} disabled={mode === "free"} onChange={(e) => setModes((prior) => e.target.checked ? [...prior, mode] : prior.filter((item) => item !== mode))} />{mode === "free" ? "Free Play" : mode === "ranked" ? "Passport Play" : "Community Raid"}</label>)}</div></fieldset>
      <fieldset><legend>Scoring objectives</legend><div className="creator-options">{objectives.map((objective) => <label key={objective}><input type="checkbox" checked={selectedObjectives.includes(objective)} onChange={(e) => setSelectedObjectives((prior) => e.target.checked ? [...prior, objective] : prior.filter((item) => item !== objective))} />{objective.replaceAll("_", " ")}</label>)}</div><small>The first selected objective is the Passport Play leaderboard metric: {selectedObjectives[0]?.replaceAll("_", " ") ?? "select one"}.</small></fieldset>
      {modes.some((mode) => mode !== "free") && <><label>Score verification<select value={draft.verifierKind} onChange={(e) => set("verifierKind", e.target.value as typeof draft.verifierKind)}><option value="session_checks">Session and telemetry checks</option><option value="server_authoritative">Server authoritative</option><option value="replay">Deterministic replay</option></select></label><label>Verifier description<textarea required value={draft.verifierDescription} onChange={(e) => set("verifierDescription", e.target.value)} placeholder="How the reviewed server verifier validates this game's result." /><small>Competitive modes require an installed server verifier. Declaring a verifier here does not install one.</small></label></>}
      </details>
      <PlayGuideFields guide={guide} modes={modes} change={setGuide} />
      <details className="creator-form-details"><summary>Artwork, controls and presentation</summary><label>Artwork URL<input type="url" value={draft.artwork} onChange={(e) => set("artwork", e.target.value)} /></label><div className="form-row"><label>Genre<input required value={draft.genre} onChange={(e) => set("genre", e.target.value)} /></label><label>Cabinet mark<input required maxLength={16} value={draft.glyph} onChange={(e) => set("glyph", e.target.value)} /></label></div><div className="form-row"><label>Color<select value={draft.palette} onChange={(e) => set("palette", e.target.value as typeof draft.palette)}>{["cyan", "pink", "violet", "lime", "ink"].map((color) => <option key={color}>{color}</option>)}</select></label><label>Orientation<select value={draft.orientation} onChange={(e) => set("orientation", e.target.value as typeof draft.orientation)}><option value="any">Any</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label></div><label className="creator-check"><input type="checkbox" checked={draft.touch} onChange={(e) => set("touch", e.target.checked)} />Touch controls supported</label></details>
      <details className="creator-form-details"><summary>Community and optional economy</summary><label>Community name<input value={draft.communityName} onChange={(e) => set("communityName", e.target.value)} placeholder="Optional community association" /></label><label>Association type<select value={draft.communityType} onChange={(e) => set("communityType", e.target.value as typeof draft.communityType)}><option value="concept">Concept / pending asset</option><option value="erc20">ERC-20 community</option><option value="erc721">ERC-721 collection</option></select></label><label>Reference address<input value={draft.communityAddress} onChange={(e) => set("communityAddress", e.target.value)} placeholder="Optional; verified separately before economic use" /></label><label>Association notes<textarea value={draft.communityDescription} onChange={(e) => set("communityDescription", e.target.value)} /></label><label>Economy request<select value={draft.economyStatus} onChange={(e) => set("economyStatus", e.target.value)}><option value="pending">Pending protocol review</option><option value="coming_soon">Coming soon</option></select></label><label>Economy notes<textarea required value={draft.economyReason} onChange={(e) => set("economyReason", e.target.value)} /></label><p className="console-hint">A cabinet can publish and remain playable while its economy is pending. An asset reference does not enable ownership checks or move funds.</p></details>
      {formError && <p className="creator-error" role="alert">{formError}</p>}
      <div className="creator-actions"><button className="action action-lime" type="submit" disabled={busy}><Upload size={18} />Save configuration</button><button className="action action-light" type="button" onClick={onCancel}>Cancel</button></div>
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
    {game.submission?.playGuide && <><h3>Creator requested</h3><PlayGuideSummary guide={game.submission.playGuide} /></>}
    <h3>Configured challenge for publication</h3><PlayGuideSummary guide={game.manifest.playGuide} /><p>Confirm the build and verifier implement these descriptions, scoring and tie-breaks. Resolve differences with the creator before approval.</p>
    <dl className="creator-review-details"><div><dt>Version</dt><dd>{game.manifest.version}</dd></div><div><dt>Modes</dt><dd>{game.manifest.supportedModes.map(mode => modeNames[mode]).join(", ")}</dd></div><div><dt>Objectives</dt><dd>{game.manifest.supportedObjectives.join(", ")}</dd></div><div><dt>Community</dt><dd>{game.communityConcept?.name ?? game.community?.name ?? "No association"}</dd></div><div><dt>Economy</dt><dd>{game.economy?.reason ?? "No economy requested"}</dd></div><div><dt>Verifier</dt><dd>{game.manifest.verifier?.description ?? "Free Play only"}</dd></div></dl>
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
  const [tokenReviewGames, setTokenReviewGames] = useState<Submission[]>([]);
  const [admin, setAdmin] = useState(false);
  const [creatorName, setCreatorName] = useState("");
  useEffect(() => { setCreatorName(""); if (!auth.authenticated) return; const controller = new AbortController(); void api<PassportResponse>("/api/me", token.current, { signal: controller.signal }).then(({ passport }) => setCreatorName(passport.displayName ?? "")).catch(() => {}); return () => controller.abort(); }, [auth.authenticated, auth.identityKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [creators, setCreators] = useState<{ playerId: string; displayName: string }[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!auth.authenticated) { setOwned([]); setReviewQueue([]); setAdmin(false); return; }
    const [creator, reviewer] = await Promise.allSettled([
      api<{ games: Submission[] }>("/api/creator/games", token.current),
      api<{ games: Submission[] }>("/api/admin/games", token.current),
    ]);
    if (creator.status === "fulfilled") setOwned(creator.value.games); else setError(messageFor(creator.reason));
    if (reviewer.status === "fulfilled") { setAdmin(true); setReviewQueue(reviewer.value.games.filter((game) => game.creatorId && game.status !== "published")); setTokenReviewGames(reviewer.value.games.filter((game) => game.creatorId)); }
    else { setAdmin(false); setReviewQueue([]); setTokenReviewGames([]); }
  }, [auth.authenticated, auth.identityKey]);
  useEffect(() => { setEditing(null); setReviewing(null); setError(""); setNotice(""); void load(); }, [load]);
  useEffect(() => { if (!auth.authenticated) return; const refresh = () => { void load().catch(() => {}); }; const timer = setInterval(refresh, 15000); window.addEventListener('focus', refresh); return () => { clearInterval(timer); window.removeEventListener('focus', refresh); }; }, [auth.authenticated, load]);
  useEffect(() => { if (!admin) return; void api<{ creators: { playerId: string; displayName: string }[] }>("/api/admin/creators", token.current).then(r => setCreators(r.creators)).catch(() => {}); }, [admin]);
  const handleError = (reason: unknown) => { setError(messageFor(reason)); setDetails(reason instanceof ApiError ? reason.details : []); };
  const action = async (path: string, body?: unknown, message?: string) => {
    setBusy(true); setError(""); setDetails([]); setNotice("");
    try { await api<GameResponse>(path, token.current, { method: "POST", body }); setNotice(message ?? "Updated."); await load(); refresh(); }
    catch (reason) { handleError(reason); }
    finally { setBusy(false); }
  };
  const submit = async (body: unknown, id?: string) => {
    setBusy(true); setError(""); setDetails([]); setNotice("");
    try { await api<GameResponse>(configuring ? `/api/admin/games/${encodeURIComponent(configuring)}` : id ? `/api/creator/games/${encodeURIComponent(id)}` : "/api/creator/games", token.current, { method: id || configuring ? "PATCH" : "POST", body }); setConfiguring(null); setEditing(null); setNotice("Cartridge submitted for admin review."); await load(); refresh(); }
    catch (reason) { handleError(reason); }
    finally { setBusy(false); }
  };
  const intake = async (body: unknown) => {
    setBusy(true); setError(""); try { await api(editing && editing !== "new" ? `/api/creator/submissions/${encodeURIComponent(editing)}` : "/api/creator/submissions", token.current, { method: editing && editing !== "new" ? "PATCH" : "POST", body }); setEditing(null); setNotice("Game received. The arcade team can now configure your cartridge."); await load(); } catch (e) { handleError(e); } finally { setBusy(false); }
  };
  const configuredGame = reviewQueue.find(game => game.manifest.id === configuring);
  const editedGame = owned.find((game) => game.manifest.id === editing);
  const reviewedGame = reviewQueue.find((game) => game.manifest.id === reviewing);
  return <main className="page-width launch-page creator-portal">
    <div className="page-intro"><div className="intro-icon"><Code2 size={30} /></div><span className="section-kicker">CREATOR / ARCADE PORTAL</span><h1>Give your game a cabinet.</h1><p>Share your game, prepare its cartridge, then publish when it’s approved.</p></div>
    <ol className="creator-lifecycle" aria-label="Publication steps"><li>Submit source</li><li>Configure & review</li><li>Creator deploys</li><li>Published</li></ol>
    {!auth.authenticated ? <section className="console-panel creator-signin"><h2>Your creator account</h2><p>Sign in to submit a game and track its publication.</p>{auth.configured ? <button className="action action-lime" onClick={auth.login}>Sign in</button> : <p>Player accounts will open when sign-in is configured.</p>}{health?.auth.localDemo && <div className="demo-controls"><strong>Local review demo</strong><button onClick={() => auth.setDemoRole("player")}>Enter as creator</button>{health.auth.localDemoAdmin && <button onClick={() => auth.setDemoRole("admin")}>Enter as admin</button>}</div>}</section> : <>
      <div className="creator-toolbar"><span>{creatorName || auth.identityLabel}{admin ? " · Admin reviewer" : " · Creator"}</span><button className="action action-lime" onClick={() => { setEditing("new"); setConfiguring(null); setReviewing(null); }}><Plus size={18} />Submit a game</button>{health?.auth.localDemo && auth.demoRole && (health.auth.localDemoAdmin || auth.demoRole === "admin") && <div className="demo-controls"><button onClick={() => auth.setDemoRole(auth.demoRole === "admin" ? "player" : "admin")}>Switch to local {auth.demoRole === "admin" ? "creator" : "admin"}</button></div>}</div>
      {admin && <p className="console-hint"><a href="/admin-tools">Open Arcade operations <ArrowUpRight size={14} /></a> for published cabinets, raids and protocol readiness.</p>}
      {notice && <div className="success-note" role="status"><BadgeCheck size={19} />{notice}</div>}
      {error && <div className="creator-error" role="alert"><strong>{error}</strong>{details.length > 0 && <ul>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}</div>}
      {owned.some(game => game.status === 'approved') && <section className="success-note" role="status"><BadgeCheck /><div><strong>Ready to publish</strong>{owned.filter(game => game.status === 'approved').map(game => <p key={game.manifest.id}>{game.manifest.name} is approved. Preview it, then use Deploy below to put it in the arcade.</p>)}</div></section>}
      <div className="console-grid creator-grid"><section className="console-panel"><div className="console-panel-heading"><div><span className="section-kicker">YOUR CABINETS</span><h2>Submissions</h2></div><span>{owned.length}</span></div>{!owned.length ? <p className="console-hint">Have a browser game ready? Share its source to start preparation.</p> : <div className="admin-game-list">{owned.map((game) => <article className="admin-game creator-game" key={game.manifest.id}><div><span className={`status-badge ${game.status === "published" ? "status-good" : "status-wait"}`}>{game.status}</span><strong>{game.manifest.name}</strong><small>{game.submission && !game.submission.configuredAt ? "Waiting for cartridge preparation" : `Build ${game.manifest.version}`}</small>{game.submission && <details><summary>Preparation prompt</summary><textarea readOnly rows={8} value={integrationPrompt(game.manifest.name, game.submission.sourceUrl, game.submission.playGuide)} onFocus={e => e.target.select()} /></details>}{game.review?.note && <p>{game.review.note}</p>}{game.status === "approved" && <><h3>Review before publishing</h3><PlayGuideSummary guide={game.manifest.playGuide} /><p>{game.manifest.verifier?.description ?? "Free Play only; no verified standings."}</p><p>Deploy publishes this reviewed build and challenge. If it differs from your intent, choose Revise first.</p></>}</div><div className="admin-game-actions">{game.status === "approved" && <button disabled={busy} onClick={() => void action(`/api/creator/games/${encodeURIComponent(game.manifest.id)}/deploy`, undefined, `${game.manifest.name} is published in the arcade.`)}>Deploy <ArrowUpRight size={16} /></button>}{game.status !== "published" && <button disabled={busy} onClick={() => { setEditing(game.manifest.id); setReviewing(null); }}>Revise</button>}{game.status === "published" && <a href={`/games/${encodeURIComponent(game.manifest.id)}`}>Open cabinet <ArrowUpRight size={16} /></a>}</div></article>)}</div>}</section>
        {admin && <section className="console-panel"><div className="console-panel-heading"><div><span className="section-kicker">ADMIN REVIEW CONSOLE</span><h2>Review queue</h2></div><ShieldCheck size={24} /></div>{!reviewQueue.length ? <p className="console-hint">No creator submissions need review.</p> : <div className="admin-game-list">{reviewQueue.map((game) => <article className="admin-game" key={game.manifest.id}><div><span className="status-badge status-wait">{game.status}</span><strong>{game.manifest.name}</strong><small>v{game.manifest.version} · {game.manifest.developer}</small></div><div className="admin-game-actions"><button disabled={busy} onClick={() => { setTransferTo(""); setConfiguring(game.manifest.id); setReviewing(null); setEditing(null); }}>Configure cartridge</button><button disabled={busy} onClick={() => { setReviewing(game.manifest.id); setConfiguring(null); setEditing(null); }}>Review</button></div></article>)}</div>}</section>}
        {editing === "new" && <IntakeForm creatorName={creatorName} busy={busy} submit={intake} cancel={() => setEditing(null)} />}
        {editing && editedGame && <IntakeForm key={editing} game={editedGame} creatorName={creatorName} busy={busy} submit={intake} cancel={() => setEditing(null)} />}
        {admin && configuredGame && <><section className="console-panel"><h2>Configure cartridge</h2><p>Connect the prepared build below, then record the validation checks under Review. This step does not automatically modify or execute source code.</p>{configuredGame.submission && <><a href={configuredGame.submission.sourceUrl} target="_blank" rel="noopener noreferrer">Open submitted source</a><p>Requested: {configuredGame.submission.requestedModes.map(mode => modeNames[mode]).join(', ')}. Preparation: {configuredGame.submission.preparation === 'agent' ? 'Creator’s coding agent' : 'Arcade team'}.</p></>}
          <details><summary>Reassign submission owner</summary><p>Use for a submission made from the wrong account. Reassignment clears approval and gives the selected creator the Deploy action after review.</p><select aria-label="New submission owner" value={transferTo} onChange={e => setTransferTo(e.target.value)}><option value="">Choose a creator</option>{creators.map(c => <option key={c.playerId} value={c.playerId}>{c.displayName} · {c.playerId.slice(0,8)}</option>)}</select><button disabled={busy || !transferTo} onClick={() => void action(`/api/admin/games/${encodeURIComponent(configuredGame.manifest.id)}/transfer`, { playerId: transferTo }, 'Submission reassigned; review is required again.')}>Reassign owner</button></details>
          </section><SubmissionForm key={'config:'+configuring} game={configuredGame} creatorName={creatorName} busy={busy} onSubmit={submit} onCancel={() => setConfiguring(null)} /></>}
        {owned.filter((game) => ["approved", "published"].includes(game.status)).map((game) => <TestnetTokenPanel key={`token:${game.manifest.id}:${auth.demoRole}`} game={game} />)}
        {admin && tokenReviewGames.map((game) => <TestnetTokenPanel key={`review-token:${game.manifest.id}:${auth.demoRole}`} game={game} review />)}
        {admin && reviewedGame && <ReviewPanel key={`${reviewedGame.manifest.id}:${reviewedGame.review?.validation?.reviewedAt ?? "new"}:${reviewedGame.status}`} game={reviewedGame} busy={busy} action={action} />}
      </div>
    </>}
  </main>;
}
