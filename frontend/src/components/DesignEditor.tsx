import { useEffect, useRef, useState } from "react";
import { useToast } from "../context/toast";
import { MAX_TEXT, TEXT_COLORS, TEXT_FONTS, ensureTextFonts, renderText } from "../lib/designText";
import { type EditorDesign, type EditorLayer, SIDES, newId } from "../lib/designState";
import { SIDE_LABEL } from "../lib/format";
import { PRINT, fitPlacement, isLight, loadImage, printDpi, resizePlacement } from "../lib/teeMockup";
import type { Placement, PrintSide } from "../lib/types";
import Icon from "./Icon";
import TeeMockup from "./TeeMockup";

const MAX_MB = 15;
const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * The T-shirt design editor. Returns the mockup ("stage") and the controls ("panel") separately so
 * pages can lay them out side by side. The design itself is owned by the page (design / setDesign).
 */
export function useDesignEditor({
  color,
  design,
  setDesign,
  sidePrices,
}: {
  color: string;
  design: EditorDesign;
  setDesign(fn: (d: EditorDesign) => EditorDesign): void;
  /** Extra charge shown on each side's tab, e.g. { front: 199, back: 199 } */
  sidePrices?: Partial<Record<PrintSide, string>>;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [side, setSide] = useState<PrintSide>("front");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const textTimer = useRef<number>();

  useEffect(() => {
    ensureTextFonts();
  }, []);

  const layers = design[side];
  const active = layers.find((l) => l.id === activeId) || layers[layers.length - 1] || null;
  const image = layers.find((l) => l.kind === "image") || null;
  const text = layers.find((l) => l.kind === "text") || null;

  const updateLayer = (id: string, patch: Partial<EditorLayer>) =>
    setDesign((d) => ({ ...d, [side]: d[side].map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const move = (id: string, p: Placement) => updateLayer(id, { p });
  const remove = (id: string) => {
    setDesign((d) => ({ ...d, [side]: d[side].filter((l) => l.id !== id) }));
    setActiveId(null);
  };

  const chooseFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return toast("Please choose a JPG, PNG or WEBP image", "error");
    if (file.size > MAX_MB * 1024 * 1024) return toast(`Image must be smaller than ${MAX_MB} MB`, "error");
    const src = URL.createObjectURL(file);
    try {
      const img = await loadImage(src);
      const layer: EditorLayer = {
        id: newId(), kind: "image", src, source: img, file, natW: img.naturalWidth, natH: img.naturalHeight,
        p: fitPlacement(side, img.naturalWidth, img.naturalHeight),
      };
      // One image per side: replace the old one; images sit under text
      setDesign((d) => ({ ...d, [side]: [layer, ...d[side].filter((l) => l.kind !== "image")] }));
      setActiveId(layer.id);
    } catch (e) {
      URL.revokeObjectURL(src);
      toast((e as Error).message, "error");
    }
  };

  const addText = async () => {
    const value = "Your text";
    const font = "Anton";
    const c = isLight(color) ? "#111111" : "#ffffff";
    const canvas = await renderText(value, font, c);
    const p = fitPlacement(side, canvas.width, canvas.height, 0.6, image ? 0.68 : 0.12);
    const layer: EditorLayer = { id: newId(), kind: "text", src: canvas.toDataURL(), source: canvas, natW: canvas.width, natH: canvas.height, p, text: value, font, color: c };
    setDesign((d) => ({ ...d, [side]: [...d[side], layer] }));
    setActiveId(layer.id);
  };

  /** Re-render text, keeping its letter size (box height) and centre. */
  const restyleText = (l: EditorLayer, patch: { text?: string; font?: string; color?: string }) => {
    const next = { text: l.text!, font: l.font!, color: l.color!, ...patch };
    updateLayer(l.id, patch);
    window.clearTimeout(textTimer.current);
    textTimer.current = window.setTimeout(async () => {
      if (!next.text.trim()) return;
      const canvas = await renderText(next.text, next.font, next.color);
      const area = PRINT[side];
      setDesign((d) => ({
        ...d,
        [side]: d[side].map((x) => {
          if (x.id !== l.id) return x;
          const hPx = x.p.h * area.h;
          const w = (hPx * (canvas.width / canvas.height)) / area.w;
          const cx = x.p.x + x.p.w / 2;
          return { ...x, ...next, src: canvas.toDataURL(), source: canvas, natW: canvas.width, natH: canvas.height, p: { ...x.p, x: cx - w / 2, w } };
        }),
      }));
    }, 180);
  };

  const dpi = active?.kind === "image" ? printDpi(active.natW, active.p) : 999;

  const stage = (
    <div>
      <div className="side-tabs" role="tablist" aria-label="T-shirt side">
        {SIDES.map((s) => (
          <button key={s} role="tab" aria-selected={side === s} className={side === s ? "on" : ""} onClick={() => { setSide(s); setActiveId(null); }}>
            {SIDE_LABEL[s]}
            {design[s].length > 0 && <span className="dot" aria-label="has design" />}
            {sidePrices?.[s] && <span className="xs muted">{sidePrices[s]}</span>}
          </button>
        ))}
      </div>
      <div className="custom-canvas">
        <TeeMockup
          color={color}
          side={side}
          layers={layers.map((l) => ({ id: l.id, src: l.src, p: l.p }))}
          activeId={active?.id}
          onSelect={setActiveId}
          onMove={move}
        />
      </div>
      {active ? (
        <div className="custom-tools">
          <div className="tool">
            <label htmlFor="c-size">Size</label>
            <input id="c-size" type="range" min={8} max={110} value={Math.round(active.p.w * 100)}
              onChange={(e) => move(active.id, resizePlacement(active.p, Number(e.target.value) / 100))} />
          </div>
          <div className="tool">
            <label htmlFor="c-rot">Rotate {Math.round(active.p.rotation || 0)}°</label>
            <input id="c-rot" type="range" min={-180} max={180} value={Math.round(active.p.rotation || 0)}
              onChange={(e) => move(active.id, { ...active.p, rotation: Number(e.target.value) })} />
          </div>
          <div className="row wrap">
            <button className="btn light sm" onClick={() => move(active.id, { ...active.p, x: (1 - active.p.w) / 2 })}>Centre</button>
            <button className="btn light sm" onClick={() => move(active.id, { ...active.p, rotation: 0 })}>Straighten</button>
            <button className="btn light sm" onClick={() => remove(active.id)}><Icon name="trash" className="icon sm" /> Remove {active.kind}</button>
          </div>
        </div>
      ) : (
        <p className="muted small center mt-8">Add an image or text, then drag it on the T-shirt to place it.</p>
      )}
      {active?.kind === "image" && dpi < 100 && (
        <div className="note-box warn small mt-8">
          This image is low resolution ({active.natW}×{active.natH}px), so the print may look blurry at this size. Use a larger image or make it smaller.
        </div>
      )}
    </div>
  );

  const panel = (
    <div>
      <div className="section-title">{SIDE_LABEL[side]} of the T-shirt</div>
      <div className="design-part">
        <div className="row between wrap">
          <b className="small">Image</b>
          {image && (
            <div className="row">
              <button className="btn light sm" onClick={() => fileRef.current?.click()}>Change</button>
              <button className="btn light sm" onClick={() => remove(image.id)} aria-label="Remove image"><Icon name="trash" className="icon sm" /></button>
            </div>
          )}
        </div>
        {image ? (
          <button className={`row mt-8 design-pick ${active?.id === image.id ? "on" : ""}`} onClick={() => setActiveId(image.id)}>
            <img src={image.src} alt="" className="custom-thumb" />
            <span className="xs muted">{image.natW}×{image.natH}px · tap to adjust</span>
          </button>
        ) : (
          <button
            className={`custom-drop mt-8 ${dragOver ? "over" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); chooseFile(e.dataTransfer.files[0]); }}
          >
            <Icon name="image" />
            <b>Upload an image</b>
            <span className="muted xs">PNG, JPG or WEBP, up to {MAX_MB} MB. A PNG with a transparent background prints best.</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => chooseFile(e.target.files?.[0])} />
      </div>

      <div className="design-part">
        <div className="row between wrap">
          <b className="small">Text</b>
          {text ? (
            <button className="btn light sm" onClick={() => remove(text.id)} aria-label="Remove text"><Icon name="trash" className="icon sm" /></button>
          ) : (
            <button className="btn light sm" onClick={addText}><Icon name="plus" className="icon sm" /> Add text</button>
          )}
        </div>
        {text && (
          <div className="mt-8" onFocus={() => setActiveId(text.id)}>
            <input className="input" value={text.text} maxLength={MAX_TEXT} aria-label="Text on the T-shirt" placeholder="Name, number or slogan"
              onChange={(e) => restyleText(text, { text: e.target.value })} />
            <div className="chip-set mt-8" role="radiogroup" aria-label="Font">
              {TEXT_FONTS.map((f) => (
                <button key={f.name} role="radio" aria-checked={text.font === f.name} className={`chip ${text.font === f.name ? "on" : ""}`}
                  style={{ fontFamily: `"${f.name}"`, fontWeight: f.weight }} onClick={() => restyleText(text, { font: f.name })}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="row wrap mt-8" role="radiogroup" aria-label="Text colour">
              {TEXT_COLORS.map((c) => (
                <button key={c} role="radio" aria-checked={text.color === c} aria-label={c} className={`color-swatch sm ${text.color === c ? "on" : ""}`}
                  style={{ background: c }} onClick={() => restyleText(text, { color: c })} />
              ))}
              <label className="color-swatch sm custom" title="Other colour">
                <input type="color" value={text.color} onChange={(e) => restyleText(text, { color: e.target.value })} aria-label="Pick any colour" />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return { stage, panel, side };
}
