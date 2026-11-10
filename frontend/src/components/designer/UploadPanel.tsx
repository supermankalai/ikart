import { useRef, useState } from "react";
import { useToast } from "../../context/toast";
import { type EditorLayer, newId } from "../../lib/designState";
import { TEXT_COLORS } from "../../lib/designText";
import { cornerColor, hasTransparency } from "../../lib/imageTools";
import { fitPlacement, loadImage, printDpi } from "../../lib/teeMockup";
import Icon from "../Icon";
import { useDesigner } from "./context";

const MAX_MB = 15;
const ACCEPT = "image/png,image/jpeg,image/webp";

/** Image tools for the selected image / AI image / art: remove background, single colour, quality. */
export function ImageTools({ layer }: { layer: EditorLayer }) {
  const { restyle, spec } = useDesigner();
  const id = layer.id;
  const dpi = printDpi(spec, layer.natW, layer.p);
  const quality = dpi >= 150 ? { label: "Great", tone: "ok" } : dpi >= 100 ? { label: "Good", tone: "warn" } : { label: "Low, may print blurry", tone: "bad" };
  const isArt = layer.kind === "art";

  return (
    <div className="dz-stack">
      {!isArt && (
        <div className={`dz-quality ${quality.tone}`}>
          <b>Print quality: {quality.label}</b>
          <span className="xs">{layer.natW}×{layer.natH}px at this size ≈ {Math.round(dpi)} DPI{dpi < 100 ? ". Use a bigger image or make it smaller." : ""}</span>
        </div>
      )}

      {!isArt && (
        <div className="dz-tool">
          <label className="check" style={{ display: "flex" }}>
            <span className="switch"><input type="checkbox" checked={!!layer.bg}
              onChange={(e) => restyle(id, { bg: e.target.checked ? { color: cornerColor(layer.original || layer.source), tolerance: 25 } : null })} /><i /></span>
            <span><b>Remove background</b><br /><span className="xs muted">Makes the background colour see-through</span></span>
          </label>
          {layer.bg && (
            <div className="dz-sub">
              <div className="row">
                <span className="small">Background colour</span>
                <label className="dz-swatch-any inline" style={{ background: layer.bg.color }} title="Pick the background colour">
                  <input type="color" value={layer.bg.color} onChange={(e) => restyle(id, { bg: { ...layer.bg!, color: e.target.value } }, `bg-${id}`)} aria-label="Background colour" />
                </label>
                <button className="btn light sm" onClick={() => restyle(id, { bg: { ...layer.bg!, color: cornerColor(layer.original || layer.source) } })}>
                  <Icon name="eyedrop" className="icon sm" /> Auto
                </button>
              </div>
              <label className="dz-slider">
                <span>Strength {layer.bg.tolerance}</span>
                <input type="range" min={0} max={100} value={layer.bg.tolerance} onChange={(e) => restyle(id, { bg: { ...layer.bg!, tolerance: Number(e.target.value) } }, `bgt-${id}`)} />
              </label>
            </div>
          )}
        </div>
      )}

      <div className="dz-tool">
        <label className="check" style={{ display: "flex" }}>
          <span className="switch"><input type="checkbox" checked={!!layer.single}
            onChange={(e) => restyle(id, { single: e.target.checked ? { color: TEXT_COLORS[1], threshold: 60 } : null })} /><i /></span>
          <span><b>{isArt ? "Change colour" : "Make single colour"}</b><br /><span className="xs muted">{isArt ? "Print the art in one colour" : "Turns the image into a one-colour print"}</span></span>
        </label>
        {layer.single && (
          <div className="dz-sub">
            <div className="dz-swatches">
              {TEXT_COLORS.map((c) => (
                <button key={c} aria-label={c} className={layer.single!.color === c ? "on" : ""} style={{ background: c }}
                  onClick={() => restyle(id, { single: { ...layer.single!, color: c } })} />
              ))}
              <label className="dz-swatch-any" title="Any colour">
                <input type="color" value={layer.single.color} onChange={(e) => restyle(id, { single: { ...layer.single!, color: e.target.value } }, `sc-${id}`)} aria-label="Any colour" />
              </label>
            </div>
            {!isArt && !hasTransparency(layer.original || layer.source) && (
              <label className="dz-slider">
                <span>Detail {layer.single.threshold}</span>
                <input type="range" min={10} max={95} value={layer.single.threshold} onChange={(e) => restyle(id, { single: { ...layer.single!, threshold: Number(e.target.value) } }, `sct-${id}`)} />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UploadPanel() {
  const { active, add, spec } = useDesigner();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const editing = active && (active.kind === "image" || active.kind === "ai") ? active : null;

  const choose = async (files: FileList | File[] | null | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    const list = [...(files || [])].slice(0, 4);
    if (!list.length) return;
    setBusy(true);
    for (const file of list) {
      if (!ACCEPT.split(",").includes(file.type)) {
        toast("Please choose a JPG, PNG or WEBP image", "error");
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast(`${file.name} is larger than ${MAX_MB} MB`, "error");
        continue;
      }
      const src = URL.createObjectURL(file);
      try {
        const img = await loadImage(src);
        add({
          id: newId(), kind: "image", src, source: img, original: img, file, natW: img.naturalWidth, natH: img.naturalHeight,
          p: fitPlacement(spec, img.naturalWidth, img.naturalHeight, 0.8, 0.05), name: file.name,
        });
      } catch (e) {
        URL.revokeObjectURL(src);
        toast((e as Error).message, "error");
      }
    }
    setBusy(false);
  };

  return (
    <div>
      <h3 className="dz-h">Upload image</h3>
      <button
        className={`custom-drop ${over ? "over" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files); }}
        disabled={busy}
      >
        <Icon name="upload" />
        <b>{busy ? "Adding…" : "Click to upload or drop images"}</b>
        <span className="muted xs">PNG, JPG or WEBP, up to {MAX_MB} MB. For best results use 2000×2000px or larger; a PNG with a transparent background prints cleanest.</span>
      </button>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => choose(e.target.files)} />
      {editing && <div className="mt-16"><ImageTools layer={editing} /></div>}
    </div>
  );
}
