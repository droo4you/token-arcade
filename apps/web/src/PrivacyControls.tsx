import { useState } from "react";
import { useArcadeAuth } from "./auth";
import { api, messageFor } from "./api";
export function PrivacyControls() {
  const auth = useArcadeAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  async function exportData() {
    setBusy(true); setMessage("");
    try {
      const data = await api("/api/me/privacy/export", auth.getToken);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "token-arcade-personal-data.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("Your account export is ready. Keep it private.");
    } catch (e) { setMessage(messageFor(e)); } finally { setBusy(false); }
  }
  async function requestDeletion() {
    setBusy(true); setMessage("");
    try {
      const data = await api<{ request: { id: string } }>("/api/me/privacy/deletion-request", auth.getToken, { method: "POST", body: {} });
      setMessage(`Deletion request received: ${data.request.id}. Your account has not been deleted yet. The operator will review provider records and any pending events. Contact droober.business@gmail.com with this reference for updates.`); setConfirm(false);
    } catch (e) { setMessage(messageFor(e)); } finally { setBusy(false); }
  }
  return <main className="privacy-page"><h1>Privacy controls</h1><p><a href="/privacy">Read the privacy notice</a></p><p>For corrections, a minor's data, or requests without signing in, contact <a href="mailto:droober.business@gmail.com">droober.business@gmail.com</a>. Never send private keys or identity documents.</p>
    {auth.authenticated ? <><button disabled={busy} onClick={() => void exportData()}>Download my account data</button><h2>Request account deletion</h2><p>This submits a request for operator review. It does not immediately delete your account, embedded wallet, or public blockchain history. Export or secure your wallet access before requesting deletion.</p><label><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> I want the operator to review deleting my account and associated personal data.</label><p><button disabled={busy || !confirm} onClick={() => void requestDeletion()}>Submit deletion request</button></p></> : <><p>Sign in to verify ownership before exporting data or submitting an account request.</p><button disabled={!auth.configured || !auth.ready} onClick={auth.login}>Sign in</button></>}
    <p role="status">{message}</p>
  </main>;
}
export function PrivacyRequests() {
  const auth = useArcadeAuth();
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<{ id: string; player_id: string; requested_at: string; status: string }[]>([]);
  async function load() { try { setRows((await api<{ requests: typeof rows }>("/api/admin/privacy/requests", auth.getToken)).requests); setMessage("Queue loaded. Process requests using the privacy operations runbook."); } catch (e) { setMessage(messageFor(e)); } }
  return <section className="console-panel"><h2>Privacy requests</h2><p>Check this queue daily. Requests need provider and event review before completion.</p><button onClick={() => void load()}>Load deletion requests</button><p role="status">{message}</p><ul>{rows.map(r => <li key={r.id}><strong>{r.status}</strong> · {r.requested_at}<br />Request: {r.id}<br />Player: {r.player_id}</li>)}</ul></section>;
}
