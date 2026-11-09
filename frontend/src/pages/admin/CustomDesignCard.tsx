import { useState } from "react";
import Icon from "../../components/Icon";
import { Modal } from "../../components/ui";
import { useStore } from "../../context/store";
import { api } from "../../lib/api";
import { SIDE_LABEL, designSides, fmtDateTime, money } from "../../lib/format";
import { PRINT_HEIGHT_INCHES, PRINT_WIDTH_INCHES } from "../../lib/teeMockup";
import type { DesignLayer, OrderAdmin, OrderItem } from "../../lib/types";

const PRESETS = [
  "The image is too small / low quality to print clearly. Please upload a larger, sharper image.",
  "The image has a background. Please upload a PNG with a transparent background.",
  "Part of your design is cut off at the edge of the print area. Please move or resize it.",
];

/** Admin view of a custom print design: every printed side, its print files, history, and "request new design". */
export default function CustomDesignCard({
  order,
  item,
  onChange,
}: {
  order: OrderAdmin;
  item: OrderItem;
  onChange(o: OrderAdmin): void;
}) {
  const { settings } = useStore();
  const d = item.custom_design!;
  const sides = designSides(d);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");
  const canRequest = order.status === "CUSTOM_NEW" || order.status === "DESIGN_REVIEW";

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
        {canRequest && (
          <button className="btn light sm" onClick={() => { setAsking(true); setSent(""); }}>
            <Icon name="refresh" className="icon sm" /> Request new design
          </button>
        )}
      </div>
      <div className="small muted mt-8">
        {item.product_name.replace(/^Custom print · /, "")} · {item.color} · Size <b>{item.size}</b> × {item.quantity} · Print {money(d.print_price)} each
      </div>

      {d.change_request && (
        <div className="note-box warn mt-16 row between wrap">
          <span>
            <b>Waiting for the customer's new design</b> (asked {fmtDateTime(d.change_request.requested_at)}): {d.change_request.message}
          </span>
          <a className="btn light sm" href={wa(d.change_request.message)} target="_blank" rel="noreferrer">Remind on WhatsApp</a>
        </div>
      )}

      {sides.map((s) => (
        <div key={s.side} className="design-side">
          <div className="section-title">{SIDE_LABEL[s.side]}</div>
          <div className="design-box">
            <a href={s.preview_url} target="_blank" rel="noreferrer"><img src={s.preview_url} alt={`${SIDE_LABEL[s.side]} preview`} /></a>
            <div className="stack" style={{ gap: 12 }}>
              {s.layers.map((l, i) => <LayerInfo key={i} l={l} />)}
              <a className="link xs" href={s.preview_url} download target="_blank" rel="noreferrer">Download {SIDE_LABEL[s.side].toLowerCase()} preview</a>
            </div>
          </div>
        </div>
      ))}

      {!!d.revisions?.length && (
        <details className="mt-16">
          <summary className="small">Earlier designs ({d.revisions.length})</summary>
          <div className="row wrap mt-8">
            {d.revisions.map((r, i) => {
              const prev = r.sides?.map((x) => x.preview_url) || (r.preview_url ? [r.preview_url] : []);
              return (
                <div key={i} className="revision">
                  <div className="row">
                    {prev.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Earlier design" /></a>)}
                  </div>
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
          footer={
            sent ? (
              <button className="btn" onClick={() => setAsking(false)}>Done</button>
            ) : (
              <>
                <button className="btn light" onClick={() => setAsking(false)} disabled={busy}>Cancel</button>
                <button className="btn" onClick={request} disabled={busy || msg.trim().length < 3}>{busy ? "Sending…" : "Request new design"}</button>
              </>
            )
          }
        >
          {sent ? (
            <>
              <div className="note-box mb-16">
                The customer will see this in <b>My orders</b> with an <b>Upload new design</b> button. The order stays in design review until they send it.
              </div>
              <a className="btn block" href={wa(sent)} target="_blank" rel="noreferrer">Also send on WhatsApp</a>
            </>
          ) : (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>Tell the customer what to change. They'll be able to upload a new design for the same side(s); the price doesn't change.</p>
              <div className="stack" style={{ gap: 6 }}>
                {PRESETS.map((p) => (
                  <button key={p} className="chip" style={{ textAlign: "left", borderRadius: 10 }} onClick={() => setMsg(p)}>{p}</button>
                ))}
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

function LayerInfo({ l }: { l: DesignLayer }) {
  const wIn = l.w * PRINT_WIDTH_INCHES;
  const hIn = l.h * PRINT_HEIGHT_INCHES;
  const dpi = l.type === "image" && l.width ? Math.round(l.width / wIn) : null;
  return (
    <div className="layer-info">
      <div className="row between">
        <b className="small">
          {l.type === "image" ? "Image" : <>Text: “{l.text}”</>}
        </b>
        <a className="btn sm" href={l.url} download target="_blank" rel="noreferrer">
          <Icon name="download" className="icon sm" /> {l.type === "image" ? "Original" : "PNG"}
        </a>
      </div>
      <div className="kv">
        {l.type === "text" && (
          <div>
            <span>Font / colour</span>
            <span>{l.font} · <i className="swatch-dot" style={{ background: l.color || "#000", display: "inline-block", verticalAlign: "middle" }} /> {l.color}</span>
          </div>
        )}
        <div><span>Print size</span><span>about {wIn.toFixed(1)} × {hIn.toFixed(1)} in</span></div>
        <div><span>Position</span><span>{Math.round(l.x * 100)}% from left, {Math.round(l.y * 100)}% from top</span></div>
        {!!l.rotation && <div><span>Rotation</span><span>{Math.round(l.rotation)}°</span></div>}
        {l.type === "image" && l.width && (
          <div>
            <span>File</span>
            <span>{l.width}×{l.height}px{dpi !== null && <> · ~{dpi} DPI{dpi < 100 && <b style={{ color: "var(--bad)" }}> (low)</b>}</>}</span>
          </div>
        )}
      </div>
    </div>
  );
}
