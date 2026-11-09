import { useCallback, useEffect, useState, type FormEvent } from "react";
import Icon from "../../components/Icon";
import { Empty, Loader, Modal } from "../../components/ui";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { fmtDate, money } from "../../lib/format";
import type { Coupon } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

export default function Coupons() {
  const [list, setList] = useState<Coupon[] | null>(null);
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const toast = useToast();
  const load = useCallback(() => { api<Coupon[]>("/api/admin/coupons").then(setList); }, []);
  useEffect(load, [load]);

  const del = async (c: Coupon) => {
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    await api(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
    toast("Coupon deleted");
    load();
  };
  const describe = (c: Coupon) =>
    c.discount_type === "percent"
      ? `${c.value}% off${c.max_discount ? ` (up to ${money(c.max_discount)})` : ""}`
      : `${money(c.value)} off`;
  const expired = (c: Coupon) => !!c.expires_at && new Date(c.expires_at) < new Date();

  return (
    <>
      <AdminTop title="Coupons">
        <button className="btn sm" onClick={() => setEditing("new")}><Icon name="plus" className="icon sm" /> New coupon</button>
      </AdminTop>
      {!list ? (
        <Loader />
      ) : !list.length ? (
        <div className="card"><Empty title="No coupons yet" icon="ticket" /></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Min. order</th><th>Used</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><b className="mono">{c.code}</b>{c.description && <div className="xs muted">{c.description}</div>}</td>
                  <td>{describe(c)}</td>
                  <td>{c.min_order ? money(c.min_order) : "–"}</td>
                  <td>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                  <td className="small">{c.expires_at ? fmtDate(c.expires_at) : "Never"}</td>
                  <td>
                    <span className={`badge ${!c.is_active || expired(c) ? "tone-neutral" : "tone-ok"}`}>
                      {!c.is_active ? "Inactive" : expired(c) ? "Expired" : "Active"}
                    </span>
                  </td>
                  <td className="nowrap right">
                    <button className="btn light sm" onClick={() => setEditing(c)}>Edit</button>{" "}
                    <button className="icon-btn" onClick={() => del(c)} aria-label="Delete"><Icon name="trash" className="icon sm" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <CouponModal coupon={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function CouponModal({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose(): void; onSaved(): void }) {
  const toast = useToast();
  const [f, setF] = useState({
    code: coupon?.code || "",
    description: coupon?.description || "",
    discount_type: coupon?.discount_type || "percent",
    value: String(coupon?.value ?? ""),
    min_order: String(coupon?.min_order ?? 0),
    max_discount: coupon?.max_discount ? String(coupon.max_discount) : "",
    usage_limit: coupon?.usage_limit ? String(coupon.usage_limit) : "",
    expires_at: coupon?.expires_at ? coupon.expires_at.slice(0, 10) : "",
    is_active: coupon?.is_active ?? true,
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const body = {
      code: f.code,
      description: f.description || null,
      discount_type: f.discount_type,
      value: Number(f.value),
      min_order: Number(f.min_order) || 0,
      max_discount: f.max_discount ? Number(f.max_discount) : null,
      usage_limit: f.usage_limit ? Number(f.usage_limit) : null,
      expires_at: f.expires_at ? `${f.expires_at}T23:59:59+05:30` : null,
      is_active: f.is_active,
    };
    try {
      if (coupon) await api(`/api/admin/coupons/${coupon.id}`, { method: "PUT", body });
      else await api("/api/admin/coupons", { body });
      toast("Coupon saved", "success");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={coupon ? "Edit coupon" : "New coupon"} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="form-error">{err}</div>}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="cp-code">Code</label>
            <input id="cp-code" className="input mono" required minLength={3} style={{ textTransform: "uppercase" }} value={f.code} onChange={set("code")} placeholder="SUMMER20" />
          </div>
          <div className="field">
            <label htmlFor="cp-type">Type</label>
            <select id="cp-type" className="input" value={f.discount_type} onChange={set("discount_type")}>
              <option value="percent">Percentage (%)</option>
              <option value="flat">Flat amount (₹)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cp-val">{f.discount_type === "percent" ? "Discount %" : "Discount ₹"}</label>
            <input id="cp-val" className="input" type="number" min={1} max={f.discount_type === "percent" ? 90 : undefined} required value={f.value} onChange={set("value")} />
          </div>
          <div className="field">
            <label htmlFor="cp-max">Max discount ₹ (optional)</label>
            <input id="cp-max" className="input" type="number" min={0} value={f.max_discount} onChange={set("max_discount")} disabled={f.discount_type === "flat"} />
          </div>
          <div className="field">
            <label htmlFor="cp-min">Minimum order ₹</label>
            <input id="cp-min" className="input" type="number" min={0} value={f.min_order} onChange={set("min_order")} />
          </div>
          <div className="field">
            <label htmlFor="cp-limit">Total uses allowed (optional)</label>
            <input id="cp-limit" className="input" type="number" min={1} value={f.usage_limit} onChange={set("usage_limit")} />
          </div>
          <div className="field">
            <label htmlFor="cp-exp">Expires on (optional)</label>
            <input id="cp-exp" className="input" type="date" value={f.expires_at} onChange={set("expires_at")} />
          </div>
          <div className="field">
            <label>Status</label>
            <label className="check" style={{ height: 44 }}>
              <span className="switch"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /><i /></span>
              {f.is_active ? "Active" : "Inactive"}
            </label>
          </div>
        </div>
        <div className="field">
          <label htmlFor="cp-desc">Description (internal)</label>
          <input id="cp-desc" className="input" value={f.description} onChange={set("description")} />
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save coupon"}</button>
        </div>
      </form>
    </Modal>
  );
}
