import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { usePayment } from "../../components/Payment";
import { Loader } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import type { Order, PaymentSession } from "../../lib/types";

/** Landing page after checkout / Cashfree redirect. Always confirms the real status with the server. */
export default function OrderStatus() {
  const { number } = useParams();
  const { user, ready } = useAuth();
  const toast = useToast();
  const { pay, modal } = usePayment();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = useCallback(async () => {
    const o = await api<Order>("/api/payments/verify", { body: { order_number: number } });
    setOrder(o);
    return o;
  }, [number]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        let o = await verify();
        // Payment confirmations can take a few seconds to reach the server
        for (let i = 0; i < 3 && !cancelled && o.status === "PENDING_PAYMENT" && o.payment_method === "ONLINE"; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          o = await verify();
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, verify]);

  if (!ready) return <Loader />;
  if (!user) return <Navigate to={`/login?next=/order/${number}/status`} replace />;
  if (error) return <div className="container status-hero"><h1>Something went wrong</h1><p className="muted">{error}</p></div>;
  if (!order) return <div className="container status-hero"><div className="spinner" /><p className="muted mt-16">Confirming your order…</p></div>;

  const retry = async () => {
    setBusy(true);
    try {
      const s = await api<PaymentSession>(`/api/orders/${order.order_number}/pay`, { method: "POST" });
      await pay(s, order.order_number, order.total);
      await verify();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const pending = order.status === "PENDING_PAYMENT";
  const cancelled = order.status === "CANCELLED";

  return (
    <div className="container narrow">
      <div className="status-hero">
        <div className={`status-ic ${cancelled ? "bad" : pending ? "warn" : "ok"}`}>
          <Icon name={cancelled ? "x" : pending ? "clock" : "check"} />
        </div>
        {pending ? (
          <>
            <h1>Payment not completed</h1>
            <p className="muted">Your order <b>#{order.order_number}</b> is reserved for a short time. Complete the payment to confirm it.</p>
            <div className="row wrap" style={{ justifyContent: "center", marginTop: 24 }}>
              <button className="btn lg" onClick={retry} disabled={busy}>{busy ? "Opening…" : `Pay ${money(order.total)}`}</button>
              <Link to={`/account/orders/${order.order_number}`} className="btn ghost lg">View order</Link>
            </div>
          </>
        ) : cancelled ? (
          <>
            <h1>Order cancelled</h1>
            <p className="muted">Order #{order.order_number} was cancelled. {order.payment_status === "REFUNDED" && "Your refund has been initiated."}</p>
            <Link to="/shop" className="btn mt-24">Continue shopping</Link>
          </>
        ) : (
          <>
            <h1>Thank you, {order.shipping_address.name.split(" ")[0]}!</h1>
            <p className="muted">
              Your order <b style={{ color: "var(--ink)" }}>#{order.order_number}</b> is confirmed.{" "}
              {order.payment_method === "COD"
                ? `Please keep ${money(order.total)} ready at delivery.`
                : `We've received your payment of ${money(order.total)}.`}
            </p>
            <div className="row wrap" style={{ justifyContent: "center", marginTop: 24 }}>
              <Link to={`/account/orders/${order.order_number}`} className="btn lg">Track order</Link>
              <Link to="/shop" className="btn ghost lg">Continue shopping</Link>
            </div>
          </>
        )}
      </div>
      <div className="card">
        <h3>Order details</h3>
        {order.items.map((i, idx) => (
          <div key={idx} className="sum-row">
            <span className="muted">{i.product_name} ({i.color}, {i.size}) × {i.quantity}</span>
            <span>{money(i.unit_price * i.quantity)}</span>
          </div>
        ))}
        {!!order.discount && <div className="sum-row save"><span>Discount</span><span>−{money(order.discount)}</span></div>}
        <div className="sum-row"><span className="muted">Shipping</span><span>{order.shipping_fee ? money(order.shipping_fee) : "Free"}</span></div>
        <div className="sum-row total"><span>Total</span><span>{money(order.total)}</span></div>
      </div>
      {modal}
    </div>
  );
}
