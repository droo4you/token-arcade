import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

export function RaidShare({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(false);
  const url = new URL(`/raids/${encodeURIComponent(id)}`, window.location.origin).href;

  const copy = async () => {
    setBusy(true); setCopied(false); setMessage(""); setManual(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setMessage("Raid link copied. Send it to your players!");
    } catch {
      setManual(true); setMessage("Select and copy the raid link below.");
    } finally { setBusy(false); }
  };

  const share = async () => {
    setBusy(true); setCopied(false); setMessage(""); setManual(false);
    try {
      await navigator.share({ title: name, text: `${name} on Token Arcade`, url });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setManual(true); setMessage("Sharing is unavailable here. Copy the raid link below.");
      }
    } finally { setBusy(false); }
  };

  return <div className="raid-share">
    <div className="raid-share-buttons">
      <button type="button" className="action action-light" disabled={busy} onClick={() => void copy()}>
        {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
        {copied ? "Link copied" : "Copy raid link"}
      </button>
      {typeof navigator.share === "function" && <button type="button" className="action action-light" disabled={busy} onClick={() => void share()}><Share2 size={18} aria-hidden="true" />Share raid</button>}
    </div>
    <p className="raid-share-status" role="status">{message}</p>
    {manual && <label className="raid-share-link">Raid link<input type="url" readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>}
  </div>;
}
