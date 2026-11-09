import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Icon from "../../components/Icon";
import ProductCard, { ProductGridSkeleton } from "../../components/ProductCard";
import { Empty, Pager } from "../../components/ui";
import { useStore } from "../../context/store";
import { api } from "../../lib/api";
import type { ProductList } from "../../lib/types";

const PRICE_RANGES = [
  { label: "Under ₹1,000", min: undefined, max: 999 },
  { label: "₹1,000 – ₹1,500", min: 1000, max: 1500 },
  { label: "Above ₹1,500", min: 1501, max: undefined },
];

export default function Shop() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const { categories } = useStore();
  const [data, setData] = useState<ProductList | null>(null);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = sp.get("q") || "";
  const sort = sp.get("sort") || "newest";
  const page = Number(sp.get("page") || 1);
  const sizes = sp.get("sizes")?.split(",").filter(Boolean) || [];
  const colors = sp.get("colors")?.split(",").filter(Boolean) || [];
  const priceIdx = sp.get("price") ? Number(sp.get("price")) : -1;
  const range = PRICE_RANGES[priceIdx];
  const category = categories.find((c) => c.slug === slug);

  useEffect(() => {
    setData(null);
    setError("");
    api<ProductList>("/api/products", {
      query: {
        category: slug,
        q,
        sort,
        page,
        page_size: 24,
        sizes: sizes.join(","),
        colors: colors.join(","),
        min_price: range?.min,
        max_price: range?.max,
      },
    })
      .then(setData)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, sp.toString()]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in patch)) next.delete("page");
    setSp(next);
  };
  const toggleIn = (key: "sizes" | "colors", list: string[], v: string) =>
    update({ [key]: (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(",") || null });
  const activeFilters = sizes.length + colors.length + (range ? 1 : 0);

  const title = category?.name || (q ? `Results for "${q}"` : "Shop all");

  return (
    <div className="container">
      <div className="page-head">
        <div className="crumbs">
          <Link to="/">Home</Link> / {category ? <Link to="/shop">Shop</Link> : "Shop"}
          {category && <> / {category.name}</>}
        </div>
        <h1>{title}</h1>
        {category?.description && <p className="muted mt-8">{category.description}</p>}
      </div>

      <div className="shop">
        <aside className={`filters ${filtersOpen ? "open" : ""}`}>
          <div className="row between mb-16 filter-toggle" style={{ display: filtersOpen ? "flex" : undefined }}>
            <h3 className="serif" style={{ fontSize: 24 }}>Filters</h3>
            <button className="icon-btn" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <Icon name="close" />
            </button>
          </div>
          <div className="group">
            <h4>Category</h4>
            <Link to={`/shop${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`cat-link ${!slug ? "on" : ""}`}>
              All products
            </Link>
            {categories.map((c) => (
              <Link key={c.id} to={`/category/${c.slug}`} className={`cat-link ${slug === c.slug ? "on" : ""}`}>
                {c.name}
              </Link>
            ))}
          </div>
          {data && data.facets.sizes.length > 0 && (
            <div className="group">
              <h4>Size</h4>
              <div className="chip-set">
                {data.facets.sizes.map((s) => (
                  <button key={s} className={`chip size ${sizes.includes(s) ? "on" : ""}`} onClick={() => toggleIn("sizes", sizes, s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {data && data.facets.colors.length > 0 && (
            <div className="group">
              <h4>Colour</h4>
              {data.facets.colors.map((c) => (
                <button key={c.name} className={`color-opt ${colors.includes(c.name) ? "on" : ""}`} onClick={() => toggleIn("colors", colors, c.name)}>
                  <span className="swatch-dot" style={{ background: c.hex || "#ccc" }} />
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="group">
            <h4>Price</h4>
            {PRICE_RANGES.map((r, i) => (
              <label key={r.label} className="check" style={{ display: "flex", padding: "5px 0" }}>
                <input type="radio" name="price" checked={priceIdx === i} onChange={() => update({ price: String(i) })} />
                {r.label}
              </label>
            ))}
          </div>
          {activeFilters > 0 && (
            <button className="btn ghost sm" onClick={() => update({ sizes: null, colors: null, price: null })}>
              Clear filters
            </button>
          )}
          {filtersOpen && (
            <button className="btn block mt-24" onClick={() => setFiltersOpen(false)}>
              Show {data?.total ?? ""} results
            </button>
          )}
        </aside>

        <div>
          <div className="toolbar">
            <div className="row">
              <button className="btn light sm filter-toggle" onClick={() => setFiltersOpen(true)}>
                <Icon name="filter" className="icon sm" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
              </button>
              <span className="muted small">{data ? `${data.total} product${data.total === 1 ? "" : "s"}` : "Loading…"}</span>
            </div>
            <select className="input" value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort by">
              <option value="newest">Newest first</option>
              <option value="featured">Bestsellers</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </div>

          {error ? (
            <Empty title="Couldn't load products">{error}</Empty>
          ) : !data ? (
            <ProductGridSkeleton n={8} />
          ) : data.items.length === 0 ? (
            <Empty title="No products found" icon="search">
              <p>Try removing some filters or searching for something else.</p>
              {activeFilters > 0 && (
                <button className="btn mt-16" onClick={() => update({ sizes: null, colors: null, price: null })}>
                  Clear filters
                </button>
              )}
            </Empty>
          ) : (
            <>
              <div className="grid-products" style={{ gridTemplateColumns: undefined }}>
                {data.items.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
              <Pager page={data.page} total={data.total} pageSize={data.page_size} onChange={(p) => { update({ page: String(p) }); window.scrollTo(0, 0); }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
