import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Timeline } from "../../components/OrderProgress";
import { Img, Loader, Modal, PayBadge, StatusBadge } from "../../components/ui";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { STATUS_LABEL, flowFor, fmtDate, fmtDateTime, isCustom, money } from "../../lib/format";
import type { AdminSettings, CourierQuote, IntegrationStatus, OrderAdmin, OrderStatus } from "../../lib/types";
import { AdminTop } from "./AdminLayout";
import CustomDesignCard from "./CustomDesignCard";

export default function OrderDetail() {
  const { number } = useParams();
  const toast = useToast();
  const { settings } = useStore();
  const [o, setO] = useState<OrderAdmin | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { integrations } = useAdminSettings();

  const load = useCallback(() => {
    api<OrderAdmin>(`/api/admin/orders/${number}`).then(setO).catch((e) => setErr(e.message));
  }, [number]);
  useEffect(load, [load]);

  if (err) return <div className="form-error">{err}</div>;
  if (!o) return <Loader />;

  const act = async (fn: () => Promise<OrderAdmin>, msg: string) => {
    setBusy(true);
    try {
      setO(await fn());
      toast(msg, "success");
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (status: OrderStatus) =>
    act(() => api<OrderAdmin>(`/api/admin/orders/${o.order_number}/status`, { body: { status } }), `Marked as ${STATUS_LABEL[status].toLowerCase()}`);

  const custom = isCustom(o);
  const flow = flowFor(o);
  const idx = flow.indexOf(o.status);
  const next = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
  // Custom orders: production steps the admin moves through one by one before shipping
  const productionNext = custom && next && ["DESIGN_REVIEW", "DESIGN_APPROVED", "PRINTING", "QUALITY_CHECK", "READY_TO_SHIP"].includes(next) ? next : null;
  const canShip = custom ? o.status === "READY_TO_SHIP" : o.status === "PLACED" || o.status === "PACKED";
  const a = o.shipping_address;
  const canCancel = !["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(o.status);

  return (
    <>
      <div className="no-print">
        <Link to={custom ? "/admin/custom-orders" : "/admin/orders"} className="link small">← {custom ? "Custom orders" : "Orders"}</Link>
        <AdminTop title={`${custom ? "Custom order" : "Order"} #${o.order_number}`}>
          <button className="btn light sm" onClick={() => window.print()}><Icon name="print" className="icon sm" /> Print invoice</button>
        </AdminTop>
        <div className="row wrap mb-16" style={{ marginTop: -12 }}>
          <StatusBadge status={o.status} />
          <PayBadge status={o.payment_status} />
          <span className="muted small">Placed {fmtDateTime(o.created_at)}</span>
        </div>

        {/* Next action */}
        <div className="card mb-16 row between wrap" style={{ borderColor: next ? "var(--gold)" : undefined }}>
          <div>
            <div className="section-title" style={{ marginBottom: 4 }}>Next step</div>
            <div className="small">
              {o.status === "PENDING_PAYMENT" && "Waiting for the customer to complete payment."}
              {o.status === "PLACED" && "Pack the items, then mark the order as packed."}
              {o.status === "CUSTOM_NEW" && "New custom print order. Download the artwork and start the design review."}
              {o.status === "DESIGN_REVIEW" && "Check the artwork quality and placement. Approve it, or contact the customer (or cancel with a refund) if it can't be printed."}
              {o.status === "DESIGN_APPROVED" && "Design approved. Start printing."}
              {o.status === "PRINTING" && "Printing in progress. Move to quality check when done."}
              {o.status === "QUALITY_CHECK" && "Check the print, then pack it and mark it ready to ship."}
              {o.status === "READY_TO_SHIP" && (integrations?.shiprocket_configured
                ? "Create the shipment: Shiprocket books the courier and pickup, then print the label."
                : "Book the pickup with your delivery partner, then enter the AWB number.")}
              {o.status === "PACKED" && (integrations?.shiprocket_configured
                ? "Create the shipment: Shiprocket books the courier and pickup, then print the label."
                : "Book the pickup with your delivery partner, then enter the AWB number.")}
              {o.status === "SHIPPED" && (o.shipping_provider === "shiprocket"
                ? "Stick the label on the parcel and hand it to the courier. Status updates arrive from Shiprocket (or use Refresh tracking)."
                : "Waiting for the delivery partner. Update when it's out for delivery.")}
              {o.status === "OUT_FOR_DELIVERY" && "Mark as delivered once the customer receives it."}
              {o.status === "DELIVERED" && "Order complete."}
              {o.status === "CANCELLED" && "This order was cancelled."}
            </div>
          </div>
          <div className="row wrap">
            {o.status === "PENDING_PAYMENT" && (
              <button className="btn light sm" disabled={busy} onClick={() => act(() => api<OrderAdmin>(`/api/admin/orders/${o.order_number}/sync-payment`, { method: "POST" }), "Payment status refreshed")}>
                <Icon name="refresh" className="icon sm" /> Check payment status
              </button>
            )}
            {next === "PACKED" && <button className="btn" disabled={busy} onClick={() => setStatus("PACKED")}>Mark as packed</button>}
            {productionNext && (
              <button className="btn" disabled={busy} onClick={() => setStatus(productionNext)}>
                {productionNext === "DESIGN_APPROVED" ? "Approve design" : `Move to ${STATUS_LABEL[productionNext].toLowerCase()}`}
              </button>
            )}
            {canShip && (
              <button className={`btn ${next === "SHIPPED" ? "gold" : "light"}`} disabled={busy} onClick={() => setShipOpen(true)}>
                <Icon name="truck" className="icon sm" /> Create shipment
              </button>
            )}
            {next === "OUT_FOR_DELIVERY" && <button className="btn" disabled={busy} onClick={() => setStatus("OUT_FOR_DELIVERY")}>Mark out for delivery</button>}
            {(o.status === "SHIPPED" || o.status === "OUT_FOR_DELIVERY") && (
              <button className={`btn ${next === "DELIVERED" ? "" : "light"}`} disabled={busy} onClick={() => setStatus("DELIVERED")}>Mark delivered</button>
            )}
            {canCancel && <button className="btn danger" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel order</button>}
          </div>
        </div>

        <div className="od-grid">
          <div className="stack">
            {o.items.filter((i) => i.custom_design).map((i, k) => (
              <CustomDesignCard key={`design-${k}`} order={o} item={i} onChange={setO} />
            ))}
            <div className="card">
              <h3>Items</h3>
              {o.items.map((i, k) => (
                <div className="line-item" key={k}>
                  <Img src={i.image_url} alt="" className="thumb s56" />
                  <div className="info">
                    <div className="title">{i.product_name}</div>
                    <div className="meta">{i.color} · Size <b>{i.size}</b> · {money(i.unit_price)} × {i.quantity}</div>
                  </div>
                  <b>{money(i.unit_price * i.quantity)}</b>
                </div>
              ))}
              <div className="divider" />
              <div className="kv">
                <div><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
                {!!o.discount && <div><span>Discount ({o.coupon_code})</span><span>−{money(o.discount)}</span></div>}
                <div><span>Shipping</span><span>{o.shipping_fee ? money(o.shipping_fee) : "Free"}</span></div>
                <div style={{ fontWeight: 600, fontSize: 16 }}><span style={{ color: "var(--ink)" }}>Total</span><span>{money(o.total)}</span></div>
              </div>
              {o.notes && <div className="note-box mt-16"><b>Customer note:</b> {o.notes}</div>}
            </div>
            <div className="card">
              <h3>Payment</h3>
              <div className="kv">
                <div><span>Method</span><span>{o.payment_method === "COD" ? "Cash on delivery" : "Online · Cashfree"}</span></div>
                <div><span>Status</span><span><PayBadge status={o.payment_status} /></span></div>
                {o.payment_mode && <div><span>Paid via</span><span>{o.payment_mode}</span></div>}
                {o.payment_ref && <div><span>Payment ID</span><span className="mono">{o.payment_ref}</span></div>}
                {o.cf_order_id && <div><span>Cashfree order</span><span className="mono">{o.cf_order_id}</span></div>}
                {o.paid_at && <div><span>Paid on</span><span>{fmtDateTime(o.paid_at)}</span></div>}
                {o.refund_ref && <div><span>Refund ID</span><span className="mono">{o.refund_ref}</span></div>}
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="card">
              <h3>Customer</h3>
              <div className="small">
                <b>{o.user.name}</b><br />
                <a className="link" href={`mailto:${o.user.email}`}>{o.user.email}</a><br />
                {o.user.phone}
              </div>
              <div className="divider" />
              <div className="section-title">Ship to</div>
              <div className="small">
                <b>{a.name}</b> · {a.phone}<br />
                {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
                {a.city}, {a.state} - <b>{a.pincode}</b>
              </div>
              <a className="btn light sm mt-16" href={`https://wa.me/91${a.phone}`} target="_blank" rel="noreferrer">WhatsApp customer</a>
            </div>
            <div className="card">
              <h3>Shipment</h3>
              {o.awb ? (
                <div className="kv">
                  <div><span>Courier</span><span>{o.shipping_partner}{o.shipping_provider === "shiprocket" && <span className="xs muted"> via Shiprocket</span>}</span></div>
                  <div><span>AWB</span><span className="mono">{o.awb}</span></div>
                  {o.partner_status && <div><span>Courier status</span><span>{o.partner_status}</span></div>}
                  {o.shipping_provider === "shiprocket" && (
                    <div><span>Pickup</span><span>{o.pickup_requested_at ? `Requested ${fmtDateTime(o.pickup_requested_at)}` : <span style={{ color: "var(--warn)" }}>Not requested</span>}</span></div>
                  )}
                  {o.shipped_at && <div><span>Shipped</span><span>{fmtDateTime(o.shipped_at)}</span></div>}
                  {o.delivered_at && <div><span>Delivered</span><span>{fmtDateTime(o.delivered_at)}</span></div>}
                  {o.tracking_url && <div><span>Tracking</span><a className="link" href={o.tracking_url} target="_blank" rel="noreferrer">Open ↗</a></div>}
                </div>
              ) : o.partner_shipment_id ? (
                <p className="small" style={{ color: "var(--warn)" }}>
                  Shiprocket shipment {o.partner_shipment_id} created, but no courier assigned yet. Use <b>Create shipment</b> to try again.
                </p>
              ) : (
                <p className="muted small">Not shipped yet.</p>
              )}
              {o.awb && o.shipping_provider === "shiprocket" && (
                <div className="row wrap mt-16">
                  {o.label_url ? (
                    <a className="btn sm" href={o.label_url} target="_blank" rel="noreferrer"><Icon name="print" className="icon sm" /> Shipping label</a>
                  ) : (
                    <button className="btn sm" disabled={busy} onClick={() => act(() => api<OrderAdmin>(`/api/admin/orders/${o.order_number}/label`, { method: "POST" }), "Label ready")}>
                      <Icon name="print" className="icon sm" /> Get label
                    </button>
                  )}
                  {!o.pickup_requested_at && o.status === "SHIPPED" && (
                    <button className="btn light sm" disabled={busy} onClick={() => act(() => api<OrderAdmin>(`/api/admin/orders/${o.order_number}/pickup`, { method: "POST" }), "Pickup requested")}>
                      <Icon name="truck" className="icon sm" /> Request pickup
                    </button>
                  )}
                  {o.status !== "DELIVERED" && (
                    <button className="btn light sm" disabled={busy} onClick={() => act(() => api<OrderAdmin>(`/api/admin/orders/${o.order_number}/sync-tracking`, { method: "POST" }), "Tracking refreshed")}>
                      <Icon name="refresh" className="icon sm" /> Refresh tracking
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="card">
              <h3>Timeline</h3>
              <Timeline order={o} />
            </div>
          </div>
        </div>
      </div>

      {/* Printable invoice */}
      <div className="print-only">
        <div className="row between top">
          <div>
            <div className="logo">iKart</div>
            <div className="small">{settings.support_phone} · {settings.support_email}</div>
          </div>
          <div className="right">
            <h2>Invoice</h2>
            <div className="small">Order #{o.order_number}<br />{fmtDate(o.created_at)}</div>
          </div>
        </div>
        <div className="divider" />
        <div className="small"><b>Ship to:</b> {a.name}, {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} - {a.pincode}. Ph: {a.phone}</div>
        <table className="mt-16">
          <thead><tr><th>Item</th><th>Size</th><th>Colour</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
          <tbody>
            {o.items.map((i, k) => (
              <tr key={k}><td>{i.product_name}</td><td>{i.size}</td><td>{i.color}</td><td>{i.quantity}</td><td>{money(i.unit_price)}</td><td>{money(i.unit_price * i.quantity)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="kv mt-16" style={{ maxWidth: 300, marginLeft: "auto" }}>
          <div><span>Subtotal</span><span>{money(o.subtotal)}</span></div>
          {!!o.discount && <div><span>Discount</span><span>−{money(o.discount)}</span></div>}
          <div><span>Shipping</span><span>{money(o.shipping_fee)}</span></div>
          <div style={{ fontWeight: 700 }}><span>Total</span><span>{money(o.total)}</span></div>
          <div><span>Payment</span><span>{o.payment_method === "COD" ? (o.payment_status === "PAID" ? "COD (paid)" : `COD: collect ${money(o.total)}`) : "Prepaid"}</span></div>
        </div>
      </div>

      {shipOpen && <ShipModal order={o} integrations={integrations} onClose={() => setShipOpen(false)} onDone={(u) => { setO(u); setShipOpen(false); }} onRefresh={load} />}
      {cancelOpen && (
        <CancelModal order={o} onClose={() => setCancelOpen(false)} onDone={(u) => { setO(u); setCancelOpen(false); }} />
      )}
    </>
  );
}

function ShipModal({ order, integrations, onClose, onDone, onRefresh }: {
  order: OrderAdmin;
  integrations: IntegrationStatus | null;
  onClose(): void;
  onDone(o: OrderAdmin): void;
  onRefresh(): void;
}) {
  const sr = !!integrations?.shiprocket_configured;
  const [tab, setTab] = useState<"shiprocket" | "manual">(sr ? "shiprocket" : "manual");
  return (
    <Modal title="Create shipment" onClose={onClose}>
      {sr && (
        <div className="seg mb-16" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "shiprocket"} className={tab === "shiprocket" ? "on" : ""} onClick={() => setTab("shiprocket")}>Ship with Shiprocket</button>
          <button type="button" role="tab" aria-selected={tab === "manual"} className={tab === "manual" ? "on" : ""} onClick={() => setTab("manual")}>Enter tracking number</button>
        </div>
      )}
      {tab === "shiprocket" ? (
        <ShiprocketForm order={order} onClose={onClose} onDone={onDone} onRefresh={onRefresh} />
      ) : (
        <ManualShipForm order={order} onClose={onClose} onDone={onDone} />
      )}
    </Modal>
  );
}

function ShiprocketForm({ order, onClose, onDone, onRefresh }: { order: OrderAdmin; onClose(): void; onDone(o: OrderAdmin): void; onRefresh(): void }) {
  const toast = useToast();
  const { settings } = useAdminSettings();
  const [pkg, setPkg] = useState<{ weight: string; l: string; b: string; h: string } | null>(null);
  const [quote, setQuote] = useState<CourierQuote | null>(null);
  const [courier, setCourier] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cod = order.payment_method === "COD" && order.payment_status !== "PAID";

  const findCouriers = useCallback(async (weight?: string) => {
    setLoading(true);
    setErr("");
    try {
      const q = await api<CourierQuote>(`/api/admin/orders/${order.order_number}/couriers`, { query: weight ? { weight_kg: weight } : {} });
      setQuote(q);
      setCourier(q.couriers[0]?.id ?? null);
      setPkg((p) => p ?? { weight: String(q.weight_kg), l: "", b: "", h: "" });
    } catch (e) {
      setErr((e as Error).message);
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [order.order_number]);

  useEffect(() => {
    findCouriers();
  }, [findCouriers]);
  useEffect(() => {
    if (settings && pkg && !pkg.l) setPkg({ ...pkg, l: String(settings.parcel_length_cm), b: String(settings.parcel_breadth_cm), h: String(settings.parcel_height_cm) });
  }, [settings, pkg]);

  const ship = async () => {
    setBusy(true);
    setErr("");
    try {
      const o = await api<OrderAdmin>(`/api/admin/orders/${order.order_number}/ship`, {
        body: {
          method: "shiprocket",
          courier_id: courier,
          weight_kg: pkg?.weight ? Number(pkg.weight) : null,
          length_cm: pkg?.l ? Number(pkg.l) : null,
          breadth_cm: pkg?.b ? Number(pkg.b) : null,
          height_cm: pkg?.h ? Number(pkg.h) : null,
        },
      });
      toast(`Shipped with ${o.shipping_partner}. AWB ${o.awb}`, "success");
      onDone(o);
    } catch (e) {
      setErr((e as Error).message);
      onRefresh(); // a failed attempt may still have created the Shiprocket order
      setBusy(false);
    }
  };

  return (
    <>
      <div className="note-box mb-16">
        Shiprocket creates the shipment, books the courier pickup from <b>your pickup address</b> and gives you the label to stick on the parcel.
        The courier charge is taken from your Shiprocket wallet.
        {cod && <><br /><b>Cash on delivery:</b> the courier collects {money(order.total)} and Shiprocket pays it to your bank.</>}
      </div>
      {order.partner_shipment_id && !order.awb && (
        <div className="note-box warn mb-16">A Shiprocket shipment already exists for this order (ID {order.partner_shipment_id}). Shipping again reuses it.</div>
      )}
      {err && <div className="form-error">{err}</div>}

      <div className="section-title">Parcel</div>
      <div className="parcel-grid">
        <div className="field"><label htmlFor="p-w">Weight (kg)</label><input id="p-w" className="input" type="number" step="0.05" min={0.05} inputMode="decimal" value={pkg?.weight ?? ""} onChange={(e) => pkg && setPkg({ ...pkg, weight: e.target.value })} /></div>
        <div className="field"><label htmlFor="p-l">L (cm)</label><input id="p-l" className="input" type="number" min={1} inputMode="numeric" value={pkg?.l ?? ""} onChange={(e) => pkg && setPkg({ ...pkg, l: e.target.value })} /></div>
        <div className="field"><label htmlFor="p-b">B (cm)</label><input id="p-b" className="input" type="number" min={1} inputMode="numeric" value={pkg?.b ?? ""} onChange={(e) => pkg && setPkg({ ...pkg, b: e.target.value })} /></div>
        <div className="field"><label htmlFor="p-h">H (cm)</label><input id="p-h" className="input" type="number" min={1} inputMode="numeric" value={pkg?.h ?? ""} onChange={(e) => pkg && setPkg({ ...pkg, h: e.target.value })} /></div>
      </div>
      <button type="button" className="btn light sm" disabled={loading || !pkg?.weight} onClick={() => findCouriers(pkg?.weight)}>
        <Icon name="refresh" className="icon sm" /> Update courier rates
      </button>

      <div className="section-title mt-24">Courier</div>
      {loading ? (
        <div className="row small muted"><span className="spinner sm" /> Checking couriers for PIN {order.shipping_address.pincode}…</div>
      ) : quote ? (
        <div className="courier-list" role="radiogroup" aria-label="Courier">
          {quote.couriers.map((c) => (
            <label key={c.id} className={`courier ${courier === c.id ? "on" : ""}`}>
              <input type="radio" name="courier" checked={courier === c.id} onChange={() => setCourier(c.id)} />
              <span className="grow">
                <b>{c.name}</b>
                {c.recommended && <span className="badge tone-ok" style={{ marginLeft: 8 }}>Recommended</span>}
                <span className="xs muted" style={{ display: "block" }}>
                  {c.etd ? `Delivery by ${c.etd}` : c.days ? `${c.days} days` : "Delivery estimate not available"}
                </span>
              </span>
              <b>₹{c.rate.toFixed(0)}</b>
            </label>
          ))}
        </div>
      ) : (
        <p className="small muted">No courier options loaded.</p>
      )}

      <div className="row mt-24" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn gold" disabled={busy || loading || !courier} onClick={ship}>
          {busy ? "Booking…" : "Ship & request pickup"}
        </button>
      </div>
    </>
  );
}

function ManualShipForm({ order, onClose, onDone }: { order: OrderAdmin; onClose(): void; onDone(o: OrderAdmin): void }) {
  const toast = useToast();
  const { settings: storeSettings } = useStore();
  const [f, setF] = useState({ partner: storeSettings.shipping_partner_name, awb: "", tracking_url: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const o = await api<OrderAdmin>(`/api/admin/orders/${order.order_number}/ship`, {
        body: { method: "manual", partner: f.partner.trim() || null, awb: f.awb.trim(), tracking_url: f.tracking_url.trim() || null },
      });
      toast("Shipment created. Customer can now track the order.", "success");
      onDone(o);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <form onSubmit={submit}>
        <div className="note-box mb-16">
          Book the pickup on your delivery partner's portal or app (or drop it at India Post), then enter the AWB / tracking number here.
          {order.payment_method === "COD" && order.payment_status !== "PAID" && <><br /><b>COD order:</b> ask the partner to collect {money(order.total)}.</>}
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="field">
          <label htmlFor="s-partner">Delivery partner</label>
          <input id="s-partner" className="input" required value={f.partner} onChange={(e) => setF({ ...f, partner: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="s-awb">AWB / tracking number</label>
          <input id="s-awb" className="input mono" required value={f.awb} onChange={(e) => setF({ ...f, awb: e.target.value })} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="s-url">Tracking link (optional)</label>
          <input id="s-url" className="input" type="url" placeholder="Leave empty to use the template from Settings" value={f.tracking_url} onChange={(e) => setF({ ...f, tracking_url: e.target.value })} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn gold" disabled={busy}>{busy ? "Saving…" : "Mark as shipped"}</button>
        </div>
      </form>
    </>
  );
}

/** Admin settings (parcel defaults + integration status), fetched once per page view. */
let adminSettingsCache: Promise<AdminSettings> | null = null;
function useAdminSettings() {
  const [data, setData] = useState<AdminSettings | null>(null);
  useEffect(() => {
    adminSettingsCache ??= api<AdminSettings>("/api/admin/settings");
    adminSettingsCache.then(setData).catch(() => {
      adminSettingsCache = null;
    });
    return () => {
      adminSettingsCache = null; // refetch next time the page opens (settings may have changed)
    };
  }, []);
  return { settings: data?.store ?? null, integrations: data?.integrations ?? null };
}

function CancelModal({ order, onClose, onDone }: { order: OrderAdmin; onClose(): void; onDone(o: OrderAdmin): void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const refund = order.payment_status === "PAID" && order.payment_method === "ONLINE";
  const submit = async () => {
    setBusy(true);
    try {
      const o = await api<OrderAdmin>(`/api/admin/orders/${order.order_number}/cancel`, { body: { reason: reason.trim() || null } });
      toast(refund ? "Order cancelled and refund initiated" : "Order cancelled", "success");
      onDone(o);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };
  return (
    <Modal title="Cancel order?" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Keep order</button><button className="btn danger" disabled={busy} onClick={submit}>{busy ? "Cancelling…" : "Cancel order"}</button></>}>
      <p>Stock will be returned to inventory.{refund && <> A full refund of <b>{money(order.total)}</b> will be issued through Cashfree.</>}</p>
      <div className="field">
        <label htmlFor="c-reason">Reason (shown to the customer)</label>
        <input id="c-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item out of stock" />
      </div>
    </Modal>
  );
}
