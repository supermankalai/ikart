import { type EditorLayer, newId, rerenderText } from "../../lib/designState";
import { EFFECTS, FOIL_SWATCH, MAX_TEXT, TEXT_COLORS, TEXT_FONTS } from "../../lib/designText";
import { money } from "../../lib/format";
import { fitPlacement, isLight } from "../../lib/teeMockup";
import Icon from "../Icon";
import { useDesigner } from "./context";

/** Style controls shared by text, name and number layers. */
export function TextStyleControls({ layer }: { layer: EditorLayer }) {
  const { restyle, settings } = useDesigner();
  const id = layer.id;
  return (
    <div className="dz-stack">
      {layer.kind === "text" && (
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="dz-text">Your text</label>
          <input id="dz-text" className="input" value={layer.text} maxLength={MAX_TEXT} placeholder="Name, slogan, date…" autoComplete="off"
            onChange={(e) => restyle(id, { text: e.target.value }, `text-${id}`)} />
        </div>
      )}

      <div>
        <div className="dz-label">Font</div>
        <div className="dz-fonts" role="radiogroup" aria-label="Font">
          {TEXT_FONTS.map((f) => (
            <button key={f.name} role="radio" aria-checked={layer.font === f.name} className={layer.font === f.name ? "on" : ""}
              style={{ fontFamily: `"${f.name}"`, fontWeight: f.weight }} onClick={() => restyle(id, { font: f.name })} title={f.name}>
              {layer.kind === "number" ? "23" : "Abc"}
              <small>{f.label}</small>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="dz-label">Colour</div>
        <div className="dz-swatches" role="radiogroup" aria-label="Text colour">
          {TEXT_COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={!layer.foil && layer.color === c} aria-label={c} className={!layer.foil && layer.color === c ? "on" : ""}
              style={{ background: c }} onClick={() => restyle(id, { color: c, foil: null })} />
          ))}
          <label className="dz-swatch-any" title="Any colour">
            <input type="color" value={layer.color} onChange={(e) => restyle(id, { color: e.target.value, foil: null }, `color-${id}`)} aria-label="Pick any colour" />
          </label>
        </div>
        <div className="dz-foils">
          {(["gold", "silver"] as const).map((f) => (
            <button key={f} className={`dz-foil ${f} ${layer.foil === f ? "on" : ""}`} onClick={() => restyle(id, { foil: layer.foil === f ? null : f })}
              aria-pressed={layer.foil === f}>
              <i style={{ background: FOIL_SWATCH[f] }} /> {f === "gold" ? "Gold" : "Silver"} foil
              <span className="xs muted">+{money(settings.custom_foil_price)}/side</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="dz-label">Style</div>
        <div className="dz-effects" role="radiogroup" aria-label="Text effect">
          {EFFECTS.map((e) => (
            <button key={e.id} role="radio" aria-checked={(layer.effect || "straight") === e.id} className={(layer.effect || "straight") === e.id ? "on" : ""}
              onClick={() => restyle(id, { effect: e.id })}>
              <EffectIcon effect={e.id} />
              <span>{e.label}</span>
            </button>
          ))}
        </div>
        {layer.effect === "arc" && (
          <label className="dz-slider">
            <span>Curve {(layer.curve ?? 40) > 0 ? "up" : "down"} · {Math.abs(layer.curve ?? 40)}</span>
            <input type="range" min={-100} max={100} value={layer.curve ?? 40} onChange={(e) => restyle(id, { curve: Number(e.target.value) || 1 }, `curve-${id}`)} />
          </label>
        )}
      </div>

      <div className="dz-row2">
        <label className="dz-slider">
          <span>Outline {layer.outlineWidth || 0}</span>
          <input type="range" min={0} max={20} value={layer.outlineWidth || 0} onChange={(e) => restyle(id, { outlineWidth: Number(e.target.value) }, `outline-${id}`)} />
        </label>
        {!!layer.outlineWidth && (
          <label className="dz-swatch-any inline" title="Outline colour" style={{ background: layer.outlineColor || "#000" }}>
            <input type="color" value={layer.outlineColor || "#000000"} onChange={(e) => restyle(id, { outlineColor: e.target.value }, `ocolor-${id}`)} aria-label="Outline colour" />
          </label>
        )}
      </div>
      <label className="dz-slider">
        <span>Letter spacing {layer.spacing || 0}</span>
        <input type="range" min={-10} max={60} value={layer.spacing || 0} onChange={(e) => restyle(id, { spacing: Number(e.target.value) }, `spacing-${id}`)} />
      </label>
    </div>
  );
}

function EffectIcon({ effect }: { effect: string }) {
  const d: Record<string, string> = {
    straight: "M4 14h24",
    arc: "M4 18Q16 4 28 18",
    circle: "M16 4a10 10 0 1 1 0 20a10 10 0 1 1 0-20",
    bulge: "M4 12Q16 4 28 12M4 16Q16 24 28 16",
    grow: "M4 16L28 8M4 18L28 24",
    shrink: "M4 8L28 16M4 24L28 18",
  };
  return (
    <svg viewBox="0 0 32 28" width="32" height="28" aria-hidden="true">
      <path d={d[effect]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function TextPanel() {
  const { active, add, spec, colorHex, design, view, roster } = useDesigner();
  const editing = active && active.kind === "text" ? active : null;

  const addText = async () => {
    const color = isLight(colorHex) ? "#111111" : "#ffffff";
    const base: EditorLayer = {
      id: newId(), kind: "text", src: "", source: document.createElement("canvas"), natW: 1, natH: 1, p: { x: 0, y: 0, w: 0.5, h: 0.1 },
      text: "Your text", font: "Anton", color, effect: "straight", curve: 40, outlineColor: color === "#ffffff" ? "#111111" : "#ffffff", outlineWidth: 0, spacing: 0,
    };
    const r = await rerenderText(base, roster);
    const hasArt = design[view].some((l) => l.kind !== "text");
    add({ ...base, ...r, p: fitPlacement(spec, r.natW!, r.natH!, 0.65, hasArt ? 0.72 : undefined) } as EditorLayer);
  };

  return (
    <div>
      <h3 className="dz-h">Text</h3>
      <button className="btn block" onClick={addText}><Icon name="plus" className="icon sm" /> Add text</button>
      {editing ? (
        <div className="mt-16"><TextStyleControls layer={editing} /></div>
      ) : (
        <p className="muted small mt-16">Add a name, slogan, date or quote. Pick a font, colour and style like an arc or circle, then drag it into place on the T-shirt.</p>
      )}
    </div>
  );
}
