import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Empty, Loader, Pager } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import type { Customer, Page } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

export default function Customers() {
  const [data, setData] = useState<Page<Customer> | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const nav = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      api<Page<Customer>>("/api/admin/customers", { query: { q, page } }).then(setData);
    }, 250);
    return () => clearTimeout(t);
  }, [q, page]);

  return (
    <>
      <AdminTop title="Customers" />
      <div className="filters-bar">
        <input className="input search" placeholder="Search name, email or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search customers" />
        {data && <span className="muted small">{data.total} customers</span>}
      </div>
      {!data ? (
        <Loader />
      ) : !data.items.length ? (
        <div className="card"><Empty title="No customers yet" icon="users" /></div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Customer</th><th>Phone</th><th>Joined</th><th>Orders</th><th>Total spent</th></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="click" onClick={() => nav(`/admin/orders?q=${encodeURIComponent(c.email)}`)}>
                    <td><b>{c.name}</b><div className="xs muted">{c.email}</div></td>
                    <td>{c.phone}</td>
                    <td className="muted small">{fmtDate(c.created_at)}</td>
                    <td>{c.order_count}</td>
                    <td><b>{money(c.total_spent)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} total={data.total} pageSize={data.page_size} onChange={setPage} />
        </>
      )}
    </>
  );
}
