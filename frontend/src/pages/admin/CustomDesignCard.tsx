import { useState } from "react";
import Icon from "../../components/Icon";
import { Modal } from "../../components/ui";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api, downloadFile } from "../../lib/api";
import { SIDE_LABEL, designSides, fmtDateTime, money } from "../../lib/format";
import type { DesignLayer, DesignSide, OrderAdmin, OrderItem, PrintSide } from "../../lib/types";

const PRESETS = [
  "The image is too small / low quality to print clearly. Please upload a larger, sharper image.",
  "The image has a background. Please upload a PNG with a transparent background.",
  "Part of your design is cut off at the edge of the print area. Please move or resize it.",
];

const KIND = { image: "Image", ai: "AI image", art: "Art", text: "Text", name: "Name (from list)", number: "Number (from list)" } as const;
const DEFAULT_CM: Record<PrintSide, { w: number; h: number }> = { front: { w: 30, h: 40 }, back: { w: 30, h: 40 }, left: { w: 9, h: 9 }, right: { w: 9, h: 9 } };

/** Admin view of a custom print design: every printed side, its print files, sizes, names list, history and "request new design". */
export default function CustomDesignCard({ order, items, onChange }: { order: OrderAdmin; items: OrderItem[]; onChange(o: OrderAdmin): void }) {
  const { settings } = useStore();
  const toast = useToast();
  const item = items[0];
  const d = item.custom_design!;
  const sides = designSides(d);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");
  const canRequest = order.status === "CUSTOM_NEW" || order.status === "DESIGN_REVIEW";
  const foil = sides.flatMap((s) => s.layers.filter((l) => l.foil).map((l) => `${l.foil} on ${SIDE_LABEL[s.side].toLowerCase()}`));

  const request = async () => {
    setBusy(true);
    setErr("");
    try {
      onChange(await api<OrderAdmin>(`/api/admin/orders/${order.order_number}/design-request`, { body: { message: msg.trim() } }));
      setSent(msg.trim());
      setMsg("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const zip = async () => {
    try {
      await downloadFile(`/api/admin/orders/${order.order_number}/print-files`, {}, `ikart-${order.order_number}-print-files.zip`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const rosterCsv = () => {
    const rows = [["size", "name", "number"], ...(d.roster || []).map((r) => [r.size, r.name || "", r.number || ""])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ikart-${order.order_number}-names.csv`;
    a.click();
  };

  const a = order.shipping_address;
  const link = `${window.location.origin}/redesign/${order.order_number}`;
  const wa = (text: string) =>
    `https://wa.me/91${a.phone}?text=${encodeURIComponent(
      `Hi ${a.name}, about your ${settings.store_name} custom T-shirt order #${order.order_number}: ${text}\nPlease upload your new design here: ${link}`,
    )}`;

  return (
    <div className="card">
      <div className="row between wrap">
        <h3 style={{ margin: 0 }}>Customer design</h3>
        <div className="row wrap">
          <button className="btn sm" onClick={zip}><Icon name="download" className="icon sm" /> Print files (ZIP)</button>
          {canRequest && (
            <button className="btn light sm" onClick={() => { setAsking(true); setSent(""); }}>
              <Icon name="refresh" className="icon sm" /> Request new design
            </button>
          )}
        </div>
      </div>

      <div className="kv mt-16">
        <div><span>T-shirt</span><span>{item.product_name.replace(/^Custom print · /, "")} · <i className="swatch-dot" style={{ background: d.color_hex || "#fff", display: "inline-block", verticalAlign: "middle" }} /> {item.color}</span></div>
        <div><span>Sizes</span><span><b>{items.map((i) => `${i.size} × ${i.quantity}`).join(", ")}</b> ({items.reduce((s, i) => s + i.quantity, 0)} pcs)</span></div>
        <div><span>Printed on</span><span>{sides.map((s) => SIDE_LABEL[s.side]).join(", ")}</span></div>
        {!!foil.length && <div><span>Foil</span><span style={{ color: "var(--warn)" }}><b>{foil.join(", ")}</b></span></div>}
        {d.glow && <div><span>Ink</span><span style={{ color: "var(--warn)" }}><b>Glow in the dark</b></span></div>}
        <div><span>Price per piece</span><span>{money(item.unit_price)} (print & extras {money(d.print_price)})</span></div>
      </div>

      {d.change_request && (
        <div className="note-box warn mt-16 row between wrap">
          <span><b>Waiting for the customer's new design</b> (asked {fmtDateTime(d.change_request.requested_at)}): {d.change_request.message}</span>
          <a className="btn light sm" href={wa(d.change_request.message)} target="_blank" rel="noreferrer">Remind on WhatsApp</a>
        </div>
      )}

      {sides.map((s) => <SideBlock key={s.side} s={s} />)}

      {!!d.roster?.length && (
        <div className="design-side">
          <div className="row between">
            <div className="section-title" style={{ margin: 0 }}>Names & numbers ({d.roster.length})</div>
            <button className="btn light sm" onClick={rosterCsv}><Icon name="download" className="icon sm" /> CSV</button>
          </div>
          <div className="table-wrap mt-8">
            <table>
              <thead><tr><th>#</th><th>Size</th><th>Name</th><th>Number</th></tr></thead>
              <tbody>{d.roster.map((r, i) => <tr key={i}><td>{i + 1}</td><td>{r.size}</td><td>{r.name || "-"}</td><td>{r.number || "-"}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {!!d.revisions?.length && (
        <details className="mt-16">
          <summary className="small">Earlier designs ({d.revisions.length})</summary>
          <div className="row wrap mt-8">
            {d.revisions.map((r, i) => {
              const prev = r.sides?.map((x) => x.preview_url) || (r.preview_url ? [r.preview_url] : []);
              return (
                <div key={i} className="revision">
                  <div className="row">{prev.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Earlier design" /></a>)}</div>
                  <div className="xs muted">Replaced {fmtDateTime(r.replaced_at)}</div>
                  {r.request && <div className="xs">Asked: {r.request}</div>}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {asking && (
        <Modal
          title="Request a new design"
          onClose={() => !busy && setAsking(false)}
          footer={sent ? <button className="btn" onClick={() => setAsking(false)}>Done</button> : (
            <>
              <button className="btn light" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
              <button className="btn" onClick={request} disabled={busy || msg.trim().length < 3}>{busy ? "Sending…" : "Request new design"}</button>
            </>
          )}
        >
          {sent ? (
            <>
              <div className="note-box mb-16">The customer will see this in <b>My orders</b> with an <b>Upload new design</b> button. The order stays in design review until they send it.</div>
              <a className="btn block" href={wa(sent)} target="_blank" rel="noreferrer">Also send on WhatsApp</a>
            </>
          ) : (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>Tell the customer what to change. They can upload a new design for the same side(s); the price doesn't change.</p>
              <div className="stack" style={{ gap: 6 }}>
                {PRESETS.map((p) => <button key={p} className="chip" style={{ textAlign: "left", borderRadius: 10 }} onClick={() => setMsg(p)}>{p}</button>)}
              </div>
              <div className="field mt-16">
                <label htmlFor="dr-msg">Message to the customer</label>
                <textarea id="dr-msg" className="input" rows={3} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} />
              </div>
              {err && <div className="form-error">{err}</div>}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function SideBlock({ s }: { s: DesignSide }) {
  const cm = s.area_cm || DEFAULT_CM[s.side];
  return (
    <div className="design-side">
      <div className="section-title">{SIDE_LABEL[s.side]} · print area {cm.w}×{cm.h} cm</div>
      <div className="design-box">
        <a href={s.preview_url} target="_blank" rel="noreferrer"><img src={s.preview_url} alt={`${SIDE_LABEL[s.side]} preview`} /></a>
        <div className="stack" style={{ gap: 10 }}>
          {s.layers.map((l, i) => <LayerInfo key={i} l={l} cm={cm} />)}
        </div>
      </div>
    </div>
  );
}

function LayerInfo({ l, cm }: { l: DesignLayer; cm: { w: number; h: number } }) {
  const wCm = l.w * cm.w;
  const hCm = l.h * cm.h;
  const dpi = (l.type === "image" || l.type === "ai") && l.width ? Math.round(l.width / (wCm / 2.54)) : null;
  const isText = l.type === "text" || l.type === "name" || l.type === "number";
  return (
    <div className="layer-info">
      <div className="row between">
        <b className="small">{KIND[l.type] || l.type}{l.type === "text" && <>: “{l.text}”</>}{l.type === "art" && l.name && <>: {l.name}</>}</b>
        <a className="btn light sm" href={l.url} download target="_blank" rel="noreferrer"><Icon name="download" className="icon sm" /> PNG</a>
      </div>
      <div className="kv">
        {isText && (
          <div>
            <span>Style</span>
            <span>{l.font} · {l.foil ? <b>{l.foil} foil</b> : <><i className="swatch-dot" style={{ background: l.color || "#000", display: "inline-block", verticalAlign: "middle" }} /> {l.color}</>}
              {l.effect && l.effect !== "straight" && ` · ${l.effect}${l.effect === "arc" ? ` ${l.curve}` : ""}`}
              {!!l.outline_width && ` · outline ${l.outline_color}`}</span>
          </div>
        )}
        {!isText && l.foil && <div><span>Finish</span><span><b>{l.foil} foil</b></span></div>}
        {l.type === "ai" && l.name && <div><span>AI prompt</span><span className="xs">{l.name}</span></div>}
        <div><span>Print size</span><span>about {wCm.toFixed(1)} × {hCm.toFixed(1)} cm</span></div>
        <div><span>Position</span><span>{Math.round(l.x * 100)}% from left, {Math.round(l.y * 100)}% from top{l.rotation ? ` · rotated ${Math.round(l.rotation)}°` : ""}{l.flip ? " · mirrored" : ""}</span></div>
        {(l.background_removed || l.single_color) && (
          <div><span>Edits</span><span>{[l.background_removed && "background removed", l.single_color && `single colour ${l.single_color}`].filter(Boolean).join(", ")}</span></div>
        )}
        {dpi !== null && <div><span>File</span><span>{l.width}×{l.height}px · ~{dpi} DPI{dpi < 100 && <b style={{ color: "var(--bad)" }}> (low)</b>}</span></div>}
      </div>
    </div>
  );
}
