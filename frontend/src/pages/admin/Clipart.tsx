import { useEffect, useRef, useState } from "react";
import Icon from "../../components/Icon";
import { Empty, Loader } from "../../components/ui";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { STARTER_CLIPART } from "../../lib/clipart";
import type { Clipart as Clip } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

/** Admin: art customers can add to custom T-shirts. */
export default function Clipart() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<Clip[] | null>(null);
  const [category, setCategory] = useState("Festivals");
  const [busy, setBusy] = useState(false);

  const load = () => api<Clip[]>("/api/admin/clipart").then(setList).catch((e) => toast(e.message, "error"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!category.trim()) return toast("Enter a category first", "error");
    setBusy(true);
    let ok = 0;
    for (const f of [...files].slice(0, 30)) {
      try {
        const form = new FormData();
        form.append("file", f);
        const { url } = await api<{ url: string }>("/api/admin/clipart/upload", { form });
        await api("/api/admin/clipart", { body: { name: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 100), category: category.trim(), url } });
        ok++;
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
    if (ok) toast(`${ok} added`, "success");
    load();
  };

  const save = async (c: Clip, patch: Partial<Clip>) => {
    const next = { ...c, ...patch };
    try {
      const r = await api<Clip>(`/api/admin/clipart/${c.id}`, { method: "PUT", body: { name: next.name, category: next.category, url: next.url, is_active: next.is_active, sort_order: next.sort_order || 0 } });
      setList((l) => l?.map((x) => (x.id === c.id ? r : x)) || null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const remove = async (c: Clip) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    await api(`/api/admin/clipart/${c.id}`, { method: "DELETE" });
    setList((l) => l?.filter((x) => x.id !== c.id) || null);
  };

  const cats = [...new Set((list || []).map((c) => c.category))];

  return (
    <>
      <AdminTop title="Clipart" />
      <div className="card mb-16">
        <h3>Add art</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Upload PNG (transparent background), WEBP or SVG files. Customers find them under <b>Art</b> in the T-shirt designer and can recolour them.
          Only upload art you own or have a licence to print.
        </p>
        <div className="row wrap">
          <div className="field" style={{ margin: 0, minWidth: 200 }}>
            <label htmlFor="ca-cat">Category</label>
            <input id="ca-cat" className="input" list="ca-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="ca-cats">{[...cats, "Festivals", "Quotes", "Sports", "Animals", "Love", "Travel"].map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <button className="btn" style={{ alignSelf: "flex-end" }} disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" className="icon sm" /> {busy ? "Uploading…" : "Upload files"}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/webp,image/svg+xml" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>

      {!list ? <Loader /> : !list.length ? (
        <div className="card"><Empty title="No uploaded art yet" icon="image"><p className="muted small">Customers already get {STARTER_CLIPART.length} built-in starter icons.</p></Empty></div>
      ) : (
        <div className="clip-grid">
          {list.map((c) => (
            <div key={c.id} className={`card clip-card ${c.is_active ? "" : "off"}`}>
              <div className="clip-img"><img src={c.url} alt="" /></div>
              <input className="input sm" value={c.name} aria-label="Name" onChange={(e) => setList((l) => l?.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) || null)} onBlur={(e) => save(c, { name: e.target.value || c.name })} />
              <input className="input sm" value={c.category} aria-label="Category" onChange={(e) => setList((l) => l?.map((x) => (x.id === c.id ? { ...x, category: e.target.value } : x)) || null)} onBlur={(e) => save(c, { category: e.target.value || c.category })} />
              <div className="row between">
                <label className="check xs" style={{ display: "flex" }}>
                  <span className="switch"><input type="checkbox" checked={!!c.is_active} onChange={(e) => save(c, { is_active: e.target.checked })} /><i /></span>
                  {c.is_active ? "Shown" : "Hidden"}
                </label>
                <button className="icon-btn" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Icon name="trash" className="icon sm" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
