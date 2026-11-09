import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Empty, Img, Loader, Pager } from "../../components/ui";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import type { CategoryAdmin, Page, ProductAdmin } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

export default function Products() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<Page<ProductAdmin> | null>(null);
  const [cats, setCats] = useState<CategoryAdmin[]>([]);
  const [q, setQ] = useState(sp.get("q") || "");

  const query = {
    q: sp.get("q") || undefined,
    category_id: sp.get("category_id") || undefined,
    stock: sp.get("stock") || undefined,
    page: sp.get("page") || 1,
  };

  const load = useCallback(() => {
    api<Page<ProductAdmin>>("/api/admin/products", { query }).then(setData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);
  useEffect(load, [load]);
  useEffect(() => {
    api<CategoryAdmin[]>("/api/admin/categories").then(setCats);
  }, []);

  // Debounced search
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

  const toggle = async (p: ProductAdmin) => {
    await api(`/api/admin/products/${p.id}/active`, { method: "PATCH", query: { active: !p.is_active } });
    toast(p.is_active ? "Product hidden from store" : "Product is live");
    load();
  };
  const del = async (p: ProductAdmin) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone. (Tip: hide it instead to keep it for later.)`)) return;
    await api(`/api/admin/products/${p.id}`, { method: "DELETE" });
    toast("Product deleted");
    load();
  };

  return (
    <>
      <AdminTop title="Products">
        <Link to="/admin/products/new" className="btn sm"><Icon name="plus" className="icon sm" /> Add product</Link>
      </AdminTop>
      <div className="filters-bar">
        <input className="input search" placeholder="Search name or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        <select className="input" value={sp.get("category_id") || ""} onChange={(e) => update({ category_id: e.target.value || null })} aria-label="Category">
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input" value={sp.get("stock") || ""} onChange={(e) => update({ stock: e.target.value || null })} aria-label="Stock">
          <option value="">Any stock</option>
          <option value="low">Low stock (1–9)</option>
          <option value="out">Out of stock</option>
        </select>
        {data && <span className="muted small">{data.total} products</span>}
      </div>
      {!data ? (
        <Loader />
      ) : !data.items.length ? (
        <div className="card">
          <Empty title="No products found" icon="box">
            <Link to="/admin/products/new" className="btn mt-16">Add a product</Link>
          </Empty>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Product</th><th>Category</th><th>Price</th><th>Variants</th><th>Stock</th><th>Live</th><th></th></tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="click" onClick={() => nav(`/admin/products/${p.id}`)}>
                    <td>
                      <div className="row">
                        <Img src={p.images[0]} alt="" className="thumb s40" />
                        <div>
                          <b>{p.name}</b>
                          {p.is_featured && <span className="badge tone-info" style={{ marginLeft: 6 }}>Featured</span>}
                          <div className="xs muted">/{p.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td>{p.category.name}</td>
                    <td><b>{money(p.price)}</b>{p.mrp > p.price && <div className="xs muted" style={{ textDecoration: "line-through" }}>{money(p.mrp)}</div>}</td>
                    <td className="small">
                      {p.variants.length} <span className="muted">({[...new Set(p.variants.map((v) => v.color))].length} colours)</span>
                    </td>
                    <td>
                      <span className={`badge ${p.total_stock === 0 ? "tone-bad" : p.total_stock < 10 ? "tone-warn" : "tone-ok"}`}>{p.total_stock}</span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <label className="switch"><input type="checkbox" checked={p.is_active} onChange={() => toggle(p)} /><i /></label>
                    </td>
                    <td className="nowrap right" onClick={(e) => e.stopPropagation()}>
                      <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer" className="icon-btn" title="View in store"><Icon name="external" className="icon sm" /></a>
                      <button className="icon-btn" onClick={() => del(p)} title="Delete"><Icon name="trash" className="icon sm" /></button>
                    </td>
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
