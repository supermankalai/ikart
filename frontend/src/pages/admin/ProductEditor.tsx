import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../../components/Icon";
import { Loader } from "../../components/ui";
import { useToast } from "../../context/toast";
import { api, uploadImage } from "../../lib/api";
import { discountPct } from "../../lib/format";
import { COMMON_SIZES, WAIST_SIZES, compareSizes, sortSizes } from "../../lib/sizes";
import type { CategoryAdmin, ProductAdmin } from "../../lib/types";
import { AdminTop } from "./AdminLayout";

interface VRow {
  id?: number;
  key: string;
  size: string;
  color: string;
  color_hex: string;
  sku: string;
  stock: number;
}

let keySeq = 0;
const newKey = () => `v${++keySeq}`;

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [cats, setCats] = useState<CategoryAdmin[] | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [slug, setSlug] = useState("");
  const [f, setF] = useState({
    name: "",
    category_id: 0,
    price: "",
    mrp: "",
    description: "",
    details: "",
    is_active: true,
    is_featured: false,
  });
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [variants, setVariants] = useState<VRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Variant generator
  const [genSizes, setGenSizes] = useState<string[]>(["S", "M", "L", "XL", "XXL"]);
  const [genColors, setGenColors] = useState<{ name: string; hex: string }[]>([]);
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#1d1d1f");
  const [customSize, setCustomSize] = useState("");
  const [genStock, setGenStock] = useState(10);

  useEffect(() => {
    api<CategoryAdmin[]>("/api/admin/categories").then((c) => {
      setCats(c);
      if (isNew && c.length) setF((p) => ({ ...p, category_id: p.category_id || c[0].id }));
    });
    if (!isNew) {
      api<ProductAdmin>(`/api/admin/products/${id}`).then((p) => {
        setF({
          name: p.name,
          category_id: p.category_id,
          price: String(p.price),
          mrp: String(p.mrp),
          description: p.description || "",
          details: p.details || "",
          is_active: p.is_active,
          is_featured: p.is_featured,
        });
        setSlug(p.slug);
        setImages(p.images);
        setVariants(p.variants.map((v) => ({ id: v.id, key: newKey(), size: v.size, color: v.color, color_hex: v.color_hex || "#cccccc", sku: v.sku || "", stock: v.stock })));
        const cmap = new Map<string, string>();
        p.variants.forEach((v) => cmap.set(v.color, v.color_hex || "#cccccc"));
        setGenColors([...cmap.entries()].map(([name, hex]) => ({ name, hex })));
        setGenSizes(sortSizes([...new Set(p.variants.map((v) => v.size))]));
        setLoaded(true);
      }).catch((e) => setErr(e.message));
    }
  }, [id, isNew]);

  if (!loaded || !cats) return err ? <div className="form-error">{err}</div> : <Loader />;
  if (!cats.length)
    return (
      <div className="card center">
        <h3>Create a category first</h3>
        <p className="muted">Products belong to a category (e.g. T-Shirts).</p>
        <Link to="/admin/categories" className="btn mt-16">Go to categories</Link>
      </div>
    );

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : k === "category_id" ? Number(e.target.value) : e.target.value });

  // ----- Images -----
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const url = await uploadImage(file);
        setImages((imgs) => [...imgs, url]);
      } catch (e) {
        toast(`${file.name}: ${(e as Error).message}`, "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const moveImage = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
  };

  // ----- Variants -----
  const addColor = () => {
    const name = colorName.trim();
    if (!name) return;
    if (genColors.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast("Colour already added", "error");
    setGenColors([...genColors, { name, hex: colorHex }]);
    setColorName("");
  };
  const addSize = () => {
    const s = customSize.trim().toUpperCase();
    if (s && !genSizes.includes(s)) setGenSizes(sortSizes([...genSizes, s]));
    setCustomSize("");
  };
  const toggleSize = (s: string) => setGenSizes(genSizes.includes(s) ? genSizes.filter((x) => x !== s) : sortSizes([...genSizes, s]));
  const generate = () => {
    if (!genColors.length) return toast("Add at least one colour", "error");
    if (!genSizes.length) return toast("Select at least one size", "error");
    const have = new Set(variants.map((v) => `${v.color.toLowerCase()}|${v.size.toUpperCase()}`));
    const added: VRow[] = [];
    genColors.forEach((c) =>
      genSizes.forEach((s) => {
        if (!have.has(`${c.name.toLowerCase()}|${s}`)) {
          added.push({ key: newKey(), size: s, color: c.name, color_hex: c.hex, sku: "", stock: genStock });
        }
      }),
    );
    if (!added.length) return toast("All these combinations already exist");
    setVariants([...variants, ...added]);
    toast(`${added.length} variant${added.length > 1 ? "s" : ""} added`, "success");
  };
  const updateVariant = (key: string, patch: Partial<VRow>) => setVariants(variants.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  const sortedVariants = [...variants].sort((a, b) => a.color.localeCompare(b.color) || compareSizes(a.size, b.size));
  const totalStock = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!variants.length) return setErr("Add at least one size/colour variant (use the generator below).");
    if (uploading) return setErr("Please wait for images to finish uploading.");
    setBusy(true);
    const body = {
      ...f,
      slug: slug.trim() || null,
      price: Number(f.price),
      mrp: Number(f.mrp) || Number(f.price),
      description: f.description.trim() || null,
      details: f.details.trim() || null,
      images,
      variants: variants.map((v) => ({ id: v.id, size: v.size, color: v.color, color_hex: v.color_hex, sku: v.sku.trim() || null, stock: Number(v.stock) || 0 })),
    };
    try {
      const saved = isNew
        ? await api<ProductAdmin>("/api/admin/products", { body })
        : await api<ProductAdmin>(`/api/admin/products/${id}`, { method: "PUT", body });
      toast(isNew ? "Product created" : "Product saved", "success");
      if (isNew) nav(`/admin/products/${saved.id}`, { replace: true });
      else {
        setVariants(saved.variants.map((v) => ({ id: v.id, key: newKey(), size: v.size, color: v.color, color_hex: v.color_hex || "#cccccc", sku: v.sku || "", stock: v.stock })));
        setSlug(saved.slug);
      }
    } catch (e) {
      setErr((e as Error).message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  const off = discountPct(Number(f.price), Number(f.mrp));

  return (
    <form onSubmit={submit}>
      <Link to="/admin/products" className="link small">← Products</Link>
      <AdminTop title={isNew ? "Add product" : f.name || "Edit product"}>
        {!isNew && slug && <a href={`/product/${slug}`} target="_blank" rel="noreferrer" className="btn light sm"><Icon name="external" className="icon sm" /> View in store</a>}
      </AdminTop>
      {err && <div className="form-error">{err}</div>}

      <div className="two-col">
        <div className="stack">
          <div className="card">
            <h3>Basic details</h3>
            <div className="field">
              <label htmlFor="p-name">Product name</label>
              <input id="p-name" className="input" required minLength={2} value={f.name} onChange={set("name")} placeholder="e.g. Essential Crew Neck Tee" />
            </div>
            <div className="field">
              <label htmlFor="p-desc">Description</label>
              <textarea id="p-desc" className="input" rows={4} value={f.description} onChange={set("description")} placeholder="What makes this product special?" />
            </div>
            <div className="field">
              <label htmlFor="p-details">Fabric & care (one point per line)</label>
              <textarea id="p-details" className="input" rows={4} value={f.details} onChange={set("details")} placeholder={"100% cotton, 180 GSM\nRegular fit\nMachine wash cold"} />
            </div>
          </div>

          <div className="card">
            <div className="row between mb-16">
              <h3 style={{ margin: 0 }}>Photos</h3>
              <span className="muted xs">First photo is the cover. JPG, PNG or WEBP, up to 5 MB.</span>
            </div>
            <div className="img-grid">
              {images.map((u, i) => (
                <div className="img-tile" key={u + i}>
                  <img src={u} alt="" />
                  {i === 0 && <span className="cover">Cover</span>}
                  <div className="tools">
                    <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label="Move left">←</button>
                    <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
                    <button type="button" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} aria-label="Move right">→</button>
                  </div>
                </div>
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <div className="img-tile" key={`up${i}`}><div className="skeleton" style={{ position: "absolute", inset: 0 }} /></div>
              ))}
              <button type="button" className="img-add" onClick={() => fileRef.current?.click()}>
                <Icon name="image" />
                Add photos
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          </div>

          <div className="card">
            <h3>Sizes, colours & stock</h3>
            <div className="note-box mb-16">
              Each size + colour combination is a <b>variant</b> with its own stock. Pick sizes and colours, then click <b>Add combinations</b>.
            </div>
            <div className="label mb-16" style={{ marginBottom: 8 }}>Sizes</div>
            <div className="chip-set">
              {[...new Set([...COMMON_SIZES, ...genSizes.filter((s) => !WAIST_SIZES.includes(s))])].map((s) => (
                <button type="button" key={s} className={`chip size ${genSizes.includes(s) ? "on" : ""}`} onClick={() => toggleSize(s)}>{s}</button>
              ))}
            </div>
            <div className="chip-set mt-8">
              {WAIST_SIZES.map((s) => (
                <button type="button" key={s} className={`chip size ${genSizes.includes(s) ? "on" : ""}`} onClick={() => toggleSize(s)} title="Waist size">{s}</button>
              ))}
              <span className="row" style={{ gap: 6 }}>
                <input className="input" style={{ width: 110, padding: "7px 10px" }} placeholder="Other size" value={customSize} onChange={(e) => setCustomSize(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSize(); } }} />
                <button type="button" className="btn light sm" onClick={addSize}>Add</button>
              </span>
            </div>

            <div className="label mt-24" style={{ marginBottom: 8 }}>Colours</div>
            <div className="chip-set">
              {genColors.map((c) => (
                <span key={c.name} className="chip row" style={{ gap: 6 }}>
                  <span className="swatch-dot" style={{ background: c.hex }} />
                  {c.name}
                  <button type="button" className="icon-btn chip-x" onClick={() => setGenColors(genColors.filter((x) => x.name !== c.name))} aria-label={`Remove ${c.name}`}>
                    <Icon name="close" className="icon sm" />
                  </button>
                </span>
              ))}
            </div>
            <div className="color-input mt-8">
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} aria-label="Colour swatch" />
              <input className="input" style={{ maxWidth: 220 }} placeholder="Colour name, e.g. Navy" value={colorName} onChange={(e) => setColorName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColor(); } }} />
              <button type="button" className="btn light sm" onClick={addColor}>Add colour</button>
            </div>

            <div className="row wrap mt-16" style={{ background: "var(--surface-2)", padding: 12, borderRadius: 12 }}>
              <span className="small">Starting stock for new combinations</span>
              <input className="input" type="number" min={0} style={{ width: 90, padding: "7px 10px" }} value={genStock} onChange={(e) => setGenStock(Number(e.target.value))} />
              <button type="button" className="btn gold sm" onClick={generate}>Add combinations</button>
            </div>

            {variants.length > 0 && (
              <div className="table-wrap variant-table mt-16">
                <table>
                  <thead>
                    <tr><th>Colour</th><th>Size</th><th>SKU (optional)</th><th>Stock</th><th></th></tr>
                  </thead>
                  <tbody>
                    {sortedVariants.map((v) => (
                      <tr key={v.key}>
                        <td>
                          <div className="row" style={{ gap: 8 }}>
                            <input type="color" value={v.color_hex} onChange={(e) => setVariants(variants.map((x) => (x.color === v.color ? { ...x, color_hex: e.target.value } : x)))} style={{ width: 26, height: 26, border: 0, padding: 0, background: "none" }} aria-label="Colour" />
                            {v.color}
                          </div>
                        </td>
                        <td><b>{v.size}</b></td>
                        <td className="v-sku"><input className="input mono" value={v.sku} onChange={(e) => updateVariant(v.key, { sku: e.target.value })} aria-label={`SKU for ${v.color} ${v.size}`} placeholder="Optional" /></td>
                        <td className="v-stock"><input className="input" type="number" inputMode="numeric" min={0} value={v.stock} onChange={(e) => updateVariant(v.key, { stock: Number(e.target.value) })} aria-label={`Stock for ${v.color} ${v.size}`} /></td>
                        <td><button type="button" className="icon-btn" onClick={() => setVariants(variants.filter((x) => x.key !== v.key))} aria-label="Remove variant"><Icon name="trash" className="icon sm" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="muted small mt-8">{variants.length} variants · {totalStock} units in stock</div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Status</h3>
            <label className="check mb-16" style={{ display: "flex" }}>
              <span className="switch"><input type="checkbox" checked={f.is_active} onChange={set("is_active")} /><i /></span>
              {f.is_active ? "Live in store" : "Hidden (draft)"}
            </label>
            <label className="check" style={{ display: "flex" }}>
              <span className="switch"><input type="checkbox" checked={f.is_featured} onChange={set("is_featured")} /><i /></span>
              Featured on home page
            </label>
          </div>
          <div className="card">
            <h3>Category</h3>
            <select className="input" required value={f.category_id} onChange={set("category_id")} aria-label="Category">
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (hidden)"}</option>)}
            </select>
            <Link to="/admin/categories" className="link small" style={{ display: "inline-block", marginTop: 8 }}>Manage categories</Link>
          </div>
          <div className="card">
            <h3>Pricing</h3>
            <div className="field">
              <label htmlFor="p-price">Selling price (₹)</label>
              <input id="p-price" className="input" type="number" min={1} required value={f.price} onChange={set("price")} />
            </div>
            <div className="field">
              <label htmlFor="p-mrp">MRP (₹)</label>
              <input id="p-mrp" className="input" type="number" min={0} value={f.mrp} onChange={set("mrp")} />
              <span className="hint">{off > 0 ? `Customers see ${off}% off` : "Set higher than the price to show a discount"}</span>
            </div>
          </div>
          <div className="card">
            <h3>Web address</h3>
            <input className="input mono" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" aria-label="URL slug" />
            <span className="hint">/product/{slug || "…"}</span>
          </div>
        </div>
      </div>

      <div className="sticky-actions">
        <Link to="/admin/products" className="btn ghost">Cancel</Link>
        <button className="btn" disabled={busy || uploading > 0}>{busy ? "Saving…" : isNew ? "Create product" : "Save changes"}</button>
      </div>
    </form>
  );
}
