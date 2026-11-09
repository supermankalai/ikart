import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../../components/Icon";
import ProductCard from "../../components/ProductCard";
import { Empty, Loader, Price } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useCart } from "../../context/cart";
import { useStore } from "../../context/store";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import type { ProductCard as P, ProductDetail } from "../../lib/types";
import { sortSizes } from "../../lib/sizes";

export default function Product() {
  const { slug } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { add, setOpen } = useCart();
  const { settings, wishlist, toggleWishlist } = useStore();

  const [p, setP] = useState<ProductDetail | null>(null);
  const [error, setError] = useState("");
  const [related, setRelated] = useState<P[]>([]);
  const [imgIdx, setImgIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  // Mobile: show a sticky "Add to bag" bar once the main buy buttons scroll out of view
  const buyRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const el = buyRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => {
      io.disconnect();
      setShowBar(false);
    };
  }, [p]);

  useEffect(() => {
    setP(null);
    setError("");
    setImgIdx(0);
    setSize("");
    setQty(1);
    api<ProductDetail>(`/api/products/${slug}`)
      .then((d) => {
        setP(d);
        const firstInStock = d.variants.find((v) => v.stock > 0);
        setColor(firstInStock?.color || d.variants[0]?.color || "");
        document.title = `${d.name} | eKart`;
      })
      .catch((e) => setError(e.message));
    api<P[]>(`/api/products/${slug}/related`).then(setRelated).catch(() => setRelated([]));
  }, [slug]);

  const colors = useMemo(() => {
    const m = new Map<string, string | null>();
    p?.variants.forEach((v) => !m.has(v.color) && m.set(v.color, v.color_hex));
    return [...m.entries()];
  }, [p]);
  const sizes = useMemo(() => sortSizes([...new Set(p?.variants.map((v) => v.size) || [])]), [p]);
  const variant = p?.variants.find((v) => v.color === color && v.size === size);
  const stockFor = (s: string) => p?.variants.find((v) => v.color === color && v.size === s)?.stock ?? 0;

  // Show the image that matches the selected colour, if one exists
  useEffect(() => {
    if (!p || !color) return;
    const key = color.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const i = p.images.findIndex((u) => u.toLowerCase().includes(`-${key}.`));
    if (i >= 0) setImgIdx(i);
  }, [color, p]);

  if (error) return <div className="container"><Empty title="Product not found"><Link to="/shop" className="btn mt-16">Back to shop</Link></Empty></div>;
  if (!p) return <Loader />;

  const addToBag = (buyNow = false) => {
    if (!variant) {
      setSizeError(true);
      document.getElementById("pdp-sizes")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    add({
      variant_id: variant.id,
      quantity: qty,
      product_id: p.id,
      name: p.name,
      slug: p.slug,
      image: p.images[0] || null,
      size: variant.size,
      color: variant.color,
      price: p.price,
    });
    if (buyNow) nav("/checkout");
    else {
      toast(`Added to bag: ${p.name} (${variant.size})`, "success");
      setOpen(true);
    }
  };

  const wished = wishlist.has(p.id);
  const onWish = async () => {
    if (!user) return nav(`/login?next=/product/${p.slug}`);
    const added = await toggleWishlist(p.id);
    toast(added ? "Saved to wishlist" : "Removed from wishlist");
  };

  return (
    <div className="container">
      <div className="crumbs" style={{ paddingTop: 24 }}>
        <Link to="/">Home</Link> / <Link to={`/category/${p.category.slug}`}>{p.category.name}</Link> / {p.name}
      </div>
      <div className="pdp">
        <div className="gallery">
          <div className="thumbs">
            {p.images.map((u, i) => (
              <button key={u} className={i === imgIdx ? "on" : ""} onClick={() => setImgIdx(i)} aria-label={`Image ${i + 1}`}>
                <img src={u} alt="" />
              </button>
            ))}
          </div>
          <div className={`main ${zoom ? "zoom" : ""}`} onClick={() => setZoom(!zoom)}>
            {p.images[imgIdx] && <img src={p.images[imgIdx]} alt={p.name} />}
          </div>
        </div>

        <div>
          <div className="eyebrow">{p.category.name}</div>
          <h1>{p.name}</h1>
          <div className="price-row">
            <Price price={p.price} mrp={p.mrp} />
          </div>
          <div className="xs muted mt-8">Inclusive of all taxes</div>

          {colors.length > 0 && (
            <>
              <div className="opt-label">
                <span>
                  Colour: <b>{color}</b>
                </span>
              </div>
              <div className="row wrap">
                {colors.map(([name, hex]) => (
                  <button
                    key={name}
                    className={`color-swatch ${name === color ? "on" : ""}`}
                    style={{ background: hex || "#ccc" }}
                    title={name}
                    aria-label={name}
                    onClick={() => {
                      setColor(name);
                      setSize("");
                      setQty(1);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          <div className="opt-label" id="pdp-sizes">
            <span>
              Size: <b>{size || "Select a size"}</b>
            </span>
          </div>
          <div className="row wrap">
            {sizes.map((s) => {
              const st = stockFor(s);
              return (
                <button
                  key={s}
                  className={`size-btn ${s === size ? "on" : ""}`}
                  disabled={st <= 0}
                  onClick={() => {
                    setSize(s);
                    setQty(1);
                    setSizeError(false);
                  }}
                  title={st <= 0 ? "Out of stock" : undefined}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {sizeError && <div className="small" style={{ color: "var(--bad)", marginTop: 8 }}>Please select a size</div>}
          {variant && variant.stock > 0 && variant.stock <= 5 && (
            <div className="small mt-8" style={{ color: "var(--warn)", fontWeight: 600 }}>
              Hurry, only {variant.stock} left!
            </div>
          )}

          <div className="buy-row" ref={buyRef}>
            <div className="qty">
              <button onClick={() => setQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Decrease quantity">−</button>
              <span>{qty}</span>
              <button onClick={() => setQty(Math.min(variant?.stock ?? 10, qty + 1, 10))} disabled={!!variant && qty >= variant.stock} aria-label="Increase quantity">+</button>
            </div>
            <button className="btn lg" onClick={() => addToBag(false)} disabled={!p.in_stock}>
              {p.in_stock ? "Add to bag" : "Sold out"}
            </button>
            <button className="icon-btn" onClick={onWish} aria-label="Wishlist" style={{ border: "1px solid var(--line)", borderRadius: 999, width: 52 }}>
              <Icon name="heart" className={`icon heart ${wished ? "on" : ""}`} />
            </button>
          </div>
          {p.in_stock && (
            <button className="btn gold block lg mt-8" onClick={() => addToBag(true)}>
              Buy it now
            </button>
          )}
          {p.in_stock && (
            <div className={`pdp-bar ${showBar ? "show" : ""}`} aria-hidden={!showBar}>
              <div className="grow">
                <div className="pdp-bar-name">{p.name}{variant ? ` · ${variant.color}, ${variant.size}` : ""}</div>
                <Price price={p.price} mrp={p.mrp} />
              </div>
              <button className="btn" tabIndex={showBar ? 0 : -1} onClick={() => addToBag(false)}>
                {variant ? "Add to bag" : "Select size"}
              </button>
            </div>
          )}

          <div className="assure">
            <div>
              <Icon name="truck" />
              Free shipping over {money(settings.free_shipping_above)}
            </div>
            <div>
              <Icon name="refresh" />
              {settings.return_days}-day easy returns
            </div>
            <div>
              <Icon name="shield" />
              Secure payments
            </div>
          </div>

          <div className="mt-24">
            {p.description && (
              <details className="acc" open>
                <summary>Description</summary>
                <div className="acc-body">{p.description}</div>
              </details>
            )}
            {p.details && (
              <details className="acc">
                <summary>Fabric & care</summary>
                <div className="acc-body">{p.details}</div>
              </details>
            )}
            <details className="acc">
              <summary>Shipping & returns</summary>
              <div className="acc-body">
                Dispatched within 1–2 business days and usually delivered in 3–7 days. Free shipping on orders above{" "}
                {money(settings.free_shipping_above)}. Easy returns within {settings.return_days} days of delivery for unused items with tags.
              </div>
            </details>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>You may also like</h2>
          </div>
          <div className="grid-products">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
