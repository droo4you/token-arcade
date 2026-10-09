import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, ChevronDown, ChevronRight, CircleHelp, Clock3, Gamepad2, LockKeyhole, Menu, Play, Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Ticket, Trophy, UserRound, X } from "lucide-react";
import type { CommunityAsset, GameManifest, GameRecord, GameRunConfig, GameRunResult, Passport, Raid } from "../../../packages/sdk/src/index";
import { CartridgeHost } from "../../../packages/sdk/src/host";
import { api, ApiError, messageFor, type CompleteResponse, type GameResponse, type GamesResponse, type Health, type LeaderboardEntry, type LeaderboardResponse, type PassportResponse, type RaidResponse, type RaidsResponse, type RunResponse } from "./api";
import { useArcadeAuth } from "./auth";
import { createClientCartridge, hasClientCartridge } from "./cartridges";
import { gameHref, getCatalog, getGame, playHref, type ArcadeGame } from "./catalog";
import { getGuideTopic, guideTopics, type GuideTopic, type GuideTopicId } from "./guideContent";

const brandLine = "The Internet Is Fun.";

function useRoute() {
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search);
  useEffect(() => {
    const update = () => setRoute(window.location.pathname + window.location.search);
    window.addEventListener("popstate", update);
    window.addEventListener("arcade:navigate", update);
    return () => { window.removeEventListener("popstate", update); window.removeEventListener("arcade:navigate", update); };
  }, []);
  return route;
}

function navigate(href: string) {
  if (window.location.pathname + window.location.search === href) return;
  window.history.pushState({}, "", href);
  window.dispatchEvent(new Event("arcade:navigate"));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function Link({ href, children, className = "", ariaLabel }: { href: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (href.startsWith("#")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</a>;
}

function ActionLink({ href, children, tone = "lime" }: { href: string; children: ReactNode; tone?: "lime" | "ink" | "light" }) {
  return <Link href={href} className={`action action-${tone}`}>{children}<ArrowUpRight size={18} strokeWidth={2.7} /></Link>;
}

function GuideLink({ topic, children }: { topic: GuideTopicId; children: ReactNode }) {
  return <Link href={`/guide/${topic}`} className="guide-context-link"><CircleHelp size={17} />{children}<ArrowUpRight size={15} /></Link>;
}

function formatDate(value?: string) {
  if (!value) return "To be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "To be announced";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function localDateTime(offsetMs: number) {
  const date = new Date(Date.now() + offsetMs);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function timeLeft(endsAt: string, now: number) {
  const distance = Math.max(0, Date.parse(endsAt) - now);
  if (!Number.isFinite(distance) || distance === 0) return "Ended";
  const days = Math.floor(distance / 86_400_000);
  const hours = Math.floor(distance / 3_600_000) % 24;
  const minutes = Math.floor(distance / 60_000) % 60;
  const seconds = Math.floor(distance / 1000) % 60;
  return days ? `${days}d ${hours}h left` : hours ? `${hours}h ${minutes}m left` : `${minutes}m ${seconds}s left`;
}

function useNow(intervalMs = 10_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function isRaidOpen(raid: Raid, now: number) {
  return raid.status === "open" && Date.parse(raid.startsAt) <= now && now < Date.parse(raid.endsAt);
}

function raidDisplayStatus(raid: Raid, now: number) {
  if (raid.status !== "open") return raid.status;
  if (now < Date.parse(raid.startsAt)) return "upcoming";
  if (now >= Date.parse(raid.endsAt)) return "closed";
  return "open";
}

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not linked";
}

function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "wait" | "pink" }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

function ErrorNote({ error, details }: { error: string; details?: string[] }) {
  return <div className="error-note" role="alert"><CircleHelp size={19} /><div><strong>{error}</strong>{details?.length ? <ul>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}</div></div>;
}

function Header({ health }: { health: Health | null }) {
  const auth = useArcadeAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [useRoute()]);
  return <header className="site-header">
    <div className="header-inner">
      <Link href="/" className="brand" ariaLabel="Token Arcade home"><span className="brand-symbol">T<span>✦</span></span><span className="brand-words">TOKEN<br />ARCADE</span></Link>
      <nav className={`primary-nav ${menuOpen ? "nav-open" : ""}`} aria-label="Main navigation">
        <Link href="/" className="nav-link">Arcade</Link>
        <Link href="/raids" className="nav-link">Community raids</Link>
        <Link href="/passport" className="nav-link">Passport</Link>
        <Link href="/guide" className="nav-link">Take a tour</Link>
        <Link href="/launch" className="nav-link nav-launch">Launch Console</Link>
      </nav>
      <div className="header-actions">
        {auth.authenticated ? <Link href="/passport" className="passport-chip"><UserRound size={17} /><span>{auth.identityLabel}</span></Link> : <button className="passport-chip" onClick={() => navigate("/passport")}><UserRound size={17} /><span>Guest</span></button>}
        {health?.auth.localDemo && <span className="dev-dot" title="Local demo identity is enabled">demo</span>}
        <button className="menu-button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
    </div>
  </header>;
}

function Footer() {
  return <footer className="site-footer"><div className="footer-inner"><div className="footer-stamp">T<span>✦</span></div><p>Token Arcade <span>v0 / Metropolis</span><br /><strong>{brandLine}</strong></p><div className="footer-links"><Link href="/">Games</Link><Link href="/raids">Raids</Link><Link href="/passport">Passport</Link><Link href="/guide">Tour</Link></div><span className="footer-small">Built for play. Made for Monad.</span></div></footer>;
}

function GameArt({ game, size = "card" }: { game: ArcadeGame; size?: "card" | "hero" | "detail" }) {
  return <div className={`game-art game-art-${game.palette} game-art-${size}`} aria-hidden="true">
    <span className="game-art-orbit orbit-one" /><span className="game-art-orbit orbit-two" />
    <span className="game-art-glyph">{game.glyph}</span>
    <span className="game-art-shadow" />
    <span className="art-corner">TA / {game.number}</span>
  </div>;
}

function GameTile({ game, variant = "normal" }: { game: ArcadeGame; variant?: "normal" | "wide" | "tall" }) {
  return <article className={`game-tile game-tile-${variant}`}>
    <Link href={gameHref(game.id)} className="tile-art-link" ariaLabel={`Open ${game.name}`}><GameArt game={game} /></Link>
    <div className="tile-body">
      <div className="tile-meta"><span>{game.genre}</span>{game.fixture ? <StatusBadge tone="good">Test fixture</StatusBadge> : game.playable ? <StatusBadge tone="good">Playable now</StatusBadge> : <StatusBadge tone="wait">Adapter pending</StatusBadge>}</div>
      <h3><Link href={gameHref(game.id)}>{game.name}</Link></h3>
      <p>{game.description}</p>
      <div className="tile-bottom"><span>{game.community}</span><Link href={gameHref(game.id)} ariaLabel={`See ${game.name}`} className="round-arrow"><ArrowUpRight size={19} /></Link></div>
    </div>
  </article>;
}

function Home({ records, raids, loading, health }: { records: GameRecord[]; raids: Raid[]; loading: boolean; health: Health | null }) {
  const catalog = getCatalog(records);
  const fixture = catalog.find((game) => game.fixture);
  const externals = catalog.filter((game) => !game.fixture);
  const featured = externals.find((game) => game.playable) ?? fixture;
  const liveExternalCount = externals.filter((game) => game.playable).length;
  const now = useNow();
  const openRaid = raids.find((raid) => isRaidOpen(raid, now));
  return <>
    <section className="hero-wrap page-width">
      <div className="hero-ticket">
        <div className="ticket-left">
          <div className="ticket-micro">{featured && <span className="live-dot" />} {featured ? "THE ARCADE IS OPEN" : "CABINETS ARE WARMING UP"} <span>—</span> ADMIT ONE</div>
          <h1>The Internet<br />Is <span>Fun.</span></h1>
          <p>A little corner of the internet made for playing. Walk in, pick a cabinet, and stay as long as you like.</p>
          <div className="hero-actions">{featured && <ActionLink href={playHref(featured.id)}>Play {featured.fixture ? "the warmup" : featured.name}</ActionLink>}<Link href="#games" className="text-link" ariaLabel="Browse games" >Browse games <ArrowRight size={18} /></Link></div>
          <div className="hero-note"><Ticket size={19} /><span>{featured ? "No account needed for Free Play." : "New games are on their way."}</span><Link href="/guide/arcade" className="hero-tour-link">New here? Take the tour <ArrowUpRight size={15} /></Link></div>
        </div>
        <div className="ticket-right"><div className="ticket-stage">
          <div className="stage-top"><span>{featured ? "NOW PLAYING" : "OPENING SOON"}</span><span className="stage-stars">✦ ✦ ✦</span></div>
          <div className="stage-screen"><span className="stage-small">{featured?.fixture ? "INTERNAL TEST CARTRIDGE" : featured ? "ARCADE CARTRIDGE" : "THE GAME SHELF"}</span><div className="stage-symbols"><span>●</span><span>◆</span><span>▲</span><span>✳</span></div><strong>{featured?.name ?? "Games are on their way"}</strong><span className="stage-sub">{featured?.fixture ? "12 symbols. 20 seconds. One quick run." : featured?.description ?? "The next cabinet will light up here."}</span></div>
          {featured ? <Link href={playHref(featured.id)} className="stage-play"><Play size={18} fill="currentColor" /> Play Free <ArrowUpRight size={19} /></Link> : <span className="stage-play">Check back soon <Sparkles size={19} /></span>}
        </div></div>
        <div className="ticket-stub"><span>TA<br />001</span><div className="stub-holes">············</div><span>GOOD FOR<br />A GOOD TIME</span></div>
      </div>
    </section>

    <main>
      <section id="games" className="shelf-section page-width">
        <div className="section-heading"><div><span className="section-kicker">THE GAME SHELF</span><h2>Pick your next obsession.</h2><p>{liveExternalCount ? `${liveExternalCount} game${liveExternalCount === 1 ? " is" : "s are"} ready to play, with more cabinets on the way.` : "Four launch titles are on their way from their own workshops. Their adapters will bring them into the arcade."}</p></div><span className="handdrawn-arrow" aria-hidden="true">↘</span></div>
        <div className="game-shelf">{externals.map((game, index) => <GameTile key={game.id} game={game} variant={index % 3 === 0 ? "wide" : "normal"} />)}</div>
      </section>

      <section className="lower-grid page-width">
        <div className="warmup-panel"><div className="panel-top"><span className="panel-icon"><Gamepad2 size={24} /></span><StatusBadge tone={featured ? "good" : "wait"}>{featured ? "Playable now" : "Opening soon"}</StatusBadge></div><div className="warmup-panel-art"><span>●</span><span>◆</span><span>▲</span><span>✳</span></div><h2>{fixture ? <>A quick game while<br />you wait.</> : featured ? <>A new game to<br />jump into.</> : <>Good games<br />are on their way.</>}</h2><p>{fixture ? "Try the arcade’s internal test cabinet. Guest Free Play works right away. With a player account, you can test verified Ranked Runs and raids." : featured ? `${featured.name} is ready for Free Play. Open its cabinet and start playing.` : "The launch games are being built in their own workshops. Explore the shelf to see what is coming."}</p>{featured ? <ActionLink href={gameHref(featured.id)} tone="ink">Open {featured.name}</ActionLink> : <Link href="#games" className="action action-ink">Explore games <ArrowUpRight size={17} /></Link>}{fixture && <small>Clearly labeled test fixture, not a launch title.</small>}</div>
        <div className="raid-panel"><div className="panel-top"><span className="panel-icon panel-icon-pink"><Trophy size={23} /></span><span className="raid-scribble">PLAY TOGETHER ✳</span></div><h2>Community<br />raids live here.</h2>{openRaid ? <><p>{openRaid.name} is open now. See the rules, standings, and attempts in the lobby.</p><div className="raid-feature"><span>OPEN RAID</span><strong>{openRaid.name}</strong><span>Closes {formatDate(openRaid.endsAt)}</span></div><ActionLink href={`/raids/${openRaid.id}`} tone="light">Enter the lobby</ActionLink></> : <><p>Limited-time challenges turn a game into a shared event, with clear rules and a real leaderboard.</p><div className="raid-empty"><span>✦</span><strong>No open raids right now</strong><span>{loading ? "Checking the arcade…" : "Check back for the next event."}</span></div><ActionLink href="/raids" tone="light">See raids</ActionLink></>}</div>
      </section>
      <section className="closing-band"><div className="page-width closing-inner"><span>{featured ? "PLAY FIRST. EVERYTHING ELSE CAN WAIT." : "THE NEXT CABINET IS ALMOST HERE."}</span><strong>{brandLine}</strong><Link href={featured ? playHref(featured.id) : "#games"} className="closing-play">{featured ? "Start playing" : "Browse games"} <ArrowUpRight size={21} /></Link></div></section>
    </main>
    {!health && !loading && <div className="page-width home-api-note"><ErrorNote error="The arcade server is offline. Reload when it is available to see playable cartridges, live standings, and accounts." /></div>}
  </>;
}

function Leaderboard({ entries, objective = "score" }: { entries: LeaderboardEntry[]; objective?: string }) {
  if (!entries.length) return <div className="empty-list"><Trophy size={28} /><strong>No verified runs yet</strong><span>The first accepted result will appear here.</span></div>;
  return <div className="leaderboard"><div className="leaderboard-head"><span>Place</span><span>Player</span><span>{objective.replaceAll("_", " ")}</span></div>{entries.map((entry, index) => <div className="leaderboard-row" key={entry.runId}><span className="leaderboard-rank">{String(index + 1).padStart(2, "0")}</span><span>{entry.displayName}</span><strong>{entry.primaryMetric.toLocaleString()}</strong></div>)}</div>;
}

function GameDetail({ game, raids }: { game: ArcadeGame | undefined; raids: Raid[] }) {
  const auth = useArcadeAuth();
  const now = useNow();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (game?.record?.status !== "published") { setEntries([]); setError(""); return; }
    const controller = new AbortController();
    api<LeaderboardResponse>(`/api/leaderboards/${encodeURIComponent(game.id)}?mode=ranked`, auth.getToken, { signal: controller.signal }).then((data) => setEntries(data.entries)).catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(messageFor(reason)); });
    return () => controller.abort();
  }, [game?.id, game?.record?.status]);
  if (!game) return <NotFound />;
  const openRaid = raids.find((raid) => raid.gameId === game.id && isRaidOpen(raid, now));
  const competitive = game.playable && game.record?.status === "published" && game.record.manifest.supportedModes.includes("ranked");
  return <main className="page-width detail-page">
    <Link href="/" className="back-link"><ArrowLeft size={17} /> Back to arcade</Link>
    <div className="detail-grid">
      <div className="detail-art-frame"><GameArt game={game} size="detail" /><span className="detail-art-caption">TOKEN ARCADE / CABINET {game.number}</span></div>
      <div className="detail-copy">
        <div className="detail-flags"><StatusBadge tone={game.playable ? "good" : "wait"}>{game.fixture ? "Internal test fixture" : game.playable ? "Playable now" : "Adapter pending"}</StatusBadge><span>{game.genre}</span></div>
        <h1>{game.name}</h1><p className="detail-lead">{game.description}</p><GuideLink topic="cabinets">How cabinets work</GuideLink>
        <div className="detail-mode-list">
          <div><span className="mode-icon mode-free"><Play size={20} fill="currentColor" /></span><div><strong>Free Play</strong><small>No account. No limit. Just play.</small></div>{game.playable ? <Link href={playHref(game.id)} className="mini-action">Play Free <ArrowUpRight size={17} /></Link> : <span className="mode-unavailable">Awaiting adapter</span>}</div>
          <div><span className="mode-icon mode-ranked"><Trophy size={21} /></span><div><strong>Ranked Run</strong><small>Verified score and a place on the board.</small></div>{competitive ? <Link href={playHref(game.id, "ranked")} className="mini-action">Start run <ArrowUpRight size={17} /></Link> : <span className="mode-unavailable">Coming with verifier</span>}</div>
          <div><span className="mode-icon mode-raid"><Sparkles size={21} /></span><div><strong>Community Raid</strong><small>Same challenge, shared standings.</small></div>{openRaid ? <Link href={`/raids/${encodeURIComponent(openRaid.id)}`} className="mini-action">See raid <ArrowUpRight size={17} /></Link> : <span className="mode-unavailable">No open raid</span>}</div>
        </div>
        {!game.playable && <div className="pending-note"><LockKeyhole size={20} /><span>{game.name} needs a reviewed browser cartridge before play opens here.</span></div>}
      </div>
    </div>
    <div className="detail-below">
      <section className="detail-info"><h2>About this cabinet</h2><p>{game.fixture ? "Warmup Cabinet checks the cartridge host, Free Play, server-issued runs, and score verification. It is a test fixture for this arcade, not one of the four launch games." : game.playable ? "This cartridge is installed and ready for browser play. Competitive modes appear when its verifier and rules are published." : "The arcade is reserving this cabinet for its incoming game. Game play and competitive modes will open after the actual game is imported and verified."}</p><div className="info-pairs"><div><span>Made by</span><strong>{game.record?.manifest.developer ?? (game.fixture ? "Token Arcade" : "External game team")}</strong></div><div><span>Community</span><strong>{game.community}</strong></div><div><span>Version</span><strong>{game.record?.manifest.version ?? "Awaiting import"}</strong></div></div>{game.record?.community && <details className="financial-details"><summary>Community asset <ChevronDown size={16} /></summary><p>{game.record.community.name} ({game.record.community.type.toUpperCase()})</p><code>{game.record.community.address}</code></details>}</section>
      <section className="detail-board"><div className="board-heading"><div><h2>Ranked board</h2><p>Only server-verified results appear here.</p></div><Trophy size={26} /></div>{error ? <ErrorNote error={error} /> : <Leaderboard entries={entries} objective={game.record?.manifest.supportedObjectives[0] ?? "score"} />}</section>
    </div>
  </main>;
}

function CartridgeView({ config, adapterId, onComplete }: { config: GameRunConfig; adapterId: string; onComplete: (result: GameRunResult) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const host = useRef<CartridgeHost | null>(null);
  const callback = useRef(onComplete);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  callback.current = onComplete;
  useEffect(() => {
    const cartridgeHost = new CartridgeHost();
    host.current = cartridgeHost;
    if (container.current) {
      const cartridge = createClientCartridge(config.gameId, adapterId);
      if (!cartridge) setError("The reviewed browser cartridge is not installed for this game.");
      else cartridgeHost.mount(cartridge, container.current, config, (result) => callback.current(result)).then(() => cartridgeHost.start()).catch((reason) => setError(messageFor(reason)));
    }
    return () => { cartridgeHost.destroy(); host.current = null; };
  }, [config.runId, adapterId]);
  return <><div className="cartridge-mount" ref={container} />{error && <ErrorNote error={error} />}{config.mode === "free" && <button className="under-game-button" onClick={() => { if (paused) host.current?.resume(); else host.current?.pause(); setPaused(!paused); }}>{paused ? "Resume game" : "Pause game"}</button>}</>;
}

function Player({ game }: { game: ArcadeGame | undefined }) {
  const auth = useArcadeAuth();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") === "ranked" ? "ranked" : params.get("mode") === "raid" ? "raid" : "free";
  const raidId = params.get("raidId") ?? undefined;
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState<GameRunConfig | null>(null);
  const [result, setResult] = useState<GameRunResult | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const token = useRef(auth.getToken);
  token.current = auth.getToken;
  useEffect(() => {
    if (!game?.playable || (mode !== "free" && !auth.authenticated)) return;
    let active = true;
    setConfig(null); setResult(null); setVerified(false); setError("");
    if (mode === "free") {
      const now = new Date().toISOString();
      setConfig({ runId: crypto.randomUUID(), gameId: game.id, gameVersion: game.record?.manifest.version ?? "1.0.0", mode: "free", objective: game.record?.manifest.supportedObjectives[0] ?? "score", seed: crypto.randomUUID(), startedAt: now });
    } else {
      setLoading(true);
      api<RunResponse>("/api/runs", token.current, { method: "POST", body: { gameId: game.id, mode, raidId } }).then((response) => { if (active) setConfig(response.run); }).catch((reason) => { if (active) setError(messageFor(reason)); }).finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [game?.id, attempt, mode, raidId, auth.authenticated]);
  if (!game) return <NotFound />;
  if (!game.playable) return <main className="page-width centered-state"><LockKeyhole size={42} /><h1>{game.name} is on its way.</h1><p>The browser cartridge has not arrived in this workspace. We’ll open its cabinet after import and review.</p><ActionLink href={gameHref(game.id)}>Back to game details</ActionLink></main>;
  if (mode !== "free" && (game.record?.status !== "published" || !game.record.manifest.supportedModes.includes(mode))) return <main className="page-width centered-state"><LockKeyhole size={42} /><h1>This mode is not available yet.</h1><p>Free Play is ready while this game’s competitive rules are reviewed.</p><ActionLink href={playHref(game.id)}>Play Free</ActionLink></main>;
  if (mode !== "free" && !auth.authenticated) return <main className="page-width centered-state"><UserRound size={42} /><h1>A player account keeps your score.</h1><p>Sign in before a {mode === "raid" ? "Community Raid" : "Ranked Run"}. Free Play is open right now.</p><div className="state-actions"><ActionLink href={playHref(game.id)}>Play Free</ActionLink><ActionLink href="/passport" tone="light">Set up account</ActionLink></div></main>;
  const complete = async (runResult: GameRunResult) => {
    setResult(runResult);
    if (mode === "free" || runResult.result === "failed") return;
    setLoading(true);
    try {
      const response = await api<CompleteResponse>(`/api/runs/${encodeURIComponent(runResult.runId)}/complete`, token.current, { method: "POST", body: runResult });
      setVerified(response.verified);
    } catch (reason) { setError(messageFor(reason)); }
    finally { setLoading(false); }
  };
  return <main className="page-width player-page"><div className="player-top"><Link href={gameHref(game.id)} className="back-link"><ArrowLeft size={17} /> Leave cabinet</Link><div className="player-mode"><span className="live-dot" />{mode === "free" ? "Free Play" : mode === "ranked" ? "Ranked Run" : "Community Raid"}</div></div><div className="player-heading"><div><span className="section-kicker">{game.fixture ? "INTERNAL TEST CARTRIDGE" : "ARCADE CARTRIDGE"}</span><h1>{game.name}</h1><p>{game.fixture ? "Match the big symbol using the four pads. Twelve rounds. Twenty seconds." : game.description}</p></div>{game.fixture && <div className="player-rule"><Clock3 size={21} /><span>12 rounds<br /><strong>20 seconds</strong></span></div>}</div>
    {loading && !result && <div className="loading-slab">Issuing your {mode === "raid" ? "raid attempt" : "run"}…</div>}
    {error && <ErrorNote error={error} />}
    {config && !result && <CartridgeView key={config.runId} config={config} adapterId={game.record?.manifest.adapterId ?? game.id} onComplete={complete} />}
    {result && <div className="result-panel"><div className="result-medal"><Trophy size={31} /></div><div>
      <span>{result.result === "failed" ? "TIME EXPIRED" : mode === "free" ? "LOCAL RESULT" : loading ? "VERIFYING RESULT" : verified ? "VERIFIED RESULT" : "RESULT NOT VERIFIED"}</span>
       <h2>{result.primaryMetric.toLocaleString()}</h2><span className="result-metric">{result.objective.replaceAll("_", " ")}</span>
      <p>{result.result === "failed" ? "The clock ran out. This attempt did not enter the standings." : mode === "free" ? "This score stays in this browser session. Sign in for a verified run on the board." : verified ? "Accepted by the arcade verifier. Your Passport and the standings have been updated." : loading ? "Checking your run against the issued session and input proof…" : "This result was not accepted. See the message above for details."}</p>
    </div><button className="action action-lime" onClick={() => setAttempt((value) => value + 1)}><RotateCcw size={18} /> {mode === "free" ? "Play again" : "New attempt"}</button></div>}
    <div className="player-foot"><ShieldCheck size={21} /><p>{mode === "free" ? "Free Play never needs a wallet or account. Local scores are for fun." : "Competitive results use a server-issued seed and are checked before they reach the leaderboard."}</p></div>
  </main>;
}

function RaidIndex({ raids }: { raids: Raid[] }) {
  const now = useNow();
  return <main className="page-width list-page"><div className="page-intro"><div className="intro-icon"><Trophy size={30} /></div><span className="section-kicker">PLAY TOGETHER</span><h1>Community raids</h1><p>Limited-time challenges with a shared set of rules, attempts, and standings.</p><GuideLink topic="raids">How raids work</GuideLink></div>{raids.length ? <div className="raid-list">{raids.map((raid) => {
    const label = raidDisplayStatus(raid, now);
    return <Link href={`/raids/${encodeURIComponent(raid.id)}`} className="raid-list-item" key={raid.id}><span className="raid-list-mark">✳</span><span><StatusBadge tone={label === "open" ? "good" : "wait"}>{label}</StatusBadge><strong>{raid.name}</strong><small>{raid.maxAttempts} attempts · Ends {formatDate(raid.endsAt)}</small></span><ArrowUpRight size={24} /></Link>;
  })}</div> : <div className="empty-page"><span className="big-doodle">✳</span><h2>No raids on the board yet.</h2><p>When a community opens a challenge, its rules and leaderboard will appear here.</p><ActionLink href="/">Explore games</ActionLink></div>}</main>;
}

function RaidDetail({ id, records }: { id: string; records: GameRecord[] }) {
  const auth = useArcadeAuth();
  const [data, setData] = useState<RaidResponse | null>(null);
  const [error, setError] = useState("");
  const now = useNow(1000);
  useEffect(() => {
    const controller = new AbortController();
    api<RaidResponse>(`/api/raids/${encodeURIComponent(id)}`, auth.getToken, { signal: controller.signal })
      .then(setData)
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(messageFor(reason)); });
    return () => controller.abort();
  }, [id, auth.authenticated, auth.demoRole]);
  if (error) return <main className="page-width list-page"><Link href="/raids" className="back-link"><ArrowLeft size={17} /> All raids</Link><ErrorNote error={error} /></main>;
  if (!data) return <main className="page-width list-page"><div className="loading-slab">Opening raid lobby…</div></main>;
  const { raid, leaderboard } = data;
  const game = getGame(raid.gameId, records);
  const running = now >= Date.parse(raid.startsAt) && now < Date.parse(raid.endsAt);
  const attemptsLeft = data.attemptsRemaining;
  const playable = isRaidOpen(raid, now) && game?.playable && game.record?.status === "published" && game.record.manifest.supportedModes.includes("raid") && (attemptsLeft === undefined || attemptsLeft > 0);
  const reward = raid.reward as Raid["reward"] & { type: string; asset?: string; tokenId?: string; amount?: string };
  const prizeLabel = !reward || reward.type === "none" ? "No prize · test raid" : reward.type === "erc721" ? "NFT prize" : `${reward.type.toUpperCase()} prize`;
  const entryLabel = raid.entry ? `${raid.entry.amount} ${raid.entry.asset}` : "Free entry";
  const countdown = now < Date.parse(raid.startsAt) ? `Opens in ${timeLeft(raid.startsAt, now).replace(" left", "")}` : timeLeft(raid.endsAt, now);
  let unavailable = "The game adapter is not ready for play.";
  if (raid.status !== "open" || !running) unavailable = "This raid is not open for attempts.";
  else if (attemptsLeft === 0) unavailable = "You have used all your attempts.";
  return <main className="page-width raid-page">
    <Link href="/raids" className="back-link"><ArrowLeft size={17} /> All raids</Link>
    <GuideLink topic="raids">How raids work</GuideLink>
    <div className="raid-hero">
      <div><StatusBadge tone={isRaidOpen(raid, now) ? "good" : "wait"}>Raid {raidDisplayStatus(raid, now)}</StatusBadge><h1>{raid.name}</h1><p>Same course. Same rules. Put your best run on the board.</p>
        <div className="raid-quickfacts"><div><Clock3 size={19} /><span>{countdown}</span></div><div><Ticket size={19} /><span>{entryLabel}</span></div><div><Trophy size={19} /><span>{prizeLabel}</span></div></div>
        <div className="raid-hero-actions">{playable ? <ActionLink href={playHref(raid.gameId, "raid", raid.id)}>Start raid attempt</ActionLink> : <span className="raid-unavailable">{unavailable}</span>}</div>
      </div><div className="raid-hero-glyph">✳</div>
    </div>
    <div className="raid-content">
      <section className="rules-panel"><h2>The rules</h2>
        <div className="rule-row"><span>Game</span><strong>{game?.name ?? raid.gameId}</strong></div>
        <div className="rule-row"><span>Objective</span><strong>{raid.objective.replaceAll("_", " ")}</strong></div>
        <div className="rule-row"><span>Attempts</span><strong>{attemptsLeft !== undefined ? `${attemptsLeft} remaining of ${raid.maxAttempts}` : `${raid.maxAttempts} per player`}</strong></div>
        <div className="rule-row"><span>Opens</span><strong>{formatDate(raid.startsAt)}</strong></div>
        <div className="rule-row"><span>Closes</span><strong>{formatDate(raid.endsAt)}</strong></div>
        <div className="rule-row"><span>Community</span><strong>{raid.communityId}</strong></div>
        <div className="rule-row"><span>Entry</span><strong>{entryLabel}</strong></div>
        <div className="rule-row"><span>Prize</span><strong>{prizeLabel}</strong></div>
        <details className="financial-details"><summary>Contract and fee details <ChevronDown size={16} /></summary>
          {reward?.type !== "none" && reward?.asset && <div className="rule-row"><span>Prize asset</span><strong>{reward.asset}{reward.tokenId ? ` #${reward.tokenId}` : ""}{reward.amount ? ` · ${reward.amount}` : ""}</strong></div>}
          <div className="rule-row"><span>Fee routing</span><strong>{raid.entry ? `${raid.feeSplitBps.prize / 100}% prize / ${raid.feeSplitBps.community / 100}% community / ${raid.feeSplitBps.treasury / 100}% treasury` : "No entry fee / no fee routing"}</strong></div>
        </details>
      </section>
      <section className="raid-board"><div className="board-heading"><div><h2>Raid standings</h2><p>Verified attempts only.</p></div><Trophy size={26} /></div><Leaderboard entries={leaderboard} objective={raid.objective} /></section>
    </div>
  </main>;
}

function AccountPrompt({ health }: { health: Health | null }) {
  const auth = useArcadeAuth();
  return <div className="account-prompt"><div className="prompt-art"><span>✦</span></div><div><h2>Your arcade identity starts here.</h2><p>A Player Passport keeps verified scores and raid history together. You can browse the arcade without one.</p><div className="prompt-actions">{auth.configured ? <button className="action action-lime" onClick={auth.login}>Create player account <ArrowUpRight size={18} /></button> : <div className="setup-note"><Settings2 size={19} /><span>Privy sign-in is not configured. Add <code>VITE_PRIVY_APP_ID</code> and server credentials to enable player accounts.</span></div>}<ActionLink href="/" tone="light">Browse as Guest</ActionLink></div>{health?.auth.localDemo && <div className="demo-controls"><strong>Local developer demo</strong><span>These identities only work with LOCAL_DEMO_MODE on loopback.</span><div><button onClick={() => auth.setDemoRole("player")}>Enter as test player</button><button onClick={() => auth.setDemoRole("admin")}>Enter as test admin</button></div></div>}</div></div>;
}

function PassportPage({ health, records }: { health: Health | null; records: GameRecord[] }) {
  const auth = useArcadeAuth();
  const rankedGame = getCatalog(records).find((game) => game.playable && game.record?.status === "published" && game.record.manifest.supportedModes.includes("ranked"));
  const [passport, setPassport] = useState<Passport | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [error, setError] = useState("");
  const [walletNotice, setWalletNotice] = useState("");
  useEffect(() => {
    if (!auth.authenticated) { setPassport(null); return; }
    const controller = new AbortController();
    api<PassportResponse>("/api/me", auth.getToken, { signal: controller.signal })
      .then((data) => { setPassport(data.passport); setDisplayName(data.passport.displayName); setAvatarUrl(data.passport.avatarUrl ?? ""); })
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(messageFor(reason)); });
    return () => controller.abort();
  }, [auth.authenticated, auth.demoRole]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await api<PassportResponse>("/api/me", auth.getToken, { method: "PATCH", body: { displayName: displayName.trim(), avatarUrl: avatarUrl.trim() } });
      setPassport(response.passport); setEditing(false);
    } catch (reason) { setError(messageFor(reason)); }
    finally { setSaving(false); }
  };
  const linkWallet = async () => {
    setWalletBusy(true); setError(""); setWalletNotice("");
    try {
      const provider = (window as Window & { ethereum?: { request: (request: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!provider) throw new Error("Open this page in a browser with an Ethereum wallet to link an ownership wallet.");
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("The wallet did not return a valid address.");
      const challenge = await api<{ address: string; nonce: string; message: string; expiresAt: string }>("/api/me/ownership/challenge", auth.getToken, { method: "POST", body: { address } });
      const messageHex = `0x${Array.from(new TextEncoder().encode(challenge.message), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      const signature = await provider.request({ method: "personal_sign", params: [messageHex, address] });
      if (typeof signature !== "string") throw new Error("The wallet did not sign the association message.");
      const response = await api<PassportResponse>("/api/me/ownership/confirm", auth.getToken, { method: "POST", body: { address, nonce: challenge.nonce, signature } });
      setPassport(response.passport); setWalletNotice("Ownership wallet linked. No assets moved.");
    } catch (reason) { setError(messageFor(reason)); }
    finally { setWalletBusy(false); }
  };
  const unlinkWallet = async (address: string) => {
    setWalletBusy(true); setError(""); setWalletNotice("");
    try {
      const response = await api<PassportResponse>(`/api/me/ownership/${encodeURIComponent(address)}`, auth.getToken, { method: "DELETE" });
      setPassport(response.passport); setWalletNotice("Ownership wallet unlinked.");
    } catch (reason) { setError(messageFor(reason)); }
    finally { setWalletBusy(false); }
  };
  return <main className="page-width passport-page">
    <div className="page-intro"><div className="intro-icon"><UserRound size={30} /></div><span className="section-kicker">PLAYER PASSPORT</span><h1>Keep the good runs.</h1><p>Your little record of time spent in the arcade.</p><GuideLink topic="passport">How Passport works</GuideLink></div>
    {!auth.authenticated ? <AccountPrompt health={health} /> : <>
      {error && <ErrorNote error={error} />}{walletNotice && <div className="success-note" role="status"><BadgeCheck size={18} />{walletNotice}</div>}
      {!passport ? <div className="loading-slab">Opening your Passport…</div> : <div className="passport-layout">
        <section className="passport-card">
          <div className="passport-card-top"><span>TOKEN ARCADE</span><span>PLAYER PASSPORT / V0</span></div>
          <div className="passport-avatar">{passport.avatarUrl ? <img src={passport.avatarUrl} alt="Player avatar" /> : passport.displayName.slice(0, 1).toUpperCase()}</div>
          <div className="passport-name"><div><span>PLAYER NAME</span><h2>{passport.displayName}</h2></div><button aria-label="Edit player profile" onClick={() => setEditing(!editing)}><Settings2 size={20} /></button></div>
          {editing && <form className="name-form" onSubmit={save}><label htmlFor="display-name">Display name</label><div><input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={32} required /><button disabled={saving} type="submit">{saving ? "Saving…" : "Save"}</button></div><label htmlFor="avatar-url">Avatar image URL</label><input id="avatar-url" type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://…" /></form>}
          <div className="passport-card-bottom"><span>ID {passport.playerId.slice(0, 12)}</span><span>★ ARCADE MEMBER</span></div>
        </section>
        <section className="passport-stats"><div className="stat"><span>Games played</span><strong>{passport.gamesPlayed}</strong></div><div className="stat"><span>Ranked runs</span><strong>{passport.rankedRuns}</strong></div><div className="stat"><span>Raids entered</span><strong>{passport.raidsEntered}</strong></div><div className="stat"><span>Wins</span><strong>{passport.wins}</strong></div></section>
         <section className="passport-history"><h2>Best scores</h2>{Object.entries(passport.bestScores).length ? <div>{Object.entries(passport.bestScores).map(([key, score]) => {
           const separator = key.lastIndexOf(":");
           const gameId = separator < 0 ? key : key.slice(0, separator);
           const objective = separator < 0 ? "score" : key.slice(separator + 1);
           const gameName = records.find((record) => record.manifest.id === gameId)?.manifest.name ?? getGame(gameId, [])?.name ?? gameId;
           return <div className="history-row" key={key}><span>{gameName} · {objective.replaceAll("_", " ")}</span><strong>{score.toLocaleString()}</strong></div>;
         })}</div> : <div className="empty-list"><Gamepad2 size={27} /><strong>No verified scores yet</strong><span>{rankedGame ? "Finish a Ranked Run to add your first one." : "Your verified scores will appear when Ranked Runs open."}</span></div>}{rankedGame && <ActionLink href={playHref(rankedGame.id, "ranked")}>Try a Ranked Run</ActionLink>}</section>
        <section className="passport-wallet"><h2>Wallets & communities</h2><div className="rule-row"><span>Arcade wallet</span><strong>{shortAddress(passport.arcadeWallet)}</strong></div><div className="rule-row"><span>Ownership wallets</span><strong>{passport.ownershipWallets.length}</strong></div>{passport.ownershipWallets.map((address) => <div className="linked-wallet" key={address}><code>{shortAddress(address)}</code><button disabled={walletBusy} onClick={() => void unlinkWallet(address)}>Unlink</button></div>)}<button className="wallet-link-button" disabled={walletBusy} onClick={() => void linkWallet()}>{walletBusy ? "Waiting for wallet…" : "Link ownership wallet"}<ArrowUpRight size={16} /></button><p>Sign a message to associate an external wallet. No asset transfer is requested. Holder eligibility needs a configured Community Asset and Monad RPC.</p><div className="rule-row"><span>Communities</span><strong>{passport.communities.length ? passport.communities.join(", ") : "None yet"}</strong></div><button className="text-button" onClick={() => void auth.logout()}>Sign out</button></section>
      </div>}
    </>}
  </main>;
}

type AdminGame = GameRecord & { readiness?: { ready: boolean; blockers: string[] } };
const objectiveOptions: GameManifest["supportedObjectives"] = ["score", "total_score", "distance", "destruction", "completion_time", "stars", "guesses"];

function GameConfigEditor({ game, health, onSaved, onClose }: { game: AdminGame; health: Health | null; onSaved: () => Promise<void>; onClose: () => void }) {
  const auth = useArcadeAuth();
  const browserAdapterReady = hasClientCartridge(game.manifest.id, game.manifest.adapterId);
  const publicationBlockers = [...(game.readiness?.blockers ?? []), ...(!browserAdapterReady ? ["Reviewed browser cartridge is not installed"] : [])];
  const [manifest, setManifest] = useState<GameManifest>(game.manifest);
  const [strategy, setStrategy] = useState(game.communityStrategy ?? "");
  const [hasCommunity, setHasCommunity] = useState(Boolean(game.community));
  const [community, setCommunity] = useState({
    id: game.community?.id ?? "", name: game.community?.name ?? "", type: game.community?.type ?? "erc721",
    chainId: game.community?.chainId ?? 143, address: game.community?.address ?? "", tokenId: game.community?.type === "erc1155" ? game.community.tokenId ?? "" : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [minicoin, setMinicoin] = useState({ name: `${game.manifest.name} Minicoin`, symbol: "", metadataURI: "", initialSupply: "" });
  const [minicoinAcknowledged, setMinicoinAcknowledged] = useState(false);
  const [reconcileHash, setReconcileHash] = useState("");
  const toggleMode = (mode: GameManifest["supportedModes"][number]) => setManifest((prior) => ({ ...prior, supportedModes: prior.supportedModes.includes(mode) ? prior.supportedModes.filter((item) => item !== mode) : [...prior.supportedModes, mode] }));
  const toggleObjective = (objective: GameManifest["supportedObjectives"][number]) => setManifest((prior) => ({ ...prior, supportedObjectives: prior.supportedObjectives.includes(objective) ? prior.supportedObjectives.filter((item) => item !== objective) : [...prior.supportedObjectives, objective] }));
  const setPrimaryObjective = (objective: GameManifest["supportedObjectives"][number]) => setManifest((prior) => ({ ...prior, supportedObjectives: [objective, ...prior.supportedObjectives.filter((item) => item !== objective)] }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setDetails([]); setNotice("");
    try {
      const asset: CommunityAsset | null = hasCommunity ? {
        id: community.id.trim(), name: community.name.trim(), type: community.type,
        chainId: Number(community.chainId), address: community.address.trim(),
        ...(community.type === "erc1155" && community.tokenId.trim() ? { tokenId: community.tokenId.trim() } : {}),
      } as CommunityAsset : null;
      await api<GameResponse>(`/api/admin/games/${encodeURIComponent(game.manifest.id)}`, auth.getToken, {
        method: "PATCH", body: game.minicoin ? { manifest } : { manifest, community: asset, communityStrategy: hasCommunity ? strategy.trim() : "" },
      });
      setNotice("Draft configuration saved.");
      await onSaved();
    } catch (reason) { setError(messageFor(reason)); if (reason instanceof ApiError) setDetails(reason.details); }
    finally { setSaving(false); }
  };
  const reconcileMinicoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!health?.settlement.minicoin?.reconcileReady) return;
    setSaving(true); setError(""); setDetails([]); setNotice("");
    try {
      const response = await api<{ game: GameRecord; minicoin: NonNullable<GameRecord["minicoin"]> }>(`/api/admin/games/${encodeURIComponent(game.manifest.id)}/minicoin/reconcile`, auth.getToken, {
        method: "POST", body: { transactionHash: reconcileHash.trim() },
      });
      setNotice(`Confirmed and associated ${response.minicoin.symbol} with ${response.game.manifest.name}.`);
      await onSaved();
    } catch (reason) { setError(messageFor(reason)); if (reason instanceof ApiError) setDetails(reason.details); }
    finally { setSaving(false); }
  };
  const deployMinicoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!health?.settlement.minicoin?.ready || !minicoinAcknowledged) return;
    setSaving(true); setError(""); setDetails([]); setNotice("");
    try {
      const response = await api<{ game: GameRecord; minicoin: NonNullable<GameRecord["minicoin"]> }>(`/api/admin/games/${encodeURIComponent(game.manifest.id)}/minicoin`, auth.getToken, {
        method: "POST", body: { name: minicoin.name.trim(), symbol: minicoin.symbol.trim(), metadataURI: minicoin.metadataURI.trim(), initialSupply: minicoin.initialSupply.trim() },
      });
      setNotice(`${response.minicoin.symbol} deployed and associated with ${response.game.manifest.name}. Transaction: ${response.minicoin.deploymentTx}`);
      await onSaved();
    } catch (reason) {
      setError(messageFor(reason));
      if (reason instanceof ApiError) setDetails(reason.details);
      const transactionHash = [messageFor(reason), ...(reason instanceof ApiError ? reason.details : [])].join(" ").match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (transactionHash) setReconcileHash(transactionHash);
    }
    finally { setSaving(false); }
  };
  return <section className="console-panel console-editor" id="game-config-editor">
    <div className="console-panel-heading"><div><span className="section-kicker">CARTRIDGE CONFIGURATION</span><h2>{game.manifest.name}</h2></div><button className="editor-close" type="button" onClick={onClose}>Close <X size={16} /></button></div>
    {publicationBlockers.length ? <div className="readiness-list"><strong>Before publishing</strong><ul>{publicationBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : <div className="success-note"><BadgeCheck size={18} />Ready for publication checks.</div>}
    {error && <ErrorNote error={error} details={details} />}{notice && <div className="success-note" role="status"><BadgeCheck size={18} />{notice}</div>}
    {game.status === "published" ? <p className="console-hint">Pause this game before editing its configuration.</p> : <form className="console-form" onSubmit={save}>
      <div className="form-row"><label>Version<input value={manifest.version} onChange={(event) => setManifest({ ...manifest, version: event.target.value })} required /></label><label>Adapter ID<input value={manifest.adapterId} onChange={(event) => setManifest({ ...manifest, adapterId: event.target.value })} required /></label></div>
      <label>Description<textarea value={manifest.description} onChange={(event) => setManifest({ ...manifest, description: event.target.value })} required /></label>
      <div className="form-row"><label>Developer<input value={manifest.developer} onChange={(event) => setManifest({ ...manifest, developer: event.target.value })} required /></label><label>Artwork URL<input value={manifest.artwork ?? ""} onChange={(event) => setManifest({ ...manifest, artwork: event.target.value || undefined })} placeholder="/art/game.png" /></label></div>
      <fieldset className="check-field"><legend>Supported modes</legend>{(["free", "ranked", "raid"] as const).map((mode) => <label key={mode}><input type="checkbox" checked={manifest.supportedModes.includes(mode)} onChange={() => toggleMode(mode)} />{mode === "free" ? "Free Play" : mode === "ranked" ? "Ranked Run" : "Community Raid"}</label>)}</fieldset>
      <fieldset className="check-field"><legend>Competitive objectives</legend>{objectiveOptions.map((objective) => <label key={objective}><input type="checkbox" checked={manifest.supportedObjectives.includes(objective)} onChange={() => toggleObjective(objective)} />{objective.replaceAll("_", " ")}</label>)}</fieldset>
      <label>Ranked Run primary objective <span>The first objective in the manifest determines the Ranked Run metric. Raids choose their own objective.</span><select required value={manifest.supportedObjectives[0] ?? ""} onChange={(event) => setPrimaryObjective(event.target.value as GameManifest["supportedObjectives"][number])}><option value="" disabled>Select an objective above</option>{manifest.supportedObjectives.map((objective) => <option key={objective} value={objective}>{objective.replaceAll("_", " ")}</option>)}</select></label>
      <fieldset className="check-field"><legend>Optional systems</legend><label><input type="checkbox" checked={manifest.communityOptional} onChange={(event) => setManifest({ ...manifest, communityOptional: event.target.checked })} />Community Asset optional</label><label><input type="checkbox" checked={manifest.minicoinOptional} onChange={(event) => setManifest({ ...manifest, minicoinOptional: event.target.checked })} />Minicoin optional</label></fieldset>
      {game.minicoin ? <div className="setup-note"><LockKeyhole size={18} /><span>Community Asset and Strategy are locked after this game’s Minicoin is associated.</span></div> : <>
        <fieldset className="check-field"><legend>Community Asset</legend><label><input type="checkbox" checked={hasCommunity} onChange={(event) => setHasCommunity(event.target.checked)} />Associate an asset</label></fieldset>
        {hasCommunity && <><div className="form-row"><label>Community ID<input value={community.id} onChange={(event) => setCommunity({ ...community, id: event.target.value })} required /></label><label>Community name<input value={community.name} onChange={(event) => setCommunity({ ...community, name: event.target.value })} required /></label></div><div className="form-row"><label>Asset type<select value={community.type} onChange={(event) => setCommunity({ ...community, type: event.target.value as CommunityAsset["type"] })}><option value="erc721">ERC-721 collection</option><option value="erc20">ERC-20 token</option><option value="erc1155">ERC-1155 collection</option></select></label><label>Chain ID<input type="number" min="1" value={community.chainId} onChange={(event) => setCommunity({ ...community, chainId: Number(event.target.value) })} required /></label></div><label>Contract address<input value={community.address} onChange={(event) => setCommunity({ ...community, address: event.target.value })} placeholder="0x…" required /></label>{community.type === "erc1155" && <label>Token ID <span>required for ERC-1155 ownership checks</span><input required inputMode="numeric" pattern="[0-9]+" value={community.tokenId} onChange={(event) => setCommunity({ ...community, tokenId: event.target.value })} /></label>}<label>Community Strategy<input value={strategy} onChange={(event) => setStrategy(event.target.value)} placeholder="e.g. NFT holder rewards" /></label></>}
      </>}
      <button type="submit" className="action action-ink" disabled={saving}>{saving ? "Saving…" : "Save configuration"}<ArrowUpRight size={17} /></button>
    </form>}
    <div className="minicoin-config">
      <h3>Experimental Minicoin</h3>
      {game.minicoin ? <p className="minicoin-association">Associated on chain {game.minicoin.chainId}: <strong>{game.minicoin.symbol}</strong> at <code>{game.minicoin.address}</code>. Transaction <code>{game.minicoin.deploymentTx}</code>.</p> : game.manifest.id === "arcade-warmup" ? <p>The internal test cartridge cannot deploy a Minicoin.</p> : <>
        <p>Deploy a game-specific token and associate it with this game through the verified factory. This action sends an irreversible onchain transaction.</p>
        {!health?.settlement.minicoin?.ready && <div className="setup-note"><ShieldCheck size={18} /><span>{health?.settlement.minicoin?.reason ?? "Minicoin deployment is disabled until the onchain configuration and explicit write flag are ready."}</span></div>}
        <form className="console-form" onSubmit={deployMinicoin}>
          <div className="form-row"><label>Token name<input value={minicoin.name} onChange={(event) => setMinicoin({ ...minicoin, name: event.target.value })} maxLength={80} required /></label><label>Symbol<input value={minicoin.symbol} onChange={(event) => setMinicoin({ ...minicoin, symbol: event.target.value })} placeholder="GAME" maxLength={20} required /></label></div>
          <label>Metadata URI<input value={minicoin.metadataURI} onChange={(event) => setMinicoin({ ...minicoin, metadataURI: event.target.value })} placeholder="ipfs://… or https://…" required /></label>
          <label>Initial supply <span>Raw 18-decimal base units; 1 token is 1000000000000000000 units.</span><input inputMode="numeric" pattern="[1-9][0-9]*" value={minicoin.initialSupply} onChange={(event) => setMinicoin({ ...minicoin, initialSupply: event.target.value })} placeholder="1000000000000000000" required /></label>
          <label className="minicoin-ack"><input type="checkbox" checked={minicoinAcknowledged} onChange={(event) => setMinicoinAcknowledged(event.target.checked)} required /> I understand this deploys a token onchain and cannot be undone.</label>
          <button type="submit" className="action action-ink" disabled={saving || !health?.settlement.minicoin?.ready || !minicoinAcknowledged}>{saving ? "Deploying…" : "Deploy and associate"}<ArrowUpRight size={17} /></button>
        </form>
        <div className="minicoin-reconcile">
          <h4>Recover an existing deployment</h4>
          <p>Paste the transaction hash if a deployment was sent but the arcade did not record it. This checks the existing receipt and never sends a new transaction.</p>
          <form className="console-form" onSubmit={reconcileMinicoin}>
            <label>Deployment transaction hash<input value={reconcileHash} onChange={(event) => setReconcileHash(event.target.value)} pattern="0x[a-fA-F0-9]{64}" placeholder="0x…" required /></label>
            <button type="submit" className="action action-light" disabled={saving || !health?.settlement.minicoin?.reconcileReady}>{saving ? "Checking…" : "Check existing transaction"}<ArrowUpRight size={17} /></button>
          </form>
          {!health?.settlement.minicoin?.reconcileReady && <p>Receipt checking needs the configured chain RPC and factory address.</p>}
        </div>
      </>}
    </div>
  </section>;
}

function LaunchConsole({ health, refresh }: { health: Health | null; refresh: () => void }) {
  const auth = useArcadeAuth();
  const [games, setGames] = useState<AdminGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [draft, setDraft] = useState({ id: "", name: "", description: "", developer: "", adapterId: "", artwork: "" });
  const [raidDraft, setRaidDraft] = useState({ name: "", gameId: "", communityId: "", objective: "score", maxAttempts: 3, startsAt: localDateTime(-60_000), endsAt: localDateTime(86_400_000) });
  const raidGames = games.filter((game) => game.status === "published" && game.manifest.supportedModes.includes("raid"));
  const selectedRaidGame = raidGames.find((game) => game.manifest.id === raidDraft.gameId);
  useEffect(() => {
    if (selectedRaidGame || !raidGames.length) return;
    const first = raidGames[0];
    setRaidDraft((prior) => ({ ...prior, gameId: first.manifest.id, objective: first.manifest.supportedObjectives[0] ?? "score", communityId: first.community?.id ?? (first.manifest.id === "arcade-warmup" ? "internal-test" : "") }));
  }, [games]);
  const load = useCallback(async () => {
    if (!auth.authenticated) return;
    try { const response = await api<GamesResponse>("/api/admin/games", auth.getToken); setGames(response.games); setAuthorized(true); setError(""); }
    catch (reason) { setAuthorized(false); setError(messageFor(reason)); }
  }, [auth.authenticated, auth.demoRole]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (selectedGameId) document.getElementById("game-config-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedGameId]);
  const createGame = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(""); setDetails([]); setNotice("");
    const manifest: GameManifest = { id: draft.id.trim(), name: draft.name.trim(), description: draft.description.trim(), developer: draft.developer.trim(), adapterId: draft.adapterId.trim(), artwork: draft.artwork.trim() || undefined, version: "0.1.0", supportedModes: ["free"], supportedObjectives: ["score"], communityOptional: true, minicoinOptional: true };
    try { const response = await api<GameResponse>("/api/admin/games", auth.getToken, { method: "POST", body: { manifest } }); setNotice(`${response.game.manifest.name} registered as a draft.`); setDraft({ id: "", name: "", description: "", developer: "", adapterId: "", artwork: "" }); await load(); refresh(); }
    catch (reason) { setError(messageFor(reason)); if (reason instanceof ApiError) setDetails(reason.details); }
    finally { setLoading(false); }
  };
  const publish = async (id: string) => {
    setLoading(true); setError(""); setDetails([]); setNotice("");
    try { const response = await api<GameResponse>(`/api/admin/games/${encodeURIComponent(id)}/publish`, auth.getToken, { method: "POST" }); setNotice(`${response.game.manifest.name} published to the arcade.`); await load(); refresh(); }
    catch (reason) { setError(messageFor(reason)); if (reason instanceof ApiError) setDetails(reason.details); }
    finally { setLoading(false); }
  };
  const pauseGame = async (id: string) => {
    setLoading(true); setError(""); setDetails([]); setNotice("");
    try { const response = await api<GameResponse>(`/api/admin/games/${encodeURIComponent(id)}`, auth.getToken, { method: "PATCH", body: { status: "paused" } }); setNotice(`${response.game.manifest.name} paused.`); await load(); refresh(); }
    catch (reason) { setError(messageFor(reason)); if (reason instanceof ApiError) setDetails(reason.details); }
    finally { setLoading(false); }
  };
  const createRaid = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(""); setDetails([]); setNotice("");
    try { const response = await api<{ raid: Raid }>("/api/admin/raids", auth.getToken, { method: "POST", body: { name: raidDraft.name.trim(), gameId: raidDraft.gameId, communityId: raidDraft.communityId.trim(), objective: raidDraft.objective, maxAttempts: Number(raidDraft.maxAttempts), startsAt: new Date(raidDraft.startsAt).toISOString(), endsAt: new Date(raidDraft.endsAt).toISOString(), reward: { type: "none" }, feeSplitBps: { prize: 0, community: 0, treasury: 10000 } } }); setNotice(`${response.raid.name} created. Status: ${response.raid.status}.`); refresh(); }
    catch (reason) { setError(messageFor(reason)); if (reason instanceof ApiError) setDetails(reason.details); }
    finally { setLoading(false); }
  };
  const selectedGame = games.find((game) => game.manifest.id === selectedGameId);
  return <main className="page-width launch-page">
    <div className="page-intro"><div className="intro-icon"><Settings2 size={30} /></div><span className="section-kicker">CURATOR ACCESS</span><h1>Launch Console</h1><p>Review a cartridge, configure its game, and publish only when the adapter and verifier pass arcade checks.</p><GuideLink topic="console">How to prepare a launch</GuideLink></div>
    {!auth.authenticated ? <AccountPrompt health={health} /> : !authorized ? <ErrorNote error={error || "Checking your admin access…"} /> : <>
      {notice && <div className="success-note" role="status"><BadgeCheck size={19} />{notice}</div>}
      {error && <ErrorNote error={error} details={details} />}
      <div className="console-grid">
        <section className="console-panel">
          <div className="console-panel-heading"><div><span className="section-kicker">REGISTRY</span><h2>Game drafts</h2></div><span>{games.length} records</span></div>
          <p className="console-hint">A manifest does not make a game playable. Publishing checks the installed adapter and Free Play smoke test. Competitive modes need a verifier.</p>
          <div className="admin-game-list">{games.map((game) => <div className="admin-game" key={game.manifest.id}>
            <div><StatusBadge tone={game.status === "published" ? "good" : "wait"}>{game.status}</StatusBadge><strong>{game.manifest.name}</strong><small>{game.manifest.id} · adapter: {game.manifest.adapterId}</small></div>
             <div className="admin-game-actions"><button disabled={loading} onClick={() => setSelectedGameId(game.manifest.id)}>Configure <Settings2 size={14} /></button>{game.status !== "published" ? <button disabled={loading || game.readiness?.ready === false || !hasClientCartridge(game.manifest.id, game.manifest.adapterId)} title={game.readiness?.ready === false || !hasClientCartridge(game.manifest.id, game.manifest.adapterId) ? "Review the publication blockers in Configure" : undefined} onClick={() => void publish(game.manifest.id)}>{game.readiness?.ready === false || !hasClientCartridge(game.manifest.id, game.manifest.adapterId) ? "Blocked" : "Check & publish"} <ArrowUpRight size={14} /></button> : <button disabled={loading} onClick={() => void pauseGame(game.manifest.id)}>Pause <LockKeyhole size={14} /></button>}</div>
          </div>)}</div>
        </section>
        <section className="console-panel">
          <div className="console-panel-heading"><div><span className="section-kicker">NEW CARTRIDGE</span><h2>Register a draft</h2></div><Plus size={24} /></div>
          <form className="console-form" onSubmit={createGame}>
            <label>Game ID<input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} placeholder="your-game-id" pattern="[a-z0-9-]+" required /></label>
            <label>Game name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Your game" required /></label>
            <label>Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What players will do" required /></label>
            <div className="form-row"><label>Developer<input value={draft.developer} onChange={(e) => setDraft({ ...draft, developer: e.target.value })} placeholder="Studio or creator" required /></label><label>Adapter ID<input value={draft.adapterId} onChange={(e) => setDraft({ ...draft, adapterId: e.target.value })} placeholder="Reviewed adapter key" required /></label></div>
            <label>Artwork URL <span>optional</span><input type="url" value={draft.artwork} onChange={(e) => setDraft({ ...draft, artwork: e.target.value })} placeholder="https://…" /></label>
            <button className="action action-ink" disabled={loading} type="submit">Register draft <ArrowUpRight size={17} /></button>
          </form>
        </section>
         {selectedGame && <GameConfigEditor key={selectedGame.manifest.id} game={selectedGame} health={health} onSaved={async () => { await load(); refresh(); }} onClose={() => setSelectedGameId(null)} />}
        <section className="console-panel console-raid-panel">
           <div className="console-panel-heading"><div><span className="section-kicker">COMMUNITY EVENT</span><h2>Create a raid</h2></div><Trophy size={24} /></div>
           <p className="console-hint">A free, no-prize raid exercises verified gameplay. NFT prizes, entry payments, and fee settlement need configured contracts and custody first.</p>
          <form className="console-form" onSubmit={createRaid}>
            <label>Raid name<input value={raidDraft.name} onChange={(e) => setRaidDraft({ ...raidDraft, name: e.target.value })} placeholder="Weekend warmup" required /></label>
             <div className="form-row"><label>Game<select value={raidDraft.gameId} onChange={(event) => { const next = raidGames.find((game) => game.manifest.id === event.target.value); setRaidDraft({ ...raidDraft, gameId: event.target.value, objective: next?.manifest.supportedObjectives[0] ?? "score", communityId: next?.community?.id ?? (event.target.value === "arcade-warmup" ? "internal-test" : "") }); }} required><option value="" disabled>Select a published game</option>{raidGames.map((game) => <option value={game.manifest.id} key={game.manifest.id}>{game.manifest.name}</option>)}</select></label><label>Community ID<input value={raidDraft.communityId} onChange={(e) => setRaidDraft({ ...raidDraft, communityId: e.target.value })} required /></label></div>
             <label>Objective<select value={raidDraft.objective} onChange={(event) => setRaidDraft({ ...raidDraft, objective: event.target.value })} required>{selectedRaidGame?.manifest.supportedObjectives.map((objective) => <option key={objective} value={objective}>{objective.replaceAll("_", " ")}</option>)}</select></label>
            <div className="form-row"><label>Opens at<input type="datetime-local" value={raidDraft.startsAt} onChange={(e) => setRaidDraft({ ...raidDraft, startsAt: e.target.value })} required /></label><label>Closes at<input type="datetime-local" value={raidDraft.endsAt} onChange={(e) => setRaidDraft({ ...raidDraft, endsAt: e.target.value })} required /></label></div>
            <label>Attempts per player<input type="number" min="1" max="20" value={raidDraft.maxAttempts} onChange={(e) => setRaidDraft({ ...raidDraft, maxAttempts: Number(e.target.value) })} required /></label>
             <button className="action action-lime" disabled={loading || !selectedRaidGame} type="submit">Create raid <ArrowUpRight size={17} /></button>
          </form>
        </section>
        <section className="console-panel console-setup-panel">
          <div className="console-panel-heading"><div><span className="section-kicker">SETUP</span><h2>Onchain readiness</h2></div><ShieldCheck size={24} /></div>
          <div className="setup-state"><span className={`setup-indicator ${health?.settlement.ready ? "is-ready" : ""}`} /><strong>{health?.settlement.ready ? "Settlement configured" : "Settlement needs configuration"}</strong></div>
          <p>{health?.settlement.reason ?? "Monad contracts, treasury address, and funding must be configured for live entry, Minicoin, custody, or settlement."}</p>
          <div className="setup-state"><span className={`setup-indicator ${health?.auth.privy ? "is-ready" : ""}`} /><strong>{health?.auth.privy ? "Privy configured" : "Privy setup required for live accounts"}</strong></div>
           <div className="setup-state"><span className={`setup-indicator ${health?.settlement.minicoin?.ready ? "is-ready" : ""}`} /><strong>{health?.settlement.minicoin?.ready ? "Minicoin deployment configured" : "Minicoin deployment blocked"}</strong></div><p>{health?.settlement.minicoin?.reason ?? "Select a game draft to deploy and associate a Minicoin through the verified factory."}</p>
          <div className="setup-state"><span className="setup-indicator" /><strong>NFT prize custody blocked</strong></div><p>An NFT raid prize needs a configured vault and confirmed deposit before a paid or rewarded raid can open.</p>
        </section>
      </div>
    </>}
  </main>;
}

function NotFound() { return <main className="page-width centered-state"><span className="big-doodle">?</span><h1>That cabinet isn’t here.</h1><p>Head back to the game shelf and pick another one.</p><ActionLink href="/">Back to arcade</ActionLink></main>; }

function GuideHub() {
  return <main className="page-width guide-page">
    <div className="guide-heading">
      <div><span className="section-kicker">THE ARCADE FIELD GUIDE</span><h1>Find your way around.</h1><p>Five short walkthroughs. Pick the part you need and come back anytime.</p></div>
      <span className="guide-heading-stamp" aria-hidden="true">?</span>
    </div>
    <div className="guide-intro-band">
      <div><span className="section-kicker">FIRST VISIT?</span><strong>Start with a quick lap of the arcade.</strong><p>See the shelf, try guest play, and learn what opens later.</p></div>
      <ActionLink href="/guide/arcade" tone="ink">Start the arcade tour</ActionLink>
    </div>
    <div className="guide-card-grid">
      {guideTopics.map((topic, index) => <Link key={topic.id} href={`/guide/${topic.id}`} className={`guide-card guide-card-${topic.theme}`} ariaLabel={`Open ${topic.title} walkthrough`}>
        <span className="guide-card-meta">{String(index + 1).padStart(2, "0")} / {String(guideTopics.length).padStart(2, "0")} <span>{topic.durationLabel}</span></span>
        <span className="section-kicker">{topic.eyebrow}</span>
        <h2>{topic.title}</h2><p>{topic.summary}</p>
        <span className="guide-card-cta">Open walkthrough <ArrowUpRight size={18} /></span>
      </Link>)}
    </div>
    <p className="guide-footnote"><CircleHelp size={18} /> The Warmup Cabinet is an internal test game. The four launch games are still coming from their own workspaces.</p>
  </main>;
}

function GuideChapter({ topic }: { topic: GuideTopic }) {
  const [stepIndex, setStepIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = topic.steps[stepIndex];
  const selectStep = (index: number) => {
    setStepIndex(index);
    window.requestAnimationFrame(() => heading.current?.focus());
  };
  return <main className="page-width guide-page guide-chapter">
    <Link href="/guide" className="back-link"><ArrowLeft size={17} /> All walkthroughs</Link>
    <div className={`guide-chapter-head guide-card-${topic.theme}`}>
      <span className="section-kicker">THE ARCADE FIELD GUIDE / {topic.eyebrow}</span>
      <h1>{topic.title}</h1><p>{topic.summary}</p>
      <div className="guide-chapter-progress" role="progressbar" aria-label={`${topic.title} progress`} aria-valuemin={1} aria-valuemax={topic.steps.length} aria-valuenow={stepIndex + 1} aria-valuetext={`Step ${stepIndex + 1} of ${topic.steps.length}`}>
        {topic.steps.map((item, index) => <span key={item.title} className={`guide-progress-dot ${index === stepIndex ? "is-current" : ""} ${index < stepIndex ? "is-complete" : ""}`} />)}
      </div>
    </div>
    <div className="guide-chapter-body">
      <nav className="guide-step-list" aria-label={`${topic.title} steps`}>
        {topic.steps.map((item, index) => <button key={item.title} className={`guide-step-tab ${index === stepIndex ? "is-current" : ""}`} type="button" onClick={() => selectStep(index)} aria-current={index === stepIndex ? "step" : undefined}>
          <span>{String(index + 1).padStart(2, "0")}</span><span>{item.title}</span>
        </button>)}
      </nav>
      <section className="guide-step-panel" aria-labelledby="guide-step-heading">
        <span className="guide-step-kicker">STEP {String(stepIndex + 1).padStart(2, "0")} / {String(topic.steps.length).padStart(2, "0")}</span>
        <h2 id="guide-step-heading" ref={heading} tabIndex={-1}>{step.title}</h2>
        <p>{step.body}</p>
        {step.tip && <div className="guide-tip"><Sparkles size={19} /><span>{step.tip}</span></div>}
        <div className="guide-step-actions">
          {stepIndex > 0 && <button className="action action-light" type="button" onClick={() => selectStep(stepIndex - 1)}><ArrowLeft size={18} /> Previous</button>}
          {stepIndex < topic.steps.length - 1 ? <button className="action action-ink" type="button" onClick={() => selectStep(stepIndex + 1)}>Next step <ArrowRight size={18} /></button> : <ActionLink href="/guide" tone="ink">Choose another tour</ActionLink>}
          {step.href && <Link href={step.href} className="guide-context-link">{step.actionLabel ?? "Open this area"}<ArrowUpRight size={16} /></Link>}
        </div>
      </section>
    </div>
  </main>;
}

function GuideNotFound() { return <main className="page-width centered-state"><CircleHelp size={42} /><h1>That walkthrough isn’t here.</h1><p>Pick a topic from the arcade field guide.</p><ActionLink href="/guide">See all walkthroughs</ActionLink></main>; }

export function App() {
  const auth = useArcadeAuth();
  const route = useRoute();
  const path = route.split("?")[0];
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [raids, setRaids] = useState<Raid[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const token = useRef(auth.getToken);
  token.current = auth.getToken;
  const refresh = useCallback(() => {
    Promise.allSettled([
      api<Health>("/api/health", token.current),
      api<GamesResponse>("/api/games", token.current),
      api<RaidsResponse>("/api/raids", token.current),
    ]).then(([healthResult, gamesResult, raidsResult]) => {
      if (healthResult.status === "fulfilled") setHealth(healthResult.value);
      if (gamesResult.status === "fulfilled") setRecords(gamesResult.value.games);
      if (raidsResult.status === "fulfilled") setRaids(raidsResult.value.raids);
      setLoading(false);
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  let page: ReactNode;
  if (path === "/") page = <Home records={records} raids={raids} loading={loading} health={health} />;
  else if (path === "/guide") page = <GuideHub />;
  else if (path.startsWith("/guide/")) {
    const topic = getGuideTopic(path.slice(7));
    page = topic ? <GuideChapter key={topic.id} topic={topic} /> : <GuideNotFound />;
  }
  else if (path.startsWith("/games/")) page = <GameDetail key={path} game={getGame(decodeURIComponent(path.slice(7)), records)} raids={raids} />;
  else if (path.startsWith("/play/")) page = <Player key={route} game={getGame(decodeURIComponent(path.slice(6)), records)} />;
  else if (path === "/raids") page = <RaidIndex raids={raids} />;
  else if (path.startsWith("/raids/")) page = <RaidDetail key={path} id={decodeURIComponent(path.slice(7))} records={records} />;
  else if (path === "/passport") page = <PassportPage health={health} records={records} />;
  else if (path === "/launch") page = <LaunchConsole health={health} refresh={refresh} />;
  else page = <NotFound />;
  return <><Header health={health} />{page}<Footer /></>;
}
