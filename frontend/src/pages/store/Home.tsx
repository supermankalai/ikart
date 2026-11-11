import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RailItem } from "../../components/HangerScene";
import Icon from "../../components/Icon";
import ProductCard, { ProductGridSkeleton } from "../../components/ProductCard";
import { useStore } from "../../context/store";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import type { ProductCard as P, ProductList } from "../../lib/types";

// three.js is big, so the 3D hero is downloaded only when the home page needs it
const HangerScene = lazy(() => import("../../components/HangerScene"));

const kindOf = (p: P): RailItem["kind"] | null => {
  const s = `${p.category.slug} ${p.category.name} ${p.name}`;
  if (/pant|jogger|trouser|track|short|bottom/i.test(s)) return "bottom";
  if (/shirt|tee|polo|hoodie|sweat|jacket|top/i.test(s)) return "top";
  return null;
};

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const colorDistance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

type Picked = { item: RailItem; product: P };

/** Garments for the 3D rail: tops and bottoms alternating, in clearly different colours where possible. */
function pickRail(products: P[], usePhotos: boolean): Picked[] {
  const seen = new Set<number>();
  const unique = products.filter((p) => kindOf(p) && !seen.has(p.id) && seen.add(p.id));
  const chosen: Picked[] = [];
  const pick = (kind: RailItem["kind"], max: number) => {
    const out: Picked[] = [];
    // sample products use drawn placeholder images, so only real uploaded photos count
    const photoOf = (p: P) => (usePhotos && p.image && !p.image.includes("/uploads/seed-") ? p.image : null);
    const options = unique
      .filter((p) => kindOf(p) === kind)
      .sort((a, b) => Number(!!photoOf(b)) - Number(!!photoOf(a))) // products with real photos first
      .flatMap((p) => p.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex || "")).map((c) => ({ p, hex: c.hex!.toLowerCase() })));
    // strict pass: different products and very different colours; then relax step by step
    for (const [minDist, oneEach] of [[110, true], [60, true], [60, false], [1, false]] as const) {
      for (const o of options) {
        if (out.length >= max) break;
        const photo = photoOf(o.p);
        if (photo && out.some((x) => x.product.id === o.p.id)) continue; // one photo per product
        if (oneEach && out.some((x) => x.product.id === o.p.id)) continue;
        // a photo shows its own colours, so the colour-variety rule only applies to 3D models
        if (!photo && [...chosen, ...out].some((x) => !x.item.image && colorDistance(x.item.color, o.hex) < minDist)) continue;
        out.push({ product: o.p, item: { slug: o.p.slug, name: o.p.name, kind, color: o.hex, image: photo, stripe: /stripe/i.test(o.p.name) } });
      }
    }
    chosen.push(...out);
    return out;
  };
  const tops = pick("top", 4);
  const bottoms = pick("bottom", tops.length ? 2 : 4);
  const t = tops.slice(0, bottoms.length ? 2 : 4);
  // alternate: top, bottom, top, bottom
  const rail: Picked[] = [];
  for (let i = 0; i < 4; i++) {
    const a = t[i], b = bottoms[i];
    if (a) rail.push(a);
    if (b) rail.push(b);
  }
  return rail.slice(0, 4);
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const SLIDES = ["New season essentials", "Design your own T-shirt", "New arrivals"];
const SLIDE_MS = 6000;

export default function Home() {
  const { categories, settings } = useStore();
  const nav = useNavigate();
  const [use3d, setUse3d] = useState(supportsWebGL);
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const [featured, setFeatured] = useState<P[] | null>(null);
  const [latest, setLatest] = useState<P[] | null>(null);
  const [catImages, setCatImages] = useState<Record<string, string>>({});
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const go = (d: number) => setSlide((i) => (i + d + SLIDES.length) % SLIDES.length);

  // The hero moves to the next slide by itself; it waits while the pointer or keyboard focus is on it
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => !document.hidden && go(1), SLIDE_MS);
    return () => window.clearInterval(t);
  }, [paused, slide]);

  useEffect(() => {
    api<ProductList>("/api/products", { query: { featured: true, page_size: 8, sort: "featured" } })
      .then((r) => setFeatured(r.items))
      .catch(() => setFeatured([]));
    api<ProductList>("/api/products", { query: { sort: "newest", page_size: 8 } })
      .then((r) => setLatest(r.items))
      .catch(() => setLatest([]));
  }, []);

  // Use the category's own image, or fall back to its first product's photo
  useEffect(() => {
    categories.forEach((c) => {
      if (c.image_url) return;
      api<ProductList>("/api/products", { query: { category: c.slug, page_size: 1, sort: "featured" } })
        .then((r) => r.items[0]?.image && setCatImages((m) => ({ ...m, [c.slug]: r.items[0].image! })))
        .catch(() => {});
    });
  }, [categories]);

  const heroA = featured?.[0];
  const heroB = featured?.find((p) => p.category.id !== heroA?.category.id) || featured?.[1];
  const rail = useMemo(
    () => (featured && latest ? pickRail([...featured, ...latest], settings.hero_rail_photos) : []),
    [featured, latest, settings.hero_rail_photos],
  );
  const railItems = useMemo(() => rail.map((r) => r.item), [rail]);
  const tagProduct = rail.find((r) => r.product.slug === hoverSlug)?.product ?? rail[Math.floor((rail.length - 1) / 2)]?.product;
  const show3d = use3d && rail.length > 0;

  return (
    <>
      <section
        className="hero"
        aria-roledescription="carousel"
        aria-label="Highlights"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="hero-track" style={{ transform: `translateX(${-slide * 100}%)` }}>
        <div className={`hero-slide ${slide === 0 ? "on" : ""}`} role="group" aria-roledescription="slide" aria-label={`1 of ${SLIDES.length}: ${SLIDES[0]}`}>
        <div className="container">
          <div>
            <div className="eyebrow">New season essentials</div>
            <h1>
              Comfort,<br />
              <em>crafted</em> for every day.
            </h1>
            <p>Premium T-shirts and track pants in soft, breathable fabrics, made to look sharp and feel even better.</p>
            <div className="row wrap">
              <Link to="/shop" className="btn lg">
                Shop the collection
              </Link>
              {categories[0] && (
                <Link to={`/category/${categories[0].slug}`} className="btn ghost lg">
                  {categories[0].name}
                </Link>
              )}
            </div>
          </div>
          {show3d ? (
            <div className="hero-art hero-3d">
              <Suspense fallback={<div className="hanger-scene loading" />}>
                <HangerScene items={railItems} onPick={(slug) => nav(`/product/${slug}`)} onHover={setHoverSlug} onFail={() => setUse3d(false)} />
              </Suspense>
              {tagProduct && (
                <Link to={`/product/${tagProduct.slug}`} className="tag">
                  <span className="muted">{hoverSlug ? "Tap to shop" : "On the rail"}</span>
                  <b>{tagProduct.name}</b>
                  {money(tagProduct.price)}
                </Link>
              )}
              <span className="rail-hint">Tap a garment to shop it</span>
            </div>
          ) : (
            <div className="hero-art" aria-hidden="true">
              <div className="img a">{heroA?.image && <img src={heroA.image} alt="" />}</div>
              <div className="img b">{heroB?.image && <img src={heroB.image} alt="" />}</div>
              {heroA && (
                <Link to={`/product/${heroA.slug}`} className="tag">
                  <span className="muted">Bestseller</span>
                  <b>{heroA.name}</b>
                  {money(heroA.price)}
                </Link>
              )}
            </div>
          )}
        </div>
        </div>

        <div className={`hero-slide ${slide === 1 ? "on" : ""}`} role="group" aria-roledescription="slide" aria-label={`2 of ${SLIDES.length}: ${SLIDES[1]}`}>
          <div className="container">
            <div>
              <div className="eyebrow">Design your own</div>
              <h1>
                Your idea,<br />
                <em>printed</em> on a tee.
              </h1>
              <p>Upload a photo, add text or art, place it anywhere on the T-shirt and see it from every side before you order.</p>
              <div className="row wrap">
                <Link to="/customize" className="btn gold lg">Start designing</Link>
                <Link to="/shop" className="btn ghost lg">Browse T-shirts</Link>
              </div>
            </div>
            <div className="hero-art hero-design" aria-hidden="true">
              <div className="img a">{heroB?.image && <img src={heroB.image} alt="" />}</div>
              <div className="hero-steps">
                <span><Icon name="upload" /> Upload or add text</span>
                <span><Icon name="shirt" /> Place it anywhere</span>
                <span><Icon name="refresh" /> Preview in 360°</span>
              </div>
              <Link to="/customize" className="tag" tabIndex={-1}>
                <span className="muted">Custom print</span>
                <b>Made just for you</b>
                from {money(settings.custom_print_price)} per print
              </Link>
            </div>
          </div>
        </div>

        <div className={`hero-slide ${slide === 2 ? "on" : ""}`} role="group" aria-roledescription="slide" aria-label={`3 of ${SLIDES.length}: ${SLIDES[2]}`}>
          <div className="container">
            <div>
              <div className="eyebrow">Just landed</div>
              <h1>
                Fresh styles,<br />
                <em>new</em> this week.
              </h1>
              <p>
                The latest drops are in. Free shipping on orders above {money(settings.free_shipping_above)} and {settings.return_days}-day easy returns.
              </p>
              <div className="row wrap">
                <Link to="/shop?sort=newest" className="btn lg">See what's new</Link>
                <Link to="/shop?sort=featured" className="btn ghost lg">Bestsellers</Link>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="img a">{latest?.[0]?.image && <img src={latest[0].image} alt="" />}</div>
              <div className="img b">{(latest?.[1] || heroA)?.image && <img src={(latest?.[1] || heroA)!.image!} alt="" />}</div>
              {latest?.[0] && (
                <Link to={`/product/${latest[0].slug}`} className="tag" tabIndex={-1}>
                  <span className="muted">New arrival</span>
                  <b>{latest[0].name}</b>
                  {money(latest[0].price)}
                </Link>
              )}
            </div>
          </div>
        </div>
        </div>

        <div className="hero-nav">
          <button className="hero-arrow prev" onClick={() => go(-1)} aria-label="Previous slide"><Icon name="back" /></button>
          <div className="hero-dots">
            {SLIDES.map((label, i) => (
              <button key={label} className={i === slide ? "on" : ""} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}: ${label}`} aria-current={i === slide} />
            ))}
          </div>
          <button className="hero-arrow next" onClick={() => go(1)} aria-label="Next slide"><Icon name="chevron" /></button>
        </div>
      </section>

      <div className="perks">
        <div>
          <Icon name="truck" />
          <span>
            <b>Free shipping</b>On orders above {money(settings.free_shipping_above)}
          </span>
        </div>
        <div>
          <Icon name="refresh" />
          <span>
            <b>Easy returns</b>{settings.return_days}-day hassle-free returns
          </span>
        </div>
        <div>
          <Icon name="shield" />
          <span>
            <b>Secure payments</b>UPI, cards and net banking
          </span>
        </div>
        <div>
          <Icon name="cash" />
          <span>
            <b>Cash on delivery</b>Pay when it arrives
          </span>
        </div>
      </div>

      {categories.length > 0 && (
        <section className="section container">
          <div className="section-head">
            <h2>Shop by category</h2>
            <Link to="/shop" className="link">
              View all →
            </Link>
          </div>
          <div className="cat-tiles">
            {categories.map((c) => {
              const img = c.image_url || catImages[c.slug];
              return (
                <Link key={c.id} to={`/category/${c.slug}`} className={`cat-tile ${img ? "" : "plain"}`}>
                  {img && <img src={img} alt="" />}
                  <div>
                    <h3>{c.name}</h3>
                    <span>{c.description || "Explore the collection"} →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section container">
        <div className="section-head">
          <div>
            <div className="eyebrow">Most loved</div>
            <h2 className="mt-8">Bestsellers</h2>
          </div>
          <Link to="/shop?sort=featured" className="link">
            Shop all →
          </Link>
        </div>
        {featured === null ? (
          <ProductGridSkeleton n={4} />
        ) : (
          <div className="grid-products">
            {featured.slice(0, 8).map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      <section className="section container">
        <div className="promise">
          <div className="eyebrow">The iKart promise</div>
          <h2>Quality you can feel</h2>
          <p>
           Every product is carefully quality-checked and thoughtfully packed by our team before dispatch. From our store to your doorstep, enjoy a seamless shopping experience with real-time order tracking every step of the way.
          </p>
        </div>
      </section>

      <section className="section container">
        <div className="section-head">
          <div>
            <div className="eyebrow">Just landed</div>
            <h2 className="mt-8">New arrivals</h2>
          </div>
          <Link to="/shop?sort=newest" className="link">
            See what's new →
          </Link>
        </div>
        {latest === null ? (
          <ProductGridSkeleton n={4} />
        ) : (
          <div className="grid-products">
            {latest.slice(0, 4).map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
