import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AddressForm from "../../components/AddressForm";
import Designer, { type DesignerInitial, type DesignerResult } from "../../components/designer/Designer";
import Icon from "../../components/Icon";
import { usePayment } from "../../components/Payment";
import { Empty, Img, Loader } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { loadDesign } from "../../lib/designState";
import { SIDE_LABEL, money } from "../../lib/format";
import type { Address, AddressInput, CustomProduct, Order, PaymentSession, PrintSide, SavedDesign } from "../../lib/types";

export default function Customize() {
  const { user } = useAuth();
  const { settings } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { pay, modal } = usePayment();

  const [products, setProducts] = useState<CustomProduct[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [initial, setInitial] = useState<DesignerInitial | null>(null);
  const [result, setResult] = useState<DesignerResult | null>(null);

  // Checkout step
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<"ONLINE" | "COD">("ONLINE");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = sp.get("design");
    (async () => {
      try {
        const list = await api<CustomProduct[]>("/api/custom/products");
        setProducts(list);
        if (!token) return setInitial({});
        const d = await api<SavedDesign>(`/api/custom/designs/shared/${token}`);
        setInitial({
          productId: d.product_id, color: d.color, design: await loadDesign(d.data.design.sides, d.data.roster || []),
          roster: d.data.roster || [], sizes: d.data.sizes || {}, glow: !!d.data.glow,
          saved: d.is_owner ? { id: d.id, token: d.token, name: d.name } : null,
        });
        if (!d.is_owner) toast("Opened a shared design. Changes you make are your own copy.", "success");
      } catch (e) {
        if (token) {
          toast((e as Error).message, "error");
          setInitial({});
        } else setLoadErr((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAddresses = useCallback(() => {
    api<Address[]>("/api/me/addresses").then((list) => {
      setAddresses(list);
      setAdding(list.length === 0);
      setAddressId((cur) => cur ?? list.find((a) => a.is_default)?.id ?? list[0]?.id ?? null);
    });
  }, []);
  useEffect(() => {
    if (result && user && addresses === null) loadAddresses();
  }, [result, user, addresses, loadAddresses]);
  useEffect(() => {
    if (result?.quote && !result.quote.cod_enabled) setMethod("ONLINE");
  }, [result]);

  const saveAddress = async (data: AddressInput) => {
    const a = await api<Address>("/api/me/addresses", { body: data });
    setAddressId(a.id);
    loadAddresses();
    setAdding(false);
  };

  const placeOrder = async () => {
    if (!result) return;
    if (!addressId) return setError("Please add a delivery address");
    setError("");
    setPlacing(true);
    try {
      const r = await api<{ order: Order; payment: PaymentSession | null }>("/api/custom/orders", {
        body: {
          lines: result.lines,
          design: result.saved.payload,
          roster: result.roster,
          glow: result.glow,
          address_id: addressId,
          payment_method: method,
          notes: notes.trim() || null,
        },
      });
      const number = r.order.order_number;
      if (r.payment) {
        try {
          await pay(r.payment, number, r.order.total);
        } catch (e) {
          toast((e as Error).message, "error");
        }
      }
      nav(`/order/${number}/status`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setPlacing(false);
    }
  };

  if (!settings.custom_print_enabled || loadErr)
    return <div className="container"><Empty title="Custom printing is not available right now">{loadErr}</Empty></div>;
  if (!products || !initial) return <Loader />;
  if (!products.length)
    return (
      <div className="container">
        <Empty title="Custom printing is coming soon">
          <p className="muted">We're getting our blank T-shirts ready. Please check back shortly.</p>
          <Link to="/shop" className="btn mt-16">Shop the collection</Link>
        </Empty>
      </div>
    );

  /* ---------- Step 2: review + delivery + payment ---------- */
  if (result && result.quote) {
    const q = result.quote;
    return (
      <div className="container">
        <div className="page-head">
          <div className="crumbs"><button className="link" onClick={() => setResult(null)}>Design</button> / Review & order</div>
          <h1>Review your custom T-shirt</h1>
        </div>
        <div className="cart-page">
          <div>
            <section className="card co-step">
              <div className="step-head"><span className="num"><Icon name="check" className="icon sm" /></span><h3>Final preview</h3></div>
              <div className={`custom-finals n${Math.min(result.saved.previews.length, 2)}`}>
                {result.saved.previews.map((p) => (
                  <figure key={p.side} className="custom-final">
                    <img src={p.src} alt={`${SIDE_LABEL[p.side as PrintSide]} of your T-shirt`} />
                    <figcaption>{SIDE_LABEL[p.side as PrintSide]}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="small center mt-8">
                {result.product.name} · {result.color} · {q.lines.map((l) => `${l.size} × ${l.quantity}`).join(", ")}
                {result.glow && " · Glow in the dark"}
              </div>
              {result.roster && (
                <details className="mt-8 small"><summary>Names & numbers ({result.roster.length})</summary>
                  <ul className="xs" style={{ columns: 2 }}>{result.roster.map((r, i) => <li key={i}>{r.size} · {r.name || "-"} {r.number && `#${r.number}`}</li>)}</ul>
                </details>
              )}
              <p className="xs muted center">Our team checks every design before printing and will contact you if anything needs fixing.</p>
              <div className="center"><button className="btn light sm" onClick={() => setResult(null)}><Icon name="edit" className="icon sm" /> Edit design</button></div>
            </section>

            <section className="card co-step">
              <div className="step-head"><span className="num">1</span><h3>Delivery address</h3></div>
              {addresses === null ? (
                <div className="spinner sm" />
              ) : adding ? (
                <AddressForm
                  initial={{ name: user!.name, phone: user!.phone || "", is_default: addresses.length === 0 }}
                  onSubmit={saveAddress}
                  onCancel={addresses.length ? () => setAdding(false) : undefined}
                  submitLabel="Save & Deliver here"
                />
              ) : (
                <div className="addr-grid">
                  {addresses.map((a) => (
                    <button key={a.id} className={`addr-card ${a.id === addressId ? "on" : ""}`} onClick={() => setAddressId(a.id)}>
                      <b>{a.name}</b>
                      <div className="muted small mt-8">
                        {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
                        {a.city}, {a.state} - {a.pincode}<br />
                        Phone: {a.phone}
                      </div>
                    </button>
                  ))}
                  <button className="addr-card add" onClick={() => setAdding(true)}>
                    <span><Icon name="plus" className="icon sm" /> Add new address</span>
                  </button>
                </div>
              )}
            </section>

            <section className="card co-step">
              <div className="step-head"><span className="num">2</span><h3>Payment method</h3></div>
              <label className={`pay-opt ${method === "ONLINE" ? "on" : ""}`}>
                <input type="radio" name="pm" checked={method === "ONLINE"} onChange={() => setMethod("ONLINE")} />
                <div>
                  <b>Pay online</b>
                  <div className="muted small">UPI, debit/credit cards, net banking and wallets. Secured by Cashfree.</div>
                </div>
              </label>
              <label className={`pay-opt ${method === "COD" ? "on" : ""} ${!q.cod_enabled ? "disabled" : ""}`}>
                <input type="radio" name="pm" checked={method === "COD"} disabled={!q.cod_enabled} onChange={() => setMethod("COD")} />
                <div>
                  <b>Cash on delivery</b>
                  <div className="muted small">{q.cod_enabled ? "Pay when your order arrives." : "Not available for custom printed orders"}</div>
                </div>
              </label>
              <div className="field mt-16">
                <label htmlFor="c-notes">Note for our print team (optional)</label>
                <textarea id="c-notes" className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. print slightly lower, match the logo colour exactly" />
              </div>
            </section>
          </div>

          <aside className="card summary">
            <h3>Order summary</h3>
            <div className="line-item" style={{ padding: "10px 0" }}>
              <Img src={result.saved.previews[0]?.src} alt="" className="thumb s56" />
              <div className="info">
                <div className="title small">Custom print · {q.product_name}</div>
                <div className="meta">{q.color} · {q.quantity} pc</div>
              </div>
              <span className="small bold">{money(q.subtotal)}</span>
            </div>
            <div className="divider" />
            <div className="sum-row"><span className="muted">{money(q.unit_price)} × {q.quantity}</span><span>{money(q.subtotal)}</span></div>
            {!!q.discount && <div className="sum-row save"><span>Bulk discount {q.discount_percent}%</span><span>−{money(q.discount)}</span></div>}
            <div className="sum-row"><span className="muted">Shipping</span><span>{q.shipping_fee ? money(q.shipping_fee) : "Free"}</span></div>
            <div className="sum-row total"><span>Total</span><span>{money(q.total)}</span></div>
            {error && <div className="form-error mt-16">{error}</div>}
            <button className="btn block lg mt-16" disabled={placing || !addressId || adding} onClick={placeOrder}>
              {placing ? "Processing…" : method === "COD" ? `Place order · ${money(q.total)}` : `Pay ${money(q.total)}`}
            </button>
            <div className="secure-note"><Icon name="shield" className="icon sm" /> 100% secure payments</div>
            <p className="xs muted mt-8">Custom printed items are made just for you, so they can't be returned unless they arrive damaged or misprinted.</p>
          </aside>
        </div>
        {modal}
      </div>
    );
  }

  /* ---------- Step 1: design ---------- */
  return (
    <div className="container dz-page">
      <div className="dz-head">
        <h1>Design your own T-shirt</h1>
        <p className="muted">Add photos, text, art or names and numbers to the front, back and sleeves. See exactly how it looks before you order.</p>
      </div>
      <Designer products={products} initial={initial} continueLabel="Review & order" onContinue={(r) => { setResult(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
    </div>
  );
}
