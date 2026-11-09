import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Empty, Img, Loader, Pager, PayBadge, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/toast";
import { api, downloadFile } from "../../lib/api";
import { STATUS_LABEL, fmtDateTime, money } from "../../lib/format";
import type { Dashboard, OrderStatus, OrderSummary, Page } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

const TABS: (OrderStatus | "")[] = ["", "PLACED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "PENDING_PAYMENT", "CANCELLED"];

export default function Orders() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<Page<OrderSummary> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState(sp.get("q") || "");

  const filters = {
    status: sp.get("status") || undefined,
    payment_status: sp.get("payment_status") || undefined,
    payment_method: sp.get("payment_method") || undefined,
    q: sp.get("q") || undefined,
    date_from: sp.get("date_from") || undefined,
    date_to: sp.get("date_to") || undefined,
  };

  useEffect(() => {
    setData(null);
    api<Page<OrderSummary>>("/api/admin/orders", { query: { ...filters, page: sp.get("page") || 1 } }).then(setData);
    api<Dashboard>("/api/admin/dashboard").then((d) => setCounts(d.status_counts)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") || "") !== q) update({ q: q || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setSp(next);
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const exportCsv = async () => {
    try {
      await downloadFile("/api/admin/orders/export", filters, `ikart-orders-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <>
      <AdminTop title="Orders">
        <button className="btn light sm" onClick={exportCsv}><Icon name="download" className="icon sm" /> Export CSV</button>
      </AdminTop>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t || "all"} className={(sp.get("status") || "") === t ? "on" : ""} onClick={() => update({ status: t || null })}>
            {t ? STATUS_LABEL[t] : "All"}
            <span className="c">{t ? counts[t] || 0 : total}</span>
          </button>
        ))}
      </div>
      <div className="filters-bar">
        <input className="input search" placeholder="Order no., customer, phone, AWB…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        <select className="input" value={sp.get("payment_method") || ""} onChange={(e) => update({ payment_method: e.target.value || null })} aria-label="Payment method">
          <option value="">All payments</option>
          <option value="ONLINE">Online (Cashfree)</option>
          <option value="COD">Cash on delivery</option>
        </select>
        <select className="input" value={sp.get("payment_status") || ""} onChange={(e) => update({ payment_status: e.target.value || null })} aria-label="Payment status">
          <option value="">Any payment status</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <input className="input" type="date" value={sp.get("date_from") || ""} onChange={(e) => update({ date_from: e.target.value || null })} aria-label="From date" />
        <input className="input" type="date" value={sp.get("date_to") || ""} onChange={(e) => update({ date_to: e.target.value || null })} aria-label="To date" />
      </div>

      {!data ? (
        <Loader />
      ) : !data.items.length ? (
        <div className="card"><Empty title="No orders found" icon="receipt" /></div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.items.map((o) => (
                  <tr key={o.order_number} className="click" onClick={() => nav(`/admin/orders/${o.order_number}`)}>
                    <td>
                      <div className="row">
                        <Img src={o.first_image} alt="" className="thumb s40" />
                        <div><b>#{o.order_number}</b>{o.awb && <div className="xs muted mono">AWB {o.awb}</div>}</div>
                      </div>
                    </td>
                    <td className="small muted nowrap">{fmtDateTime(o.created_at)}</td>
                    <td>{o.customer_name}<div className="xs muted">{o.customer_phone} · {o.city}</div></td>
                    <td>{o.item_count}</td>
                    <td><b>{money(o.total)}</b></td>
                    <td><PayBadge status={o.payment_status} /><div className="xs muted">{o.payment_method === "COD" ? "COD" : "Online"}</div></td>
                    <td><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} total={data.total} pageSize={data.page_size} onChange={(p) => update({ page: String(p) })} />
        </>
      )}
    </>
  );
}
