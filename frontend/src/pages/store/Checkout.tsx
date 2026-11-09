import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import AddressForm from "../../components/AddressForm";
import Icon from "../../components/Icon";
import { usePayment } from "../../components/Payment";
import { Empty, Img, Loader } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useCart } from "../../context/cart";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import type { Address, AddressInput, Order, PaymentSession, Quote } from "../../lib/types";

export default function Checkout() {
  const { user, ready } = useAuth();
  const { items, clear } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const { pay, modal } = usePayment();

  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [method, setMethod] = useState<"ONLINE" | "COD">("ONLINE");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  const loadAddresses = useCallback(() => {
    api<Address[]>("/api/me/addresses").then((list) => {
      setAddresses(list);
      setAdding(list.length === 0);
      setAddressId((cur) => cur ?? list.find((a) => a.is_default)?.id ?? list[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (user) loadAddresses();
  }, [user, loadAddresses]);

  useEffect(() => {
    if (!items.length) return;
    api<Quote>("/api/cart/quote", {
      body: { items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })), coupon_code: coupon },
    }).then((q) => {
      setQuote(q);
      if (!q.cod_enabled) setMethod("ONLINE");
    });
  }, [items, coupon]);

  if (!ready) return <Loader />;
  if (!user) return <Navigate to="/login?next=/checkout" replace />;
  if (!items.length && !placing)
    return (
      <div className="container">
        <Empty title="Your bag is empty"><Link to="/shop" className="btn mt-16">Continue shopping</Link></Empty>
      </div>
    );

  const saveAddress = async (data: AddressInput) => {
    const a = await api<Address>("/api/me/addresses", { body: data });
    setAddressId(a.id);
    loadAddresses();
    setAdding(false);
  };

  const placeOrder = async () => {
    if (!addressId) return setError("Please add a delivery address");
    setError("");
    setPlacing(true);
    try {
      const r = await api<{ order: Order; payment: PaymentSession | null }>("/api/orders", {
        body: {
          items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
          address_id: addressId,
          payment_method: method,
          coupon_code: quote?.coupon_valid ? coupon : null,
        },
      });
      clear();
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

  return (
    <div className="container">
      <div className="page-head">
        <div className="crumbs"><Link to="/cart">Bag</Link> / Checkout</div>
        <h1>Checkout</h1>
      </div>
      <div className="cart-page">
        <div>
          <section className="card co-step">
            <div className="step-head"><span className="num">1</span><h3>Delivery address</h3></div>
            {addresses === null ? (
              <div className="spinner sm" />
            ) : adding ? (
              <AddressForm
                initial={{ name: user.name, phone: user.phone || "", is_default: addresses.length === 0 }}
                onSubmit={saveAddress}
                onCancel={addresses.length ? () => setAdding(false) : undefined}
                submitLabel="Deliver here"
              />
            ) : (
              <div className="addr-grid">
                {addresses.map((a) => (
                  <button key={a.id} className={`addr-card ${a.id === addressId ? "on" : ""}`} onClick={() => setAddressId(a.id)}>
                    <b>{a.name}</b>
                    {a.is_default && <span className="badge tone-neutral" style={{ marginLeft: 8 }}>Default</span>}
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
                <div className="pay-logos"><span>UPI</span><span>VISA</span><span>Mastercard</span><span>RuPay</span><span>Net Banking</span></div>
              </div>
            </label>
            <label className={`pay-opt ${method === "COD" ? "on" : ""} ${quote && !quote.cod_enabled ? "disabled" : ""}`}>
              <input type="radio" name="pm" checked={method === "COD"} disabled={!!quote && !quote.cod_enabled} onChange={() => setMethod("COD")} />
              <div>
                <b>Cash on delivery</b>
                <div className="muted small">
                  {quote && !quote.cod_enabled ? "Not available for this order" : "Pay in cash or UPI when your order arrives."}
                </div>
              </div>
            </label>
          </section>
        </div>

        <aside className="card summary">
          <h3>Order summary</h3>
          {(quote?.lines || []).map((l) => (
            <div className="line-item" key={l.variant_id} style={{ padding: "10px 0" }}>
              <Img src={l.image} alt={l.product_name} className="thumb s56" />
              <div className="info">
                <div className="title small">{l.product_name}</div>
                <div className="meta">{l.color} · {l.size} · Qty {l.quantity}</div>
                {l.issue && <div className="issue">{l.issue}</div>}
              </div>
              <span className="small bold">{money(l.line_total)}</span>
            </div>
          ))}
          <div className="divider" />
          {coupon && quote?.coupon_valid ? (
            <div className="row between small" style={{ background: "var(--ok-soft)", padding: "10px 12px", borderRadius: 10 }}>
              <span><b>{quote.coupon_code}</b> applied</span>
              <button className="link" onClick={() => { setCoupon(null); setCouponInput(""); }}>Remove</button>
            </div>
          ) : (
            <form className="coupon-row" onSubmit={(e) => { e.preventDefault(); setCoupon(couponInput.trim() || null); }}>
              <input className="input" placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} aria-label="Coupon code" />
              <button className="btn light">Apply</button>
            </form>
          )}
          {coupon && quote?.coupon_valid === false && <div className="small mt-8" style={{ color: "var(--bad)" }}>{quote.coupon_message}</div>}

          <div className="mt-16">
            <div className="sum-row"><span className="muted">Subtotal</span><span>{money(quote?.subtotal ?? 0)}</span></div>
            {!!quote?.discount && <div className="sum-row save"><span>Coupon discount</span><span>−{money(quote.discount)}</span></div>}
            <div className="sum-row"><span className="muted">Shipping</span><span>{quote ? (quote.shipping_fee ? money(quote.shipping_fee) : "Free") : "–"}</span></div>
            <div className="sum-row total"><span>Total</span><span>{money(quote?.total ?? 0)}</span></div>
          </div>
          {error && <div className="form-error mt-16">{error}</div>}
          <button className="btn block lg mt-16" disabled={placing || !quote || quote.has_issues || !addressId || adding} onClick={placeOrder}>
            {placing ? "Processing…" : method === "COD" ? `Place order · ${money(quote?.total ?? 0)}` : `Pay ${money(quote?.total ?? 0)}`}
          </button>
          <div className="secure-note"><Icon name="shield" className="icon sm" /> 100% secure payments</div>
        </aside>
      </div>
      {modal}
    </div>
  );
}
