import { SIDE_LABEL } from "../../lib/format";
import { VIEWS } from "../../lib/teeMockup";
import Icon from "../Icon";
import { useDesigner } from "./context";

const KIND_LABEL = { image: "Image", ai: "AI image", art: "Art", text: "Text", name: "Name", number: "Number" } as const;

export default function LayersPanel() {
  const { design, view, setView, active, select, remove, duplicate, reorder } = useDesigner();
  const layers = [...design[view]].reverse(); // top first
  return (
    <div>
      <h3 className="dz-h">Layers</h3>
      <div className="chip-set">
        {VIEWS.map((v) => (
          <button key={v} className={`chip ${view === v ? "on" : ""}`} onClick={() => setView(v)}>
            {SIDE_LABEL[v]} {design[v].length > 0 && <b>· {design[v].length}</b>}
          </button>
        ))}
      </div>
      {!layers.length ? (
        <p className="muted small mt-16">Nothing on the {SIDE_LABEL[view].toLowerCase()} yet.</p>
      ) : (
        <ul className="dz-layers">
          {layers.map((l, i) => (
            <li key={l.id} className={active?.id === l.id ? "on" : ""}>
              <button className="dz-layer-main" onClick={() => select(l.id)}>
                <span className="dz-layer-thumb"><img src={l.src} alt="" /></span>
                <span>
                  <b className="small">{KIND_LABEL[l.kind]}</b>
                  <span className="xs muted dz-ellipsis">{l.kind === "text" ? l.text : l.name || ""}</span>
                </span>
              </button>
              <div className="dz-layer-actions">
                <button onClick={() => reorder(l.id, 1)} disabled={i === 0} aria-label="Bring forward" title="Bring forward"><Icon name="up" className="icon sm" /></button>
                <button onClick={() => reorder(l.id, -1)} disabled={i === layers.length - 1} aria-label="Send backward" title="Send backward"><Icon name="down" className="icon sm" /></button>
                <button onClick={() => duplicate(l.id)} aria-label="Duplicate" title="Duplicate"><Icon name="copy" className="icon sm" /></button>
                <button onClick={() => remove(l.id)} aria-label="Delete" title="Delete"><Icon name="trash" className="icon sm" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="xs muted mt-16">Tip: Delete removes the selected item, Ctrl+Z undoes, arrow keys nudge it.</p>
    </div>
  );
}
