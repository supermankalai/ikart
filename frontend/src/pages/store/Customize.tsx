import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AddressForm from "../../components/AddressForm";
import { useDesignEditor } from "../../components/DesignEditor";
import Icon from "../../components/Icon";
import { usePayment } from "../../components/Payment";
import { Empty, Img, Loader } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { type EditorDesign, type SavedDesign, emptyDesign, printedSides, saveDesign } from "../../lib/designState";
import { SIDE_LABEL, money } from "../../lib/format";
import { sortSizes } from "../../lib/sizes";
import type { Address, AddressInput, CustomQuote, Order, PaymentSession, ProductDetail } from "../../lib/types";

export default function Customize() {
  const { user } = useAuth();
  const { settings } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const { pay, modal } = usePayment();

  const [products, setProducts] = useState<ProductDetail[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [design, setDesign] = useState<EditorDesign>(emptyDesign);
  const [quote, setQuote] = useState<CustomQuote | null>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedDesign | null>(null);

  // Checkout step
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<"ONLINE" | "COD">("ONLINE");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<ProductDetail[]>("/api/custom/products")
      .then((list) => {
        setProducts(list);
        if (list.length === 1) pickProduct(list[0]);
      })
      .catch((e) => setLoadErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colors = useMemo(() => {
    const m = new Map<string, string>();
    product?.variants.forEach((v) => !m.has(v.color) && m.set(v.color, v.color_hex || "#ffffff"));
    return [...m.entries()];
  }, [product]);
  const sizes = useMemo(() => sortSizes([...new Set(product?.variants.filter((v) => v.color === color).map((v) => v.size) || [])]), [product, color]);
  const variant = product?.variants.find((v) => v.color === color && v.size === size) || null;
  const colorHex = colors.find(([n]) => n === color)?.[1] || "#ffffff";
  const sides = printedSides(design);
  const sidesKey = sides.join(",");

  const editor = useDesignEditor({
    color: colorHex,
    design,
    setDesign: (fn) => { setDesign(fn); setSaved(null); },
    sidePrices: { front: `+${money(settings.custom_print_price)}`, back: `+${money(settings.custom_back_print_price)}` },
  });

  function pickProduct(p: ProductDetail) {
    setProduct(p);
    const firstInStock = p.variants.find((v) => v.stock > 0);
    setColor(firstInStock?.color || p.variants[0]?.color || "");
    setSize("");
    setQty(1);
    setSaved(null);
  }

  useEffect(() => {
    if (!variant || !sides.length) return setQuote(null);
    setQuoteErr("");
    api<CustomQuote>("/api/custom/quote", {
      body: { variant_id: variant.id, quantity: qty, front: sides.includes("front"), back: sides.includes("back") },
    })
      .then((q) => {
        setQuote(q);
        if (!q.cod_enabled) setMethod("ONLINE");
      })
      .catch((e) => {
        setQuote(null);
        setQuoteErr(e.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, qty, sidesKey]);

  const loadAddresses = useCallback(() => {
    api<Address[]>("/api/me/addresses").then((list) => {
      setAddresses(list);
      setAdding(list.length === 0);
      setAddressId((cur) => cur ?? list.find((a) => a.is_default)?.id ?? list[0]?.id ?? null);
    });
  }, []);
  useEffect(() => {
    if (saved && user && addresses === null) loadAddresses();
  }, [saved, user, addresses, loadAddresses]);

  const canSave = !!(product && variant && variant.stock > 0 && sides.length && quote && user);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      setSaved(await saveDesign(design, colorHex));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveAddress = async (data: AddressInput) => {
    const a = await api<Address>("/api/me/addresses", { body: data });
    setAddressId(a.id);
    loadAddresses();
    setAdding(false);
  };

  const placeOrder = async () => {
    if (!saved || !variant) return;
    if (!addressId) return setError("Please add a delivery address");
    setError("");
    setPlacing(true);
    try {
      const r = await api<{ order: Order; payment: PaymentSession | null }>("/api/custom/orders", {
        body: {
          variant_id: variant.id,
          quantity: qty,
          design: saved.payload,
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
  if (!products) return <Loader />;
  if (!products.length)
    return (
      <div className="container">
        <Empty title="Custom printing is coming soon">
          <p className="muted">We're getting our blank T-shirts ready. Please check back shortly.</p>
          <Link to="/shop" className="btn mt-16">Shop the collection</Link>
        </Empty>
      </div>
    );

  /* ---------- Step 2: final preview + delivery + payment ---------- */
  if (saved && quote && variant) {
    return (
      <div className="container">
        <div className="page-head">
          <div className="crumbs"><button className="link" onClick={() => setSaved(null)}>Design</button> / Review & order</div>
          <h1>Your custom T-shirt</h1>
        </div>
        <div className="cart-page">
          <div>
            <section className="card co-step">
              <div className="step-head"><span className="num"><Icon name="check" className="icon sm" /></span><h3>Final preview</h3></div>
              <div className={`custom-finals n${saved.previews.length}`}>
                {saved.previews.map((p) => (
                  <figure key={p.side} className="custom-final">
                    <img src={p.src} alt={`${SIDE_LABEL[p.side]} of your T-shirt`} />
                    <figcaption>{SIDE_LABEL[p.side]}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="muted small center mt-8">
                {product?.name} · {color} · Size {size} · {sides.map((s) => SIDE_LABEL[s]).join(" + ")} print. Our team checks every design before printing.
              </p>
              <div className="center"><button className="btn light sm" onClick={() => setSaved(null)}><Icon name="edit" className="icon sm" /> Edit design</button></div>
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
              <label className={`pay-opt ${method === "COD" ? "on" : ""} ${!quote.cod_enabled ? "disabled" : ""}`}>
                <input type="radio" name="pm" checked={method === "COD"} disabled={!quote.cod_enabled} onChange={() => setMethod("COD")} />
                <div>
                  <b>Cash on delivery</b>
                  <div className="muted small">{quote.cod_enabled ? "Pay when your order arrives." : "Not available for custom printed orders"}</div>
                </div>
              </label>
              <div className="field mt-16">
                <label htmlFor="c-notes">Note for our print team (optional)</label>
                <textarea id="c-notes" className="input" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. print slightly lower, keep the background transparent" />
              </div>
            </section>
          </div>

          <aside className="card summary">
            <h3>Order summary</h3>
            <div className="line-item" style={{ padding: "10px 0" }}>
              <Img src={saved.previews[0]?.src} alt="" className="thumb s56" />
              <div className="info">
                <div className="title small">Custom print · {quote.product_name}</div>
                <div className="meta">{quote.color} · {quote.size} · Qty {quote.quantity}</div>
              </div>
              <span className="small bold">{money(quote.subtotal)}</span>
            </div>
            <div className="divider" />
            <PriceLines q={quote} />
            <div className="sum-row"><span className="muted">Shipping</span><span>{quote.shipping_fee ? money(quote.shipping_fee) : "Free"}</span></div>
            <div className="sum-row total"><span>Total</span><span>{money(quote.total)}</span></div>
            {error && <div className="form-error mt-16">{error}</div>}
            <button className="btn block lg mt-16" disabled={placing || !addressId || adding} onClick={placeOrder}>
              {placing ? "Processing…" : method === "COD" ? `Place order · ${money(quote.total)}` : `Pay ${money(quote.total)}`}
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
    <div className="container">
      <div className="page-head">
        <div className="crumbs"><Link to="/">Home</Link> / Design your own</div>
        <h1>Design your own T-shirt</h1>
        <p className="muted">Pick a T-shirt, add your picture, logo or text on the front and back, and see exactly how it will look before you order.</p>
      </div>

      <div className="custom-layout">
        <div className="custom-stage">{editor.stage}</div>

        <div className="custom-steps">
          <section className="card co-step">
            <div className="step-head"><span className="num">1</span><h3>Choose your T-shirt</h3></div>
            <div className="custom-products">
              {products.map((p) => (
                <button key={p.id} className={`custom-product ${product?.id === p.id ? "on" : ""}`} onClick={() => pickProduct(p)}>
                  <Img src={p.images[0]} alt={p.name} className="thumb s56" />
                  <span>
                    <b>{p.name}</b>
                    <span className="muted small">from {money(p.price + settings.custom_print_price)} with print</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {product && (
            <section className="card co-step">
              <div className="step-head"><span className="num">2</span><h3>Colour & size</h3></div>
              <div className="opt-label" style={{ marginTop: 0 }}><span>Colour: <b>{color}</b></span></div>
              <div className="row wrap">
                {colors.map(([name, hex]) => (
                  <button
                    key={name}
                    className={`color-swatch ${name === color ? "on" : ""}`}
                    style={{ background: hex }}
                    title={name}
                    aria-label={name}
                    onClick={() => { setColor(name); setSize(""); setSaved(null); }}
                  />
                ))}
              </div>
              <div className="opt-label"><span>Size: <b>{size || "Select a size"}</b></span></div>
              <div className="row wrap">
                {sizes.map((s) => {
                  const st = product.variants.find((v) => v.color === color && v.size === s)?.stock ?? 0;
                  return (
                    <button key={s} className={`size-btn ${s === size ? "on" : ""}`} disabled={st <= 0} title={st <= 0 ? "Out of stock" : undefined}
                      onClick={() => { setSize(s); setQty(1); }}>
                      {s}
                    </button>
                  );
                })}
              </div>
              {variant && (
                <div className="row mt-16">
                  <span className="small">Quantity</span>
                  <div className="qty sm">
                    <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Less">−</button>
                    <span>{qty}</span>
                    <button onClick={() => setQty((q) => Math.min(variant.stock, 20, q + 1))} disabled={qty >= Math.min(variant.stock, 20)} aria-label="More">+</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {product && (
            <section className="card co-step">
              <div className="step-head"><span className="num">3</span><h3>Add your design</h3></div>
              {!user ? (
                <div className="note-box">
                  Please <Link className="link" to="/login?next=/customize">log in</Link> or{" "}
                  <Link className="link" to="/register?next=/customize">create an account</Link> to add your design.
                </div>
              ) : (
                editor.panel
              )}
            </section>
          )}

          {product && (
            <div className="card">
              {quote ? (
                <>
                  <PriceLines q={quote} />
                  <div className="sum-row total"><span>Price{qty > 1 ? ` × ${qty}` : ""}</span><span>{money(quote.subtotal)}</span></div>
                </>
              ) : (
                <div className="small muted">
                  {quoteErr || (!variant ? "Select a colour and size to see the price." : "Add an image or text to the front or back to see the price.")}
                </div>
              )}
              <button className="btn block lg mt-16" disabled={!canSave || saving} onClick={save}>
                {saving ? "Saving your design…" : "Save design & continue"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceLines({ q }: { q: CustomQuote }) {
  return (
    <>
      <div className="sum-row"><span className="muted">T-shirt</span><span>{money(q.tshirt_price)}</span></div>
      {!!q.front_print_price && <div className="sum-row"><span className="muted">Front print</span><span>{money(q.front_print_price)}</span></div>}
      {!!q.back_print_price && <div className="sum-row"><span className="muted">Back print</span><span>{money(q.back_print_price)}</span></div>}
      {q.quantity > 1 && <div className="sum-row"><span className="muted">Per T-shirt</span><span>{money(q.unit_price)} × {q.quantity}</span></div>}
    </>
  );
}
