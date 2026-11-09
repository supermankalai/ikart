import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import AddressForm from "../../components/AddressForm";
import Icon from "../../components/Icon";
import { Timeline, Tracker } from "../../components/OrderProgress";
import { usePayment } from "../../components/Payment";
import ProductCard from "../../components/ProductCard";
import { Empty, Img, Loader, Modal, PayBadge, StatusBadge } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import type { Address, AddressInput, Order, OrderSummary, Page, PaymentSession, ProductCard as P, User } from "../../lib/types";

export function AccountLayout() {
  const { user, ready, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  if (!ready) return <Loader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return (
    <div className="container">
      <div className="page-head">
        <h1>Hello, {user.name.split(" ")[0]}</h1>
        <p className="muted mt-8">{user.email}</p>
      </div>
      <div className="account">
        <nav className="account-nav">
          <NavLink to="/account/orders">My orders</NavLink>
          <NavLink to="/account/wishlist">Wishlist</NavLink>
          <NavLink to="/account/addresses">Addresses</NavLink>
          <NavLink to="/account/profile">Profile & password</NavLink>
          {user.is_admin && <NavLink to="/admin">Admin portal</NavLink>}
          <button onClick={() => { logout(); nav("/"); }}>Sign out</button>
        </nav>
        <div><Outlet /></div>
      </div>
    </div>
  );
}

export function MyOrders() {
  const [data, setData] = useState<Page<OrderSummary> | null>(null);
  useEffect(() => {
    api<Page<OrderSummary>>("/api/orders", { query: { page_size: 50 } }).then(setData).catch(() => setData({ items: [], total: 0, page: 1, page_size: 50 }));
  }, []);
  if (!data) return <Loader />;
  if (!data.items.length)
    return <Empty title="No orders yet" icon="box"><p>When you place an order, it will appear here.</p><Link to="/shop" className="btn mt-16">Start shopping</Link></Empty>;
  return (
    <div>
      {data.items.map((o) => (
        <Link key={o.order_number} to={`/account/orders/${o.order_number}`} className="order-row">
          <Img src={o.first_image} alt="" className="thumb s56" />
          <div className="grow">
            <div className="row wrap" style={{ gap: 8 }}>
              <b>#{o.order_number}</b> <StatusBadge status={o.status} />
            </div>
            <div className="muted small mt-8">
              {fmtDate(o.created_at)} · {o.item_count} item{o.item_count > 1 ? "s" : ""} · {money(o.total)}
            </div>
          </div>
          <Icon name="chevron" className="icon sm" />
        </Link>
      ))}
    </div>
  );
}

export function MyOrderDetail() {
  const { number } = useParams();
  const toast = useToast();
  const { pay, modal } = usePayment();
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Order>(`/api/orders/${number}`).then(setOrder).catch((e) => setErr(e.message));
  }, [number]);
  useEffect(load, [load]);

  if (err) return <Empty title="Order not found">{err}</Empty>;
  if (!order) return <Loader />;
  const a = order.shipping_address;
  const canCancel = order.status === "PENDING_PAYMENT" || order.status === "PLACED";

  const cancel = async () => {
    setBusy(true);
    try {
      setOrder(await api<Order>(`/api/orders/${order.order_number}/cancel`, { body: { reason: "Cancelled by customer" } }));
      toast("Order cancelled");
      setConfirmCancel(false);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    try {
      const s = await api<PaymentSession>(`/api/orders/${order.order_number}/pay`, { method: "POST" });
      await pay(s, order.order_number, order.total);
      setOrder(await api<Order>("/api/payments/verify", { body: { order_number: order.order_number } }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div>
      <Link to="/account/orders" className="link small">← All orders</Link>
      <div className="row between wrap mt-16 mb-16">
        <div>
          <h2 className="serif" style={{ fontSize: 28 }}>Order #{order.order_number}</h2>
          <div className="muted small">Placed on {fmtDate(order.created_at)}</div>
        </div>
        <div className="row"><StatusBadge status={order.status} /><PayBadge status={order.payment_status} /></div>
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <div className="note-box warn mb-16 row between wrap">
          <span>Payment is pending for this order.</span>
          <button className="btn sm" onClick={retry}>Complete payment</button>
        </div>
      )}

      <div className="card mb-16">
        <Tracker order={order} />
        {order.awb && (
          <div className="note-box mt-16">
            Shipped with <b>{order.shipping_partner}</b> · Tracking number <b>{order.awb}</b>
            {order.tracking_url && <> · <a className="link" href={order.tracking_url} target="_blank" rel="noreferrer">Track shipment ↗</a></>}
          </div>
        )}
      </div>

      <div className="od-grid">
        <div className="card">
          <h3>Items</h3>
          {order.items.map((i, idx) => (
            <div key={idx} className="line-item">
              <Img src={i.image_url} alt={i.product_name} className="thumb s56" />
              <div className="info">
                {i.product_slug ? <Link to={`/product/${i.product_slug}`} className="title">{i.product_name}</Link> : <span className="title">{i.product_name}</span>}
                <div className="meta">{i.color} · Size {i.size} · Qty {i.quantity}</div>
              </div>
              <b>{money(i.unit_price * i.quantity)}</b>
            </div>
          ))}
          <div className="divider" />
          <div className="sum-row"><span className="muted">Subtotal</span><span>{money(order.subtotal)}</span></div>
          {!!order.discount && <div className="sum-row save"><span>Discount ({order.coupon_code})</span><span>−{money(order.discount)}</span></div>}
          <div className="sum-row"><span className="muted">Shipping</span><span>{order.shipping_fee ? money(order.shipping_fee) : "Free"}</span></div>
          <div className="sum-row total"><span>Total</span><span>{money(order.total)}</span></div>
          <div className="muted small mt-8">Payment: {order.payment_method === "COD" ? "Cash on delivery" : "Online (Cashfree)"}</div>
        </div>
        <div>
          <div className="card mb-16">
            <h3>Delivery address</h3>
            <div className="small">
              <b>{a.name}</b><br />
              {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
              {a.city}, {a.state} - {a.pincode}<br />
              Phone: {a.phone}
            </div>
          </div>
          <div className="card">
            <h3>Order updates</h3>
            <Timeline order={order} />
            {canCancel && <button className="btn danger sm mt-8" onClick={() => setConfirmCancel(true)}>Cancel order</button>}
          </div>
        </div>
      </div>

      {confirmCancel && (
        <Modal title="Cancel this order?" onClose={() => setConfirmCancel(false)}
          footer={<><button className="btn ghost" onClick={() => setConfirmCancel(false)}>Keep order</button><button className="btn danger" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Yes, cancel"}</button></>}>
          <p>{order.payment_status === "PAID" ? `A full refund of ${money(order.total)} will be sent to your original payment method within 5–7 business days.` : "Your order will be cancelled."}</p>
        </Modal>
      )}
      {modal}
    </div>
  );
}

export function Addresses() {
  const [list, setList] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const toast = useToast();
  const load = useCallback(() => { api<Address[]>("/api/me/addresses").then(setList); }, []);
  useEffect(load, [load]);

  const save = async (data: AddressInput) => {
    if (editing === "new") await api("/api/me/addresses", { body: data });
    else if (editing) await api(`/api/me/addresses/${editing.id}`, { method: "PUT", body: data });
    setEditing(null);
    toast("Address saved");
    load();
  };
  const del = async (a: Address) => {
    if (!confirm("Delete this address?")) return;
    await api(`/api/me/addresses/${a.id}`, { method: "DELETE" });
    load();
  };

  if (!list) return <Loader />;
  return (
    <div>
      <div className="row between mb-16">
        <h2 className="serif" style={{ fontSize: 26 }}>Saved addresses</h2>
        <button className="btn sm" onClick={() => setEditing("new")}><Icon name="plus" className="icon sm" /> Add address</button>
      </div>
      {list.length === 0 ? (
        <Empty title="No saved addresses" icon="pin" />
      ) : (
        <div className="addr-grid">
          {list.map((a) => (
            <div key={a.id} className="addr-card" style={{ cursor: "default" }}>
              <b>{a.name}</b> {a.is_default && <span className="badge tone-neutral">Default</span>}
              <div className="muted small mt-8">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} - {a.pincode}<br />Phone: {a.phone}</div>
              <div className="row mt-16">
                <button className="link small" onClick={() => setEditing(a)}>Edit</button>
                <button className="link small" style={{ color: "var(--bad)" }} onClick={() => del(a)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <Modal title={editing === "new" ? "Add address" : "Edit address"} onClose={() => setEditing(null)} wide>
          <AddressForm initial={editing === "new" ? undefined : editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

export function Wishlist() {
  const [items, setItems] = useState<P[] | null>(null);
  const { wishlist } = useStore();
  useEffect(() => { api<P[]>("/api/me/wishlist").then(setItems); }, [wishlist]);
  if (!items) return <Loader />;
  if (!items.length) return <Empty title="Your wishlist is empty" icon="heart"><p>Tap the heart on any product to save it for later.</p><Link to="/shop" className="btn mt-16">Explore products</Link></Empty>;
  return (
    <div className="grid-products" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
      {items.map((p) => <ProductCard key={p.id} p={p} />)}
    </div>
  );
}

export function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [err, setErr] = useState("");
  const [pwErr, setPwErr] = useState("");

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      setUser(await api<User>("/api/auth/me", { method: "PUT", body: { name, phone } }));
      toast("Profile updated", "success");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const savePw = async (e: FormEvent) => {
    e.preventDefault();
    setPwErr("");
    try {
      await api("/api/auth/me/password", { body: pw });
      setPw({ current_password: "", new_password: "" });
      toast("Password changed", "success");
    } catch (e) {
      setPwErr((e as Error).message);
    }
  };

  return (
    <div className="stack">
      <form className="card" onSubmit={saveProfile}>
        <h3>Profile</h3>
        {err && <div className="form-error">{err}</div>}
        <div className="grid-2">
          <div className="field"><label htmlFor="p-name">Name</label><input id="p-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="p-phone">Mobile</label><input id="p-phone" className="input" required pattern="[6-9][0-9]{9}" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <div className="field"><label>Email</label><input className="input" value={user?.email || ""} disabled /></div>
        <button className="btn">Save changes</button>
      </form>
      <form className="card" onSubmit={savePw}>
        <h3>Change password</h3>
        {pwErr && <div className="form-error">{pwErr}</div>}
        <div className="grid-2">
          <div className="field"><label htmlFor="p-cur">Current password</label><input id="p-cur" type="password" className="input" required autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></div>
          <div className="field"><label htmlFor="p-new">New password</label><input id="p-new" type="password" className="input" required minLength={6} autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></div>
        </div>
        <button className="btn">Update password</button>
      </form>
    </div>
  );
}
