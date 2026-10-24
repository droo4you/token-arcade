/** Free Play picker: Daily is the main mode; Rapid Fire is Passport Play and opens from the cabinet. */
import { useState } from "react";
export default function ModePicker() {
  const [info, setInfo] = useState(false);
  const pill = (active: boolean) => ({ background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--text-muted)" });
  return (
    <div className="mx-auto mt-4 w-full max-w-md" data-testid="mode-picker">
      <div className="flex rounded-full p-1" style={{ background: "var(--bg-surface-2)" }} role="tablist">
        <button role="tab" aria-selected={!info} onClick={() => setInfo(false)} className="flex-1 rounded-full py-1.5 text-sm font-bold" style={pill(!info)}>Free Play <span className="text-[10px] font-semibold opacity-80">DAILY</span></button>
        <button role="tab" aria-selected={info} onClick={() => setInfo(true)} className="flex-1 rounded-full py-1.5 text-sm font-bold" style={pill(info)}>Rapid Fire <span className="text-[10px] font-semibold opacity-80">PASSPORT</span></button>
      </div>
      {info && <p data-testid="rapid-info" className="mt-2 rounded-xl p-3 text-center text-sm" style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}>
        Rapid Fire is a ranked Passport Play mode: as many coins as you can in 3 minutes. Leave this game and pick <b>Passport Play → Start run</b> on the Coindle cabinet. Daily and Free Play stay right here.
      </p>}
    </div>
  );
}
