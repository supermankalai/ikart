import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import { Empty, Img } from "../../components/ui";
import { useCart } from "../../context/cart";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import type { Quote } from "../../lib/types";

export default function Cart() {
  const { items, setQty, remove } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!items.length) return setQuote(null);
    api<Quote>("/api/cart/quote", { body: { items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })) } })
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [items]);

  if (!items.length)
    return (
      <div className="container">
        <Empty title="Your bag is empty">
          <p>Looks like you haven't added anything yet.</p>
          <Link to="/shop" className="btn mt-16">Start shopping</Link>
        </Empty>
      </div>
    );

  const line = (vid: number) => quote?.lines.find((l) => l.variant_id === vid);

  return (
    <div className="container">
      <div className="page-head">
        <h1>Your bag</h1>
      </div>
      <div className="cart-page">
        <div className="card">
          {items.map((i) => {
            const l = line(i.variant_id);
            const price = l?.unit_price ?? i.price;
            return (
              <div className="line-item" key={i.variant_id}>
                <Link to={`/product/${i.slug}`}>
                  <Img src={i.image} alt={i.name} className="thumb s72" />
                </Link>
                <div className="info">
                  <Link to={`/product/${i.slug}`} className="title">{i.name}</Link>
                  <div className="meta">{i.color} · Size {i.size} · {money(price)}</div>
                  {l?.issue && <div className="issue">{l.issue}</div>}
                  <div className="row mt-8">
                    <div className="qty sm">
                      <button onClick={() => setQty(i.variant_id, i.quantity - 1)} aria-label="Decrease">−</button>
                      <span>{i.quantity}</span>
                      <button onClick={() => setQty(i.variant_id, i.quantity + 1)} disabled={!!l && i.quantity >= l.stock} aria-label="Increase">+</button>
                    </div>
                    <button className="link small" onClick={() => remove(i.variant_id)}>Remove</button>
                  </div>
                </div>
                <b>{money(price * i.quantity)}</b>
              </div>
            );
          })}
        </div>
        <div className="card summary">
          <h3>Order summary</h3>
          <div className="sum-row"><span className="muted">Subtotal</span><span>{money(quote?.subtotal ?? 0)}</span></div>
          <div className="sum-row">
            <span className="muted">Shipping</span>
            <span>{quote ? (quote.shipping_fee ? money(quote.shipping_fee) : "Free") : "–"}</span>
          </div>
          <div className="sum-row total"><span>Total</span><span>{money(quote?.total ?? 0)}</span></div>
          {quote?.has_issues && (
            <div className="form-error mt-16">Some items need your attention before checkout.</div>
          )}
          <button className="btn block lg mt-16" disabled={!quote || quote.has_issues} onClick={() => nav("/checkout")}>
            Proceed to checkout
          </button>
          <div className="secure-note"><Icon name="shield" className="icon sm" /> Secure checkout powered by Cashfree</div>
        </div>
      </div>
    </div>
  );
}
