import { useEffect, useState, type FormEvent } from "react";
import Icon from "../../components/Icon";
import { Loader } from "../../components/ui";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import type { AdminSettings, StoreSettings } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

export default function Settings() {
  const [data, setData] = useState<AdminSettings | null>(null);
  const [f, setF] = useState<StoreSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toast = useToast();
  const { reloadCatalog } = useStore();

  useEffect(() => {
    api<AdminSettings>("/api/admin/settings").then((d) => {
      setData(d);
      setF(d.store);
    });
  }, []);

  if (!data || !f) return <Loader />;
  const set = (k: keyof StoreSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.type === "number" ? Number(e.target.value) : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<AdminSettings>("/api/admin/settings", { method: "PUT", body: f });
      setF(r.store);
      reloadCatalog();
      toast("Settings saved", "success");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const i = data.integrations;

  return (
    <form onSubmit={submit}>
      <AdminTop title="Settings">
        <button className="btn sm" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </AdminTop>
      {err && <div className="form-error">{err}</div>}
      <div className="grid-cards">
        <div className="card">
          <h3>Store details</h3>
          <div className="field"><label htmlFor="s-name">Store name</label><input id="s-name" className="input" value={f.store_name} onChange={set("store_name")} /></div>
          <div className="field"><label htmlFor="s-tag">Tagline</label><input id="s-tag" className="input" value={f.tagline} onChange={set("tagline")} /></div>
          <div className="field"><label htmlFor="s-ann">Announcement bar (top of every page)</label><input id="s-ann" className="input" value={f.announcement} onChange={set("announcement")} placeholder="Leave empty to hide" /></div>
          <div className="grid-2">
            <div className="field"><label htmlFor="s-phone">Support phone</label><input id="s-phone" className="input" value={f.support_phone} onChange={set("support_phone")} /></div>
            <div className="field"><label htmlFor="s-email">Support email</label><input id="s-email" className="input" type="email" value={f.support_email} onChange={set("support_email")} /></div>
          </div>
          <div className="field"><label htmlFor="s-ig">Instagram URL</label><input id="s-ig" className="input" type="url" value={f.instagram_url} onChange={set("instagram_url")} /></div>
          <div className="section-title mt-16">Business details (shown on Contact & Terms pages)</div>
          <div className="field"><label htmlFor="s-biz">Legal business name</label><input id="s-biz" className="input" value={f.business_name} onChange={set("business_name")} placeholder="e.g. iKart Retail / your name as on PAN or GST" /></div>
          <div className="field"><label htmlFor="s-addr">Registered business address</label><textarea id="s-addr" className="input" rows={3} value={f.business_address} onChange={set("business_address")} placeholder="Door no, street, city, state, PIN code" /></div>
          <div className="field"><label htmlFor="s-jur">Jurisdiction city (for Terms)</label><input id="s-jur" className="input" value={f.jurisdiction_city} onChange={set("jurisdiction_city")} placeholder="e.g. Chennai" /></div>
        </div>

        <div className="card">
          <h3>Shipping & checkout</h3>
          <div className="grid-2">
            <div className="field"><label htmlFor="s-free">Free shipping above (₹)</label><input id="s-free" className="input" type="number" min={0} value={f.free_shipping_above} onChange={set("free_shipping_above")} /></div>
            <div className="field"><label htmlFor="s-fee">Shipping fee (₹)</label><input id="s-fee" className="input" type="number" min={0} value={f.shipping_fee} onChange={set("shipping_fee")} /></div>
            <div className="field"><label htmlFor="s-ret">Return window (days)</label><input id="s-ret" className="input" type="number" min={0} value={f.return_days} onChange={set("return_days")} /></div>
            <div className="field"><label htmlFor="s-codmax">COD max order (₹, 0 = no limit)</label><input id="s-codmax" className="input" type="number" min={0} value={f.cod_max_order} onChange={set("cod_max_order")} /></div>
          </div>
          <label className="check" style={{ display: "flex" }}>
            <span className="switch"><input type="checkbox" checked={f.cod_enabled} onChange={set("cod_enabled")} /><i /></span>
            Offer cash on delivery
          </label>

          <div className="section-title mt-16">Custom printed T-shirts</div>
          <label className="check" style={{ display: "flex" }}>
            <span className="switch"><input type="checkbox" checked={f.custom_print_enabled} onChange={set("custom_print_enabled")} /><i /></span>
            Show "Design your own T-shirt" in the store
          </label>
          <div className="grid-2 mt-8">
            <div className="field"><label htmlFor="s-cpp">Front print charge (₹)</label><input id="s-cpp" className="input" type="number" min={0} value={f.custom_print_price} onChange={set("custom_print_price")} /></div>
            <div className="field"><label htmlFor="s-cbp">Back print charge (₹)</label><input id="s-cbp" className="input" type="number" min={0} value={f.custom_back_print_price} onChange={set("custom_back_print_price")} /></div>
            <div className="field"><label htmlFor="s-csp">Sleeve print, each (₹)</label><input id="s-csp" className="input" type="number" min={0} value={f.custom_sleeve_print_price} onChange={set("custom_sleeve_print_price")} /></div>
            <div className="field"><label htmlFor="s-cfp">Gold/silver foil, per side (₹)</label><input id="s-cfp" className="input" type="number" min={0} value={f.custom_foil_price} onChange={set("custom_foil_price")} /></div>
            <div className="field"><label htmlFor="s-cgp">Glow in the dark, per piece (₹)</label><input id="s-cgp" className="input" type="number" min={0} value={f.custom_glow_price} onChange={set("custom_glow_price")} /></div>
            <div className="field"><label htmlFor="s-cnp">Name, per piece (₹)</label><input id="s-cnp" className="input" type="number" min={0} value={f.custom_name_price} onChange={set("custom_name_price")} /></div>
            <div className="field"><label htmlFor="s-cnu">Number, per piece (₹)</label><input id="s-cnu" className="input" type="number" min={0} value={f.custom_number_price} onChange={set("custom_number_price")} /></div>
            <div className="field"><label htmlFor="s-cmq">Max pieces per order</label><input id="s-cmq" className="input" type="number" min={1} max={500} value={f.custom_max_qty} onChange={set("custom_max_qty")} /></div>
          </div>
          <div className="dz-label">Bulk discounts</div>
          {(f.custom_bulk_tiers || []).map((t, i) => (
            <div key={i} className="row mb-8">
              <span className="small">From</span>
              <input className="input sm" style={{ width: 80 }} type="number" min={2} value={t.min_qty} aria-label="Minimum pieces"
                onChange={(e) => setF({ ...f, custom_bulk_tiers: f.custom_bulk_tiers.map((x, k) => (k === i ? { ...x, min_qty: Number(e.target.value) } : x)) })} />
              <span className="small">pcs:</span>
              <input className="input sm" style={{ width: 70 }} type="number" min={1} max={90} value={t.percent} aria-label="Discount percent"
                onChange={(e) => setF({ ...f, custom_bulk_tiers: f.custom_bulk_tiers.map((x, k) => (k === i ? { ...x, percent: Number(e.target.value) } : x)) })} />
              <span className="small">% off</span>
              <button type="button" className="icon-btn" aria-label="Remove tier" onClick={() => setF({ ...f, custom_bulk_tiers: f.custom_bulk_tiers.filter((_, k) => k !== i) })}><Icon name="trash" className="icon sm" /></button>
            </div>
          ))}
          {(f.custom_bulk_tiers || []).length < 6 && (
            <button type="button" className="btn light sm mb-16" onClick={() => setF({ ...f, custom_bulk_tiers: [...(f.custom_bulk_tiers || []), { min_qty: 100, percent: 20 }] })}>
              <Icon name="plus" className="icon sm" /> Add discount tier
            </button>
          )}
          <div className="grid-2">
            <div className="field"><label htmlFor="s-ai">AI images per customer per day</label><input id="s-ai" className="input" type="number" min={0} max={100} value={f.ai_daily_limit} onChange={set("ai_daily_limit")} /></div>
          </div>
          <div className="xs muted" style={{ marginTop: -6, marginBottom: 12 }}>AI images appear only when OPENAI_API_KEY is set in backend/.env. 0 turns them off.</div>
          <label className="check" style={{ display: "flex" }}>
            <span className="switch"><input type="checkbox" checked={f.custom_cod_enabled} onChange={set("custom_cod_enabled")} /><i /></span>
            Allow cash on delivery for custom orders
          </label>
          <div className="xs muted" style={{ marginTop: 4 }}>Mark which T-shirts can be customised in Products → edit → "Available for custom printing".</div>
        </div>

        <div className="card">
          <h3>Home page 3D rail</h3>
          <p className="small muted" style={{ marginTop: -6, marginBottom: 14 }}>
            The home page shows featured T-shirts and track pants hanging on a rail, gently swaying and turning.
            Mark products as <b>Featured</b> to choose which ones appear.
          </p>
          <label className="check" style={{ display: "flex" }}>
            <span className="switch"><input type="checkbox" checked={f.hero_rail_photos} onChange={set("hero_rail_photos")} /><i /></span>
            Use product photos on the rail
          </label>
          <p className="hint mt-8">
            Works with the product's <b>first photo</b> when it shows the garment alone on a plain background (white, grey or one colour),
            laid flat or on a hanger. Photos with a model or a busy background are skipped automatically and shown as a 3D model in the product colour.
          </p>
        </div>

        <div className="card">
          <h3>Shiprocket delivery</h3>
          {i.shiprocket_configured ? (
            <div className="note-box" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
              Connected · pickup address <b>{i.shiprocket_pickup_location}</b>. Use <b>Create shipment</b> on an order to book a courier.
            </div>
          ) : (
            <div className="note-box warn">
              <b>Not connected.</b> In Shiprocket, go to Settings → API → Create API User, then add <code>SHIPROCKET_EMAIL</code> and{" "}
              <code>SHIPROCKET_PASSWORD</code> (the API user) to <code>backend/.env</code> and restart the server.
            </div>
          )}
          <div className="section-title mt-16">Default parcel</div>
          <div className="grid-2">
            <div className="field"><label htmlFor="s-wi">Weight per item (kg)</label><input id="s-wi" className="input" type="number" step="0.05" min={0.05} value={f.parcel_weight_per_item_kg} onChange={set("parcel_weight_per_item_kg")} /></div>
            <div className="field"><label htmlFor="s-wm">Minimum weight (kg)</label><input id="s-wm" className="input" type="number" step="0.05" min={0.05} value={f.parcel_min_weight_kg} onChange={set("parcel_min_weight_kg")} /></div>
          </div>
          <div className="grid-3">
            <div className="field"><label htmlFor="s-pl">Length (cm)</label><input id="s-pl" className="input" type="number" min={1} value={f.parcel_length_cm} onChange={set("parcel_length_cm")} /></div>
            <div className="field"><label htmlFor="s-pb">Breadth (cm)</label><input id="s-pb" className="input" type="number" min={1} value={f.parcel_breadth_cm} onChange={set("parcel_breadth_cm")} /></div>
            <div className="field"><label htmlFor="s-ph">Height (cm)</label><input id="s-ph" className="input" type="number" min={1} value={f.parcel_height_cm} onChange={set("parcel_height_cm")} /></div>
          </div>
          <p className="hint" style={{ marginTop: -6 }}>Couriers charge by the higher of actual weight and box size, so keep these close to your real packed parcel.</p>
          <div className="section-title mt-16">Automatic tracking updates</div>
          <p className="small muted">
            In Shiprocket: Settings → API → Webhooks. URL: <code>{i.shipping_webhook_url}</code>, Token: the value of{" "}
            <code>SHIPPING_WEBHOOK_SECRET</code> in <code>backend/.env</code>. The URL must be your live HTTPS domain; on this PC, use{" "}
            <b>Refresh tracking</b> on the order page instead.
          </p>
          {!i.shipping_webhook_secret_set && <div className="note-box warn mt-8">Set a strong <code>SHIPPING_WEBHOOK_SECRET</code> in <code>backend/.env</code>.</div>}
        </div>

        <div className="card">
          <h3>Manual delivery (any courier)</h3>
          <p className="small muted" style={{ marginTop: -6, marginBottom: 14 }}>Used when you enter a tracking number by hand, e.g. India Post or a local courier.</p>
          <div className="field"><label htmlFor="s-partner">Default partner name</label><input id="s-partner" className="input" value={f.shipping_partner_name} onChange={set("shipping_partner_name")} placeholder="e.g. India Post" /></div>
          <div className="field">
            <label htmlFor="s-turl">Tracking link template</label>
            <input id="s-turl" className="input mono" value={f.tracking_url_template} onChange={set("tracking_url_template")} placeholder="https://partner.com/track?awb={awb}" />
            <span className="hint">{"{awb}"} is replaced with the tracking number, so customers get a one-click tracking link.</span>
          </div>
        </div>

        <div className="card">
          <h3>Cashfree payments</h3>
          {i.cashfree_mode === "cashfree" ? (
            <div className="note-box" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
              Connected · <b>{i.cashfree_env === "production" ? "LIVE (production)" : "Sandbox (testing)"}</b>
            </div>
          ) : (
            <div className="note-box warn">
              <b>Test mode.</b> Cashfree keys are not set, so online payments are simulated. Add <code>CASHFREE_APP_ID</code> and{" "}
              <code>CASHFREE_SECRET_KEY</code> to <code>backend/.env</code> and restart the server.
            </div>
          )}
          <p className="small muted mt-16">
            For security, API keys live only on the server (in <code>.env</code>), never in the database or browser.
            In the Cashfree dashboard, set the webhook URL to <code>{i.backend_url}/api/payments/webhook</code> (must be HTTPS).
          </p>
        </div>
      </div>
    </form>
  );
}
