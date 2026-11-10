import { useRef, useState } from "react";
import Icon from "../../components/Icon";
import { useToast } from "../../context/toast";
import { uploadImage } from "../../lib/api";
import { SIDE_LABEL } from "../../lib/format";
import { VIEWS } from "../../lib/teeMockup";
import type { CustomMockups, MockupView, PrintSide } from "../../lib/types";

const DEFAULT_VIEW: Record<PrintSide, MockupView> = {
  front: { area: { x: 0.3, y: 0.24, w: 0.4, h: 0.48 }, cm: { w: 30, h: 40 } },
  back: { area: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 }, cm: { w: 30, h: 40 } },
  left: { area: { x: 0.38, y: 0.38, w: 0.24, h: 0.24 }, cm: { w: 9, h: 9 } },
  right: { area: { x: 0.38, y: 0.38, w: 0.24, h: 0.24 }, cm: { w: 9, h: 9 } },
};

/**
 * Admin: real product photos for the T-shirt designer (per colour and view) and the printable area on them.
 * Views without a photo use the drawn T-shirt.
 */
export default function MockupEditor({ value, colors, onChange }: { value: CustomMockups | null; colors: { name: string; hex: string }[]; onChange(v: CustomMockups): void }) {
  const toast = useToast();
  const m: CustomMockups = value || { photos: {}, views: {} };
  const [color, setColor] = useState(colors[0]?.name || "");
  const [view, setView] = useState<PrintSide>("front");
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<PrintSide>("front");
  const cur = colors.some((c) => c.name === color) ? color : colors[0]?.name || "";

  const photos = m.photos?.[cur] || {};
  const conf = m.views?.[view] || DEFAULT_VIEW[view];
  // Photo used to place the print area: this colour's, or any colour's photo for this view
  const areaPhoto = photos[view] || Object.values(m.photos || {}).map((p) => p[view]).find(Boolean);

  const setPhoto = (v: PrintSide, url: string | null) => {
    const forColor = { ...(m.photos?.[cur] || {}) };
    if (url) forColor[v] = url;
    else delete forColor[v];
    onChange({ ...m, photos: { ...(m.photos || {}), [cur]: forColor }, views: { ...(m.views || {}), [v]: m.views?.[v] || DEFAULT_VIEW[v] } });
  };
  const setConf = (patch: Partial<MockupView>) => onChange({ ...m, views: { ...(m.views || {}), [view]: { ...conf, ...patch } } });

  const upload = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const v = target.current;
    setBusy(v);
    try {
      setPhoto(v, await uploadImage(file));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  if (!colors.length) return <p className="small muted">Add colour variants first.</p>;

  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Optional: upload real photos of this T-shirt (flat, facing the camera, plain background) so customers design on your actual product.
        Use the same framing for every colour. Views without a photo use the drawn T-shirt.
      </p>
      <div className="dz-label">Colour</div>
      <div className="chip-set">
        {colors.map((c) => (
          <button type="button" key={c.name} className={`chip ${cur === c.name ? "on" : ""}`} onClick={() => setColor(c.name)}>
            <i className="swatch-dot" style={{ background: c.hex, display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />{c.name}
            {Object.keys(m.photos?.[c.name] || {}).length > 0 && <b> · {Object.keys(m.photos?.[c.name] || {}).length}</b>}
          </button>
        ))}
      </div>
      <div className="mock-views mt-16">
        {VIEWS.map((v) => (
          <div key={v} className="mock-view">
            <div className="mock-photo">{photos[v] ? <img src={photos[v]} alt={`${cur} ${v}`} /> : <span className="xs muted">No photo</span>}</div>
            <b className="xs">{SIDE_LABEL[v]}</b>
            <div className="row">
              <button type="button" className="btn light sm" disabled={busy !== null} onClick={() => { target.current = v; fileRef.current?.click(); }}>
                {busy === v ? "…" : photos[v] ? "Replace" : "Upload"}
              </button>
              {photos[v] && <button type="button" className="icon-btn" onClick={() => setPhoto(v, null)} aria-label={`Remove ${v} photo`}><Icon name="trash" className="icon sm" /></button>}
            </div>
          </div>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />

      <div className="dz-label mt-16">Print area (same for all colours)</div>
      <div className="chip-set">
        {VIEWS.map((v) => <button type="button" key={v} className={`chip ${view === v ? "on" : ""}`} onClick={() => setView(v)}>{SIDE_LABEL[v]}</button>)}
      </div>
      {areaPhoto ? (
        <>
          <AreaPicker src={areaPhoto} area={conf.area} onChange={(area) => setConf({ area })} />
          <p className="xs muted">Drag the box to the printable part of the {SIDE_LABEL[view].toLowerCase()}; drag the corner to resize.</p>
        </>
      ) : (
        <p className="xs muted">Upload a {SIDE_LABEL[view].toLowerCase()} photo to set its print area.</p>
      )}
      <div className="grid-2">
        <div className="field"><label htmlFor="mk-w">Print width (cm)</label><input id="mk-w" className="input" type="number" min={1} max={200} step={0.5} value={conf.cm.w} onChange={(e) => setConf({ cm: { ...conf.cm, w: Number(e.target.value) || 1 } })} /></div>
        <div className="field"><label htmlFor="mk-h">Print height (cm)</label><input id="mk-h" className="input" type="number" min={1} max={200} step={0.5} value={conf.cm.h} onChange={(e) => setConf({ cm: { ...conf.cm, h: Number(e.target.value) || 1 } })} /></div>
      </div>
    </div>
  );
}

function AreaPicker({ src, area, onChange }: { src: string; area: MockupView["area"]; onChange(a: MockupView["area"]): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const op = useRef<{ mode: "move" | "size"; sx: number; sy: number; a: MockupView["area"] } | null>(null);
  const down = (e: React.PointerEvent, mode: "move" | "size") => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    op.current = { mode, sx: e.clientX, sy: e.clientY, a: area };
  };
  const move = (e: React.PointerEvent) => {
    const o = op.current;
    const r = ref.current?.getBoundingClientRect();
    if (!o || !r) return;
    const dx = (e.clientX - o.sx) / r.width;
    const dy = (e.clientY - o.sy) / r.height;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (o.mode === "move") onChange({ ...o.a, x: clamp(o.a.x + dx, 0, 1 - o.a.w), y: clamp(o.a.y + dy, 0, 1 - o.a.h) });
    else onChange({ ...o.a, w: clamp(o.a.w + dx, 0.05, 1 - o.a.x), h: clamp(o.a.h + dy, 0.05, 1 - o.a.y) });
  };
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return (
    <div ref={ref} className="area-picker" onPointerMove={move} onPointerUp={() => { op.current = null; onChange({ x: r4(area.x), y: r4(area.y), w: r4(area.w), h: r4(area.h) }); }}>
      <img src={src} alt="" draggable={false} />
      <div className="area-box" style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%` }} onPointerDown={(e) => down(e, "move")}>
        <span className="xs">Print area</span>
        <i onPointerDown={(e) => down(e, "size")} />
      </div>
    </div>
  );
}
