import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Icon from "../../components/Icon";
import { Empty, Img, Loader, Modal } from "../../components/ui";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api, uploadImage } from "../../lib/api";
import type { CategoryAdmin } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

type Form = { name: string; slug: string; description: string; image_url: string; is_active: boolean; sort_order: number };

export default function Categories() {
  const [list, setList] = useState<CategoryAdmin[] | null>(null);
  const [editing, setEditing] = useState<CategoryAdmin | "new" | null>(null);
  const toast = useToast();
  const { reloadCatalog } = useStore();

  const load = useCallback(() => {
    api<CategoryAdmin[]>("/api/admin/categories").then(setList);
  }, []);
  useEffect(load, [load]);

  const toggle = async (c: CategoryAdmin) => {
    await api(`/api/admin/categories/${c.id}`, {
      method: "PUT",
      body: { name: c.name, slug: c.slug, description: c.description, image_url: c.image_url, sort_order: c.sort_order, is_active: !c.is_active },
    });
    toast(c.is_active ? `${c.name} hidden from store` : `${c.name} is now visible`);
    load();
    reloadCatalog();
  };
  const del = async (c: CategoryAdmin) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    try {
      await api(`/api/admin/categories/${c.id}`, { method: "DELETE" });
      toast("Category deleted");
      load();
      reloadCatalog();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <>
      <AdminTop title="Categories">
        <button className="btn sm" onClick={() => setEditing("new")}>
          <Icon name="plus" className="icon sm" /> Add category
        </button>
      </AdminTop>
      <p className="muted small mb-16" style={{ marginTop: -12 }}>
        Categories appear in the store menu, home page and filters. Use the sort order to arrange them (lowest first).
      </p>
      {!list ? (
        <Loader />
      ) : !list.length ? (
        <div className="card"><Empty title="No categories yet" icon="tag"><button className="btn mt-16" onClick={() => setEditing("new")}>Add your first category</button></Empty></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Category</th><th>URL</th><th>Products</th><th>Order</th><th>Visible</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="row">
                      <Img src={c.image_url} alt="" className="thumb s40" />
                      <div>
                        <b>{c.name}</b>
                        {c.description && <div className="xs muted" style={{ maxWidth: 320 }}>{c.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="mono muted">/category/{c.slug}</td>
                  <td><Link to={`/admin/products?category_id=${c.id}`} className="link">{c.product_count}</Link></td>
                  <td>{c.sort_order}</td>
                  <td>
                    <label className="switch" title={c.is_active ? "Visible in store" : "Hidden"}>
                      <input type="checkbox" checked={c.is_active} onChange={() => toggle(c)} />
                      <i />
                    </label>
                  </td>
                  <td className="nowrap right">
                    <button className="btn light sm" onClick={() => setEditing(c)}>Edit</button>{" "}
                    <button className="btn danger sm" onClick={() => del(c)} disabled={c.product_count > 0} title={c.product_count ? "Move or delete its products first" : ""}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CategoryModal
          cat={editing === "new" ? null : editing}
          nextOrder={(list?.length || 0)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            reloadCatalog();
          }}
        />
      )}
    </>
  );
}

function CategoryModal({ cat, nextOrder, onClose, onSaved }: { cat: CategoryAdmin | null; nextOrder: number; onClose(): void; onSaved(): void }) {
  const toast = useToast();
  const [f, setF] = useState<Form>({
    name: cat?.name || "",
    slug: cat?.slug || "",
    description: cat?.description || "",
    image_url: cat?.image_url || "",
    is_active: cat?.is_active ?? true,
    sort_order: cat?.sort_order ?? nextOrder,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const url = await uploadImage(file);
      setF((p) => ({ ...p, image_url: url }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = { ...f, slug: f.slug.trim() || null, description: f.description.trim() || null, image_url: f.image_url || null };
      if (cat) await api(`/api/admin/categories/${cat.id}`, { method: "PUT", body });
      else await api("/api/admin/categories", { body });
      toast(cat ? "Category updated" : "Category added", "success");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={cat ? "Edit category" : "Add category"} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="form-error">{err}</div>}
        <div className="field">
          <label htmlFor="c-name">Name</label>
          <input id="c-name" className="input" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Hoodies" autoFocus />
        </div>
        <div className="field">
          <label htmlFor="c-slug">URL slug (optional)</label>
          <input id="c-slug" className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="auto-generated from name" />
          <span className="hint">Shown in the web address: /category/{f.slug || "your-category"}</span>
        </div>
        <div className="field">
          <label htmlFor="c-desc">Short description</label>
          <textarea id="c-desc" className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div className="field">
          <label>Banner image (optional)</label>
          <div className="row">
            {f.image_url ? <img src={f.image_url} alt="" className="thumb s72" /> : <div className="thumb s72" />}
            <div className="stack">
              <button type="button" className="btn light sm" onClick={() => fileRef.current?.click()}>
                <Icon name="image" className="icon sm" /> {f.image_url ? "Change image" : "Upload image"}
              </button>
              {f.image_url && <button type="button" className="link small" onClick={() => setF({ ...f, image_url: "" })}>Remove</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <span className="hint">If empty, the store uses the category's first product photo.</span>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="c-order">Sort order</label>
            <input id="c-order" className="input" type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Visibility</label>
            <label className="check" style={{ height: 44 }}>
              <span className="switch"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /><i /></span>
              {f.is_active ? "Visible in store" : "Hidden"}
            </label>
          </div>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? "Saving…" : cat ? "Save changes" : "Add category"}</button>
        </div>
      </form>
    </Modal>
  );
}
