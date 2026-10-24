import { useCallback, useEffect, useRef, useState } from "react";
import GuessRow from "./GuessRow";
import Sparkline from "./Sparkline";
import CoinAutocomplete from "./CoinAutocomplete";
import { coinByTicker, rapidApi, RapidApiError, toGuessResult, type RapidState } from "@/lib/rapid";
import type { GuessResult } from "@/lib/types";

type Phase = "intro" | "playing" | "ending" | "done" | "error";
type Reveal = { ticker: string; solved: boolean; key: number };
const HEADERS = ["Type", "Color", "Year", "Ticker", "Price", "FDV"];
const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export default function RapidFire({ runId, raid, onBegin, onComplete }: {
  runId: string; raid: boolean;
  /** Opens the bridge run; returns false if the host refused. */
  onBegin: () => boolean;
  onComplete: (solved: number, guesses: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [state, setState] = useState<RapidState | null>(null);
  const [rows, setRows] = useState<GuessResult[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [remaining, setRemaining] = useState(180_000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const deadline = useRef(0);
  const submitted = useRef(false);

  const end = useCallback(async (early: boolean) => {
    if (submitted.current) return;
    setPhase("ending");
    try {
      // Always read the totals back from the server: the result we submit is the server's ledger.
      const final = early ? await rapidApi.finish(runId) : (await rapidApi.state(runId)).state ?? await rapidApi.finish(runId);
      setState(final); setPhase("done");
      submitted.current = true;
      onComplete(final.solved, final.totalGuesses);
    } catch (error) { setMessage((error as Error).message); setPhase("error"); }
  }, [runId, onComplete]);

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = setInterval(() => {
      const left = deadline.current - performance.now();
      setRemaining(left);
      if (left <= 0) { clearInterval(timer); void end(false); }
    }, 200);
    return () => clearInterval(timer);
  }, [phase, end]);

  const apply = (next: RapidState) => {
    setState(next);
    deadline.current = performance.now() + next.remainingMs; // server-timed; local clock only counts down
    setRemaining(next.remainingMs);
  };
  async function start() {
    if (busy) return;
    if (!onBegin()) { setMessage("The arcade could not open this run. Start a new attempt."); setPhase("error"); return; }
    setBusy(true);
    try { apply(await rapidApi.start(runId)); setPhase("playing"); }
    catch (error) { setMessage((error as Error).message); setPhase("error"); }
    finally { setBusy(false); }
  }
  async function guess(ticker: string) {
    if (busy || phase !== "playing") return;
    setBusy(true); setMessage("");
    try {
      const reply = await rapidApi.guess(runId, ticker);
      apply(reply);
      if (reply.revealed) { setReveal({ ticker: reply.revealed, solved: reply.correct, key: Date.now() }); setRows([]); }
      else setRows((current) => [...current, toGuessResult(reply.feedback)]);
    } catch (error) {
      if (error instanceof RapidApiError && error.code === "WINDOW_CLOSED") void end(false);
      else setMessage((error as Error).message);
    } finally { setBusy(false); }
  }
  async function skip() {
    if (busy || phase !== "playing") return;
    setBusy(true);
    try { const reply = await rapidApi.skip(runId); apply(reply); setReveal({ ticker: reply.revealed, solved: false, key: Date.now() }); setRows([]); }
    catch (error) { if (error instanceof RapidApiError && error.code === "WINDOW_CLOSED") void end(false); else setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!reveal) return; const t = setTimeout(() => setReveal(null), 2200); return () => clearTimeout(t); }, [reveal]);

  const card = { background: "var(--bg-surface)", border: "1px solid var(--border-light)" };
  const label = raid ? "Community Raid · Rapid Fire" : "Passport Play · Rapid Fire";

  if (phase === "intro") return (
    <section data-testid="rapid-intro" className="mx-auto w-full max-w-md rounded-2xl p-6 text-center" style={card}>
      <p className="text-xs font-bold tracking-widest" style={{ color: "var(--accent)" }}>{label.toUpperCase()}</p>
      <h2 className="mt-2 text-3xl font-black">Rapid Fire</h2>
      <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Solve as many coins as you can in <b>3 minutes</b>. Score = coins solved; ties go to fewer total guesses.</p>
      <ul className="mt-4 space-y-1 text-left text-sm" style={{ color: "var(--text-muted)" }}>
        <li>• 6 guesses per coin, then it's revealed and you move on</li>
        <li>• Skip any coin (counts as unsolved)</li>
        <li>• The clock runs on the server and starts when you press Start</li>
        {raid && <li>• Every coin you solve adds to the community total</li>}
      </ul>
      <button data-testid="rapid-start" disabled={busy} onClick={() => void start()} className="mt-6 w-full rounded-xl py-3 text-lg font-bold text-white" style={{ background: "var(--accent)" }}>Start · 3:00</button>
    </section>
  );
  if (phase === "error") return (
    <section className="mx-auto w-full max-w-md rounded-2xl p-6 text-center" style={card}>
      <h2 className="text-xl font-bold">Rapid Fire stopped</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{message}</p>
    </section>
  );
  if (phase === "ending" || phase === "done") return (
    <section data-testid="rapid-end" className="mx-auto w-full max-w-md rounded-2xl p-6 text-center" style={card}>
      <p className="text-xs font-bold tracking-widest" style={{ color: "var(--accent)" }}>TIME!</p>
      <p className="mt-2 text-6xl font-black" data-testid="rapid-final">{state?.solved ?? "…"}</p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>coins solved · {state?.totalGuesses ?? "…"} guesses</p>
      <p className="mt-4 text-sm" style={{ color: "var(--text-dim)" }}>{phase === "ending" ? "Closing the window…" : "Sent to the arcade for verification. Your rank appears below."}</p>
    </section>
  );

  const low = remaining <= 30_000;
  return (
    <section data-testid="rapid-play" className="mx-auto w-full max-w-xl">
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl p-2" style={card}><div className="text-[11px] font-semibold" style={{ color: "var(--text-dim)" }}>TIME</div><div data-testid="rapid-timer" className="text-2xl font-black tabular-nums" style={{ color: low ? "var(--result-red)" : "var(--text)" }}>{clock(remaining)}</div></div>
        <div className="rounded-xl p-2" style={card}><div className="text-[11px] font-semibold" style={{ color: "var(--text-dim)" }}>SOLVED</div><div data-testid="rapid-solved" className="text-2xl font-black" style={{ color: "var(--accent)" }}>{state?.solved ?? 0}</div></div>
        <div className="rounded-xl p-2" style={card}><div className="text-[11px] font-semibold" style={{ color: "var(--text-dim)" }}>GUESSES</div><div className="text-2xl font-black">{state?.totalGuesses ?? 0}</div></div>
      </div>
      {reveal && (() => { const coin = coinByTicker(reveal.ticker); return (
        <div key={reveal.key} data-testid="rapid-reveal" className="mb-3 flex items-center gap-3 rounded-xl p-3" style={{ background: reveal.solved ? "var(--result-green-bg)" : "var(--result-red-bg)", color: reveal.solved ? "var(--result-green)" : "var(--result-red)" }}>
          {coin && <img src={coin.logoUrl} alt="" className="h-8 w-8 rounded-full" />}
          <div className="text-sm font-bold">{reveal.solved ? "Solved!" : "Missed:"} {coin?.name} ({reveal.ticker})</div>
        </div>); })()}
      <div className="mb-2 flex items-center justify-between text-sm" style={{ color: "var(--text-muted)" }}>
        <span>Coin #{state?.puzzle ?? 1}</span>
        <span>Guess {Math.min((state?.guessesThisCoin ?? 0) + 1, state?.maxGuessesPerCoin ?? 6)} of {state?.maxGuessesPerCoin ?? 6}</span>
      </div>
      {state?.priceHint && <div className="mb-3 rounded-xl p-3" style={card}>
        <p className="mb-2 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>90-Day Price Hint</p>
        <Sparkline key={`${runId}:${state.puzzle}`} runId={runId} puzzle={state.puzzle} color="var(--accent)" />
      </div>}
      <CoinAutocomplete onSelect={(ticker) => void guess(ticker)} guessedTickers={rows.map((row) => row.coin.ticker)} disabled={busy} />
      {message && <p className="mt-2 text-sm" style={{ color: "var(--result-red)" }}>{message}</p>}
      {rows.length > 0 && <div className="mt-3"><div>
        <div className="mb-1 grid grid-cols-6 gap-1.5 text-center text-[11px] font-semibold" style={{ color: "var(--text-dim)" }}>{HEADERS.map((h) => <div key={h}>{h}</div>)}</div>
        {rows.map((row, index) => <GuessRow key={row.coin.ticker} guess={row} prices={{}} rowIndex={index} />)}
      </div></div>}
      <div className="mt-4 flex gap-2">
        <button data-testid="rapid-skip" disabled={busy} onClick={() => void skip()} className="flex-1 rounded-xl py-2.5 font-bold" style={{ ...card, color: "var(--text)" }}>Skip coin</button>
        <button data-testid="rapid-finish" disabled={busy} onClick={() => void end(true)} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ color: "var(--text-muted)" }}>End run</button>
      </div>
    </section>
  );
}
