import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Img, Loader, PayBadge, StatusBadge } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import type { Dashboard as D } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

export default function Dashboard() {
  const [d, setD] = useState<D | null>(null);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    api<D>("/api/admin/dashboard").then(setD).catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="form-error">{err}</div>;
  if (!d) return <Loader />;
  const max = Math.max(...d.sales_by_day.map((x) => x.total), 1);
  const total14 = d.sales_by_day.reduce((s, x) => s + x.total, 0);

  return (
    <>
      <AdminTop title="Dashboard">
        <Link to="/admin/products/new" className="btn sm">+ Add product</Link>
      </AdminTop>

      <div className="stats">
        <div className="card stat">
          <div className="label">Total sales</div>
          <div className="val">{money(d.gross_sales)}</div>
          <div className="hint">{money(d.collected)} collected</div>
        </div>
        <div className="card stat">
          <div className="label">Today</div>
          <div className="val">{d.orders_today} <span style={{ fontSize: 16 }} className="muted">orders</span></div>
          <div className="hint">{money(d.revenue_today)} in sales</div>
        </div>
        <Link to="/admin/orders?status=PLACED" className="card stat" style={{ borderColor: d.to_ship ? "var(--gold)" : undefined }}>
          <div className="label">To ship</div>
          <div className="val">{d.to_ship}</div>
          <div className="hint">{d.in_transit} in transit</div>
        </Link>
        <div className="card stat">
          <div className="label">Customers</div>
          <div className="val">{d.customers}</div>
          <div className="hint">{d.products} products listed</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="row between mb-16">
            <h3 style={{ margin: 0 }}>Sales, last 14 days</h3>
            <span className="muted small">{money(total14)}</span>
          </div>
          <div className="bars">
            {d.sales_by_day.map((x) => (
              <div className="b" key={x.date}>
                <i style={{ height: `${(x.total / max) * 100}%` }} data-v={`${money(x.total)} · ${fmtDate(x.date)}`} />
                <span>{new Date(x.date).toLocaleDateString("en-IN", { day: "numeric" })}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Top products</h3>
          {d.top_products.length ? (
            d.top_products.map((p) => (
              <div className="list-row" key={p.name}>
                <Img src={p.image} alt="" className="thumb s40" />
                <div className="grow">
                  <div>{p.name}</div>
                  <div className="xs muted">{money(p.revenue)}</div>
                </div>
                <b>{p.qty} sold</b>
              </div>
            ))
          ) : (
            <p className="muted small">No sales yet.</p>
          )}
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="row between mb-16">
            <h3 style={{ margin: 0, fontSize: 16 }}>Recent orders</h3>
            <Link to="/admin/orders" className="link small">View all →</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr>
              </thead>
              <tbody>
                {d.recent_orders.map((o) => (
                  <tr key={o.order_number} className="click" onClick={() => nav(`/admin/orders/${o.order_number}`)}>
                    <td><b>#{o.order_number}</b><div className="xs muted">{fmtDate(o.created_at)}</div></td>
                    <td>{o.customer_name}</td>
                    <td><b>{money(o.total)}</b></td>
                    <td><PayBadge status={o.payment_status} /></td>
                    <td><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
                {!d.recent_orders.length && <tr><td colSpan={5} className="muted center">No orders yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Low stock alerts</h3>
          {d.low_stock.length ? (
            d.low_stock.map((v, i) => (
              <div className="list-row" key={i}>
                <div className="grow">
                  <div>{v.name}</div>
                  <div className="xs muted">{v.color} · {v.size}</div>
                </div>
                <span className={`badge ${v.stock === 0 ? "tone-bad" : "tone-warn"}`}>{v.stock === 0 ? "Out of stock" : `${v.stock} left`}</span>
                <Link to={`/admin/products/${v.product_id}`} className="btn light sm">Restock</Link>
              </div>
            ))
          ) : (
            <p className="muted small">All variants are well stocked.</p>
          )}
        </div>
      </div>
    </>
  );
}
