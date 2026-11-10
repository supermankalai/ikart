import { useRef } from "react";
import { useToast } from "../../context/toast";
import { type EditorLayer, newId, rerenderText } from "../../lib/designState";
import { money } from "../../lib/format";
import { fitPlacement, isLight } from "../../lib/teeMockup";
import type { RosterRow } from "../../lib/types";
import Icon from "../Icon";
import { useDesigner } from "./context";
import { TextStyleControls } from "./TextPanel";

const MAX_ROWS = 100;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === "," || ch === ";" || ch === "\t") { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

export default function NamesPanel() {
  const { design, active, add, views, setView, roster, setRoster, sizes, colorHex, settings } = useDesigner();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const has = (k: "name" | "number") => Object.values(design).some((ls) => ls.some((l) => l.kind === k));
  const hasName = has("name");
  const hasNumber = has("number");
  const editing = active && (active.kind === "name" || active.kind === "number") ? active : null;

  const addLayer = async (kind: "name" | "number") => {
    const spec = views.back;
    const color = isLight(colorHex) ? "#111111" : "#ffffff";
    const base: EditorLayer = {
      id: newId(), kind, src: "", source: document.createElement("canvas"), natW: 1, natH: 1, p: { x: 0, y: 0, w: 0.5, h: 0.1 },
      font: kind === "name" ? "Oswald" : "Anton", color, effect: kind === "name" ? "arc" : "straight", curve: 25,
      outlineColor: color === "#ffffff" ? "#111111" : "#ffffff", outlineWidth: 0, spacing: kind === "name" ? 8 : 0,
    };
    const r = await rerenderText(base, roster);
    const p = kind === "name" ? fitPlacement(spec, r.natW!, r.natH!, 0.75, 0.04) : fitPlacement(spec, r.natW!, r.natH!, 0.5, 0.26);
    setView("back");
    add({ ...base, ...r, p } as EditorLayer, "back");
    if (!roster.length) setRoster([{ size: sizes[Math.min(2, sizes.length - 1)] || "M", name: "", number: "" }]);
  };

  const update = (i: number, patch: Partial<RosterRow>) => setRoster(roster.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => roster.length < MAX_ROWS && setRoster([...roster, { size: roster[roster.length - 1]?.size || sizes[0] || "M", name: "", number: "" }]);

  const importCsv = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (!rows.length) return toast("This file is empty", "error");
    const head = rows[0].map((h) => h.toLowerCase());
    const hasHead = head.some((h) => ["name", "number", "size", "no", "#"].includes(h));
    const idx = (keys: string[], fallback: number) => {
      const i = head.findIndex((h) => keys.includes(h));
      return hasHead ? i : fallback;
    };
    const iName = idx(["name"], 0), iNum = idx(["number", "no", "#", "num"], 1), iSize = idx(["size"], 2);
    const sizeSet = new Map(sizes.map((s) => [s.toUpperCase(), s]));
    const out: RosterRow[] = [];
    let bad = 0;
    for (const r of rows.slice(hasHead ? 1 : 0)) {
      const size = sizeSet.get((r[iSize] || "").toUpperCase());
      if (!size) { bad++; continue; }
      out.push({ size, name: iName >= 0 ? (r[iName] || "").slice(0, 30) : "", number: iNum >= 0 ? (r[iNum] || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 4) : "" });
    }
    if (!out.length) return toast(`No rows with a valid size (${sizes.join(", ")})`, "error");
    setRoster(out.slice(0, MAX_ROWS));
    toast(`${Math.min(out.length, MAX_ROWS)} rows imported${bad ? `, ${bad} skipped (unknown size)` : ""}`, bad ? "error" : "success");
  };

  const sample = () => {
    const blob = new Blob([`name,number,size\nKALAI,7,${sizes[1] || "M"}\nARUN,10,${sizes[2] || "L"}\n`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "names-numbers-sample.csv";
    a.click();
  };

  const counts = roster.reduce<Record<string, number>>((m, r) => ((m[r.size] = (m[r.size] || 0) + 1), m), {});

  return (
    <div>
      <h3 className="dz-h">Name & number</h3>
      <p className="muted small" style={{ marginTop: 0 }}>For teams, events and families: every T-shirt gets its own name and/or number.</p>
      <div className="row wrap">
        {!hasName && <button className="btn light sm" onClick={() => addLayer("name")}><Icon name="text" className="icon sm" /> Add name <span className="xs muted">+{money(settings.custom_name_price)}</span></button>}
        {!hasNumber && <button className="btn light sm" onClick={() => addLayer("number")}><Icon name="hash" className="icon sm" /> Add number <span className="xs muted">+{money(settings.custom_number_price)}</span></button>}
      </div>

      {editing && <div className="mt-16"><TextStyleControls layer={editing} /></div>}

      {(hasName || hasNumber) && (
        <div className="mt-16">
          <div className="row between">
            <div className="dz-label" style={{ margin: 0 }}>Names list · {roster.length} T-shirt{roster.length === 1 ? "" : "s"}</div>
            <div className="row">
              <button className="btn light sm" onClick={() => fileRef.current?.click()}><Icon name="upload" className="icon sm" /> CSV</button>
              <button className="link xs" onClick={sample}>Sample</button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importCsv(e.target.files?.[0])} />
          <div className="dz-roster">
            <div className="dz-roster-head"><span>Size</span>{hasName && <span>Name</span>}{hasNumber && <span>No.</span>}<span /></div>
            {roster.map((r, i) => (
              <div key={i} className="dz-roster-row">
                <select className="input" value={r.size} onChange={(e) => update(i, { size: e.target.value })} aria-label={`Row ${i + 1} size`}>
                  {sizes.map((s) => <option key={s}>{s}</option>)}
                </select>
                {hasName && <input className="input" value={r.name || ""} maxLength={30} placeholder="Name" aria-label={`Row ${i + 1} name`}
                  onChange={(e) => update(i, { name: e.target.value.toUpperCase() })} />}
                {hasNumber && <input className="input" value={r.number || ""} maxLength={4} placeholder="00" inputMode="numeric" aria-label={`Row ${i + 1} number`}
                  onChange={(e) => update(i, { number: e.target.value.replace(/[^0-9A-Za-z]/g, "") })} />}
                <button className="icon-btn" onClick={() => setRoster(roster.filter((_, k) => k !== i))} aria-label={`Remove row ${i + 1}`}><Icon name="x" className="icon sm" /></button>
              </div>
            ))}
          </div>
          <button className="btn light sm block mt-8" onClick={addRow} disabled={roster.length >= MAX_ROWS}><Icon name="plus" className="icon sm" /> Add T-shirt</button>
          {!!roster.length && <div className="xs muted mt-8">Sizes: {Object.entries(counts).map(([s, n]) => `${s} × ${n}`).join(", ")}</div>}
          <p className="xs muted">The preview shows the first name/number. Each T-shirt is printed with its own.</p>
        </div>
      )}
    </div>
  );
}
