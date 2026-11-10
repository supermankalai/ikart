import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { STARTER_CLIPART, isVectorArt } from "../../lib/clipart";
import { newId } from "../../lib/designState";
import { rasterizeArt } from "../../lib/imageTools";
import { fitPlacement, isLight } from "../../lib/teeMockup";
import type { Clipart } from "../../lib/types";
import { useDesigner } from "./context";
import { ImageTools } from "./UploadPanel";

let cache: Clipart[] | null = null;

export default function ArtPanel() {
  const { active, add, spec, colorHex } = useDesigner();
  const toast = useToast();
  const [library, setLibrary] = useState<Clipart[]>(cache || []);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (cache) return;
    api<Clipart[]>("/api/custom/clipart").then((l) => { cache = l; setLibrary(l); }).catch(() => {});
  }, []);

  const all = useMemo(() => [...library, ...STARTER_CLIPART], [library]);
  const cats = useMemo(() => ["All", ...new Set(all.map((a) => a.category))], [all]);
  const shown = all.filter((a) => (cat === "All" || a.category === cat) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  const editing = active && active.kind === "art" ? active : null;

  const pick = async (a: Clipart) => {
    setBusy(a.id);
    try {
      const vector = isVectorArt(a.url);
      const color = vector ? (isLight(colorHex) ? "#111111" : "#ffffff") : null;
      const c = await rasterizeArt(a.url, color);
      add({
        id: newId(), kind: "art", src: c.toDataURL(), source: c, natW: c.width, natH: c.height, artUrl: a.url, name: a.name,
        single: color ? { color, threshold: 60 } : null, p: fitPlacement(spec, c.width, c.height, 0.45),
      });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h3 className="dz-h">Art</h3>
      <input className="input" placeholder="Search art…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search art" />
      <div className="chip-set mt-8">
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="dz-art mt-8">
        {shown.map((a) => (
          <button key={a.id} onClick={() => pick(a)} disabled={busy !== null} title={a.name} aria-label={`Add ${a.name}`}>
            <img src={a.url} alt="" loading="lazy" />
            <span>{busy === a.id ? "Adding…" : a.name}</span>
          </button>
        ))}
        {!shown.length && <p className="muted small">No art found.</p>}
      </div>
      {editing && <div className="mt-16"><ImageTools layer={editing} /></div>}
    </div>
  );
}
