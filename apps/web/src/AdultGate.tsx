import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { PrivacyPolicy } from "./PrivacyPolicy";
// Neither Privy nor game modules initialize until eligibility is confirmed.
const Arcade = lazy(() => import("./ArcadeRoot"));
export function AdultGate() {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try { localStorage.removeItem("ta:free-play-guest"); } catch { /* Storage may be disabled. */ }
    const controller = new AbortController();
    fetch("/api/privacy/age-session", { signal: controller.signal, cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error();
      const result = await r.json();
      setStatus(["adult", "blocked"].includes(result.status) ? result.status : "unknown");
    }).catch(e => { if (e.name !== "AbortError") { setStatus("unknown"); setError("Could not check eligibility. Please try the form again."); } });
    const expired = () => { setStatus("unknown"); setError("Your age check expired. Please complete it again."); };
    window.addEventListener("ta-age-expired", expired);
    return () => { controller.abort(); window.removeEventListener("ta-age-expired", expired); };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const birthDate = new FormData(form).get("birthDate");
    try {
      const response = await fetch("/api/privacy/age-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ birthDate }) });
      const data = await response.json();
      if (response.ok && data.status === "adult") { form.reset(); setStatus("adult"); }
      else if (data.error?.code === "AGE_RESTRICTED") { form.reset(); setStatus("blocked"); }
      else setError(data.error?.message ?? "Unable to check eligibility. Try again.");
    } catch { setError("Unable to reach the server. Try again."); } finally { setBusy(false); }
  }
  if (window.location.pathname === "/privacy") return <PrivacyPolicy />;
  if (status === "adult") return <Suspense fallback={<main className="privacy-page" role="status">Opening arcade…</main>}><Arcade /></Suspense>;
  return <main className="privacy-page age-screen"><p>TOKEN ARCADE</p><h1>{status === "blocked" ? "This arcade is for adults." : "Before you enter"}</h1>
    {status === "loading" ? <p role="status">Checking access…</p> : status === "blocked" ? <p>You cannot continue. For privacy help or a mistaken entry, contact <a href="mailto:droober.business@gmail.com">droober.business@gmail.com</a>.</p> : <form onSubmit={submit}><label htmlFor="birth-date">Date of birth</label><input id="birth-date" name="birthDate" type="date" required autoComplete="bday" max={new Date().toISOString().slice(0, 10)} /><p>We use this to check eligibility. Your birth date is not saved.</p><button disabled={busy} type="submit">{busy ? "Checking…" : "Continue"}</button></form>}
    {error && <p role="alert">{error}</p>}<p><a href="/privacy">Privacy & data</a></p>
  </main>;
}
