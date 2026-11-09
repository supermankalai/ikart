import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import { useCart } from "../context/cart";
import { useStore } from "../context/store";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { Quote } from "../lib/types";
import Icon from "./Icon";
import { Drawer, Img } from "./ui";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="iKart home">
      i<span>K</span>art
    </Link>
  );
}

function SearchBox({ onDone }: { onDone?(): void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState(() => new URLSearchParams(loc.search).get("q") || "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    nav(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : "/shop");
    onDone?.();
  };
  return (
    <form className="header-search" onSubmit={submit} role="search">
      <Icon name="search" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tees, joggers…" aria-label="Search products" />
    </form>
  );
}

function MobileMenu({ onClose }: { onClose(): void }) {
  const { categories, wishlist } = useStore();
  const { user } = useAuth();
  const loc = useLocation();
  const onCategory = loc.pathname.startsWith("/category/");
  const [catsOpen, setCatsOpen] = useState(onCategory);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="mobile-menu" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <nav aria-label="Mobile">
        <div className="mm-head">
          <Logo />
          <button className="icon-btn" onClick={onClose} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <div className="mm-body">
          <div className="mm-label">Shop</div>
          <NavLink to="/shop" end className="mm-row">
            <Icon name="tag" />
            <span>Shop all</span>
            <Icon name="chevron" className="icon mm-arrow" />
          </NavLink>

          {categories.length > 0 && (
            <>
              <button
                type="button"
                className={`mm-row${catsOpen ? " open" : ""}${onCategory ? " active" : ""}`}
                aria-expanded={catsOpen}
                onClick={() => setCatsOpen((o) => !o)}
              >
                <Icon name="grid" />
                <span>Categories</span>
                <span className="mm-count">{categories.length}</span>
                <Icon name="chevron" className="icon mm-arrow" />
              </button>
              <div className={`mm-sub${catsOpen ? " open" : ""}`}>
                <div>
                  {categories.map((c) => (
                    <NavLink key={c.id} to={`/category/${c.slug}`} tabIndex={catsOpen ? 0 : -1}>
                      {c.name}
                    </NavLink>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="mm-label">Account</div>
          <NavLink to={user ? "/account/orders" : "/login?next=/account/orders"} className="mm-row">
            <Icon name="box" />
            <span>My orders</span>
            <Icon name="chevron" className="icon mm-arrow" />
          </NavLink>
          <NavLink to={user ? "/account/wishlist" : "/login?next=/account/wishlist"} className="mm-row">
            <Icon name="heart" />
            <span>Wishlist</span>
            {wishlist.size > 0 && <span className="mm-count gold">{wishlist.size}</span>}
            <Icon name="chevron" className="icon mm-arrow" />
          </NavLink>
          <NavLink to="/contact" className="mm-row">
            <Icon name="phone" />
            <span>Help & contact</span>
            <Icon name="chevron" className="icon mm-arrow" />
          </NavLink>
          {user?.is_admin && (
            <NavLink to="/admin" className="mm-row">
              <Icon name="settings" />
              <span>Admin portal</span>
              <Icon name="chevron" className="icon mm-arrow" />
            </NavLink>
          )}
        </div>

        <div className="mm-foot">
          {user ? (
            <Link to={user.is_admin ? "/admin" : "/account"} className="mm-user">
              <span className="mm-avatar">{(user.name || user.email || "?").trim().charAt(0).toUpperCase()}</span>
              <span className="mm-user-txt">
                <b>{user.name || "My account"}</b>
                <small>View profile & settings</small>
              </span>
              <Icon name="chevron" className="icon mm-arrow" />
            </Link>
          ) : (
            <Link to="/login" className="btn block">
              Sign in / Create account
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}

// Categories shown directly in the desktop nav; every category is in the "Categories" panel.
const NAV_LIMIT = 3;

function Header() {
  const { categories, settings, wishlist } = useStore();
  const { count, setOpen } = useCart();
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [mega, setMega] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<number>();
  const loc = useLocation();

  useEffect(() => {
    setMenu(false);
    setMega(false);
  }, [loc.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mega) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMega(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mega]);

  const openMega = () => {
    window.clearTimeout(closeTimer.current);
    setMega(true);
  };
  const closeMegaSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMega(false), 140);
  };
  const onCategory = loc.pathname.startsWith("/category/");

  return (
    <>
      {settings.announcement && <div className="announce">{settings.announcement}</div>}
      <header className={`site-header${scrolled ? " scrolled" : ""}${mega ? " mega-open" : ""}`}>
        <div className="container">
          <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <Logo />
          <nav className="main-nav" aria-label="Main">
            <NavLink to="/shop" end>
              Shop all
            </NavLink>
            {categories.slice(0, NAV_LIMIT).map((c) => (
              <NavLink key={c.id} to={`/category/${c.slug}`} title={c.name}>
                {c.name}
              </NavLink>
            ))}
            {categories.length > 0 && (
              <button
                type="button"
                className={`nav-cats${mega ? " open" : ""}${onCategory && !categories.slice(0, NAV_LIMIT).some((c) => loc.pathname === `/category/${c.slug}`) ? " active" : ""}`}
                aria-expanded={mega}
                aria-controls="mega-panel"
                onMouseEnter={openMega}
                onMouseLeave={closeMegaSoon}
                onClick={() => (mega ? setMega(false) : openMega())}
              >
                Categories <Icon name="chevron" className="icon" />
              </button>
            )}
          </nav>
          <SearchBox />
          <div className="header-actions">
            <Link to={user ? "/account/wishlist" : "/login?next=/account/wishlist"} className="icon-btn" aria-label="Wishlist">
              <Icon name="heart" />
              {wishlist.size > 0 && <span className="count-dot">{wishlist.size}</span>}
            </Link>
            <Link to={user ? (user.is_admin ? "/admin" : "/account") : "/login"} className="icon-btn" aria-label="Account">
              <Icon name="user" />
            </Link>
            <button className="icon-btn" onClick={() => setOpen(true)} aria-label={`Cart, ${count} items`}>
              <Icon name="bag" />
              {count > 0 && <span className="count-dot">{count}</span>}
            </button>
          </div>
        </div>
        <div className="mobile-search">
          <SearchBox />
        </div>
        {categories.length > 0 && (
          <div
            id="mega-panel"
            className={`mega${mega ? " open" : ""}`}
            onMouseEnter={openMega}
            onMouseLeave={closeMegaSoon}
            aria-hidden={!mega}
          >
            <div className="container mega-inner">
              <div className="mega-intro">
                <span className="eyebrow">Collections</span>
                <h3>Shop by category</h3>
                <p>{settings.tagline || "Thoughtfully made essentials for every day."}</p>
                <Link to="/shop" className="mega-all" tabIndex={mega ? 0 : -1}>
                  View all products <Icon name="chevron" className="icon" />
                </Link>
              </div>
              <div className="mega-grid">
                {categories.map((c) => (
                  <NavLink key={c.id} to={`/category/${c.slug}`} className="mega-item" title={c.name} tabIndex={mega ? 0 : -1}>
                    <span className="mega-thumb">
                      {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <span>{c.name.trim().charAt(0).toUpperCase()}</span>}
                    </span>
                    <span className="mega-txt">
                      <b>{c.name}</b>
                      <small>Explore <Icon name="chevron" className="icon" /></small>
                    </span>
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>
      {mega && <div className="mega-scrim" onMouseEnter={closeMegaSoon} onClick={() => setMega(false)} />}
      {menu && <MobileMenu onClose={() => setMenu(false)} />}
    </>
  );
}

function Footer() {
  const { categories, settings } = useStore();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="cols">
          <div>
            <div className="logo">
              e<span style={{ color: "var(--gold-2)" }}>K</span>art
            </div>
            <p style={{ maxWidth: 300 }}>{settings.tagline}. Thoughtfully made, carefully packed and delivered to your door.</p>
          </div>
          <div>
            <h4>Shop</h4>
            <Link to="/shop">All products</Link>
            {categories.map((c) => (
              <Link key={c.id} to={`/category/${c.slug}`}>
                {c.name}
              </Link>
            ))}
          </div>
          <div>
            <h4>Help</h4>
            <Link to="/account/orders">Track order</Link>
            <Link to="/shipping-policy">Shipping policy</Link>
            <Link to="/refund-policy">Returns & refunds</Link>
            <Link to="/contact">Contact us</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link to="/about">About iKart</Link>
            <Link to="/terms">Terms & conditions</Link>
            <Link to="/privacy">Privacy policy</Link>
            {settings.instagram_url && (
              <a href={settings.instagram_url} target="_blank" rel="noreferrer">
                Instagram
              </a>
            )}
          </div>
        </div>
        <div className="bottom">
          <span>© {new Date().getFullYear()} {settings.store_name}. All rights reserved.</span>
          <span>Secure payments by Cashfree · UPI · Cards · Net banking · COD</span>
        </div>
      </div>
    </footer>
  );
}

function CartDrawer() {
  const { items, open, setOpen, setQty, remove } = useCart();
  const { settings } = useStore();
  const nav = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    if (!open || !items.length) {
      setQuote(null);
      return;
    }
    const t = setTimeout(() => {
      api<Quote>("/api/cart/quote", { body: { items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })) } })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 150);
    return () => clearTimeout(t);
  }, [open, items]);

  if (!open) return null;
  const close = () => setOpen(false);
  const subtotal = quote?.subtotal ?? items.reduce((s, i) => s + i.price * i.quantity, 0);
  const need = settings.free_shipping_above - subtotal;
  const issueFor = (vid: number) => quote?.lines.find((l) => l.variant_id === vid)?.issue;

  return (
    <Drawer
      title={`Your bag (${items.reduce((s, i) => s + i.quantity, 0)})`}
      onClose={close}
      footer={
        items.length > 0 && (
          <>
            <div className="sum-row">
              <span className="muted">Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            <p className="xs muted" style={{ margin: "0 0 14px" }}>
              Shipping and coupons are applied at checkout.
            </p>
            <button
              className="btn block lg"
              disabled={quote?.has_issues}
              onClick={() => {
                close();
                nav("/checkout");
              }}
            >
              Checkout
            </button>
            <button className="btn ghost block mt-8" onClick={() => { close(); nav("/cart"); }}>
              View bag
            </button>
          </>
        )
      }
    >
      {items.length === 0 ? (
        <div className="empty">
          <Icon name="bag" />
          <h3 className="mt-8">Your bag is empty</h3>
          <p>Discover our latest tees and track pants.</p>
          <button className="btn mt-16" onClick={() => { close(); nav("/shop"); }}>
            Start shopping
          </button>
        </div>
      ) : (
        <>
          {settings.free_shipping_above > 0 && (
            <div className="ship-bar">
              {need > 0 ? (
                <>Add <b>{money(need)}</b> more for <b>free shipping</b></>
              ) : (
                <>You've unlocked <b>free shipping</b></>
              )}
              <div className="track">
                <i style={{ width: `${Math.min(100, (subtotal / settings.free_shipping_above) * 100)}%` }} />
              </div>
            </div>
          )}
          {items.map((i) => {
            const issue = issueFor(i.variant_id);
            return (
              <div className="line-item" key={i.variant_id}>
                <Link to={`/product/${i.slug}`} onClick={close}>
                  <Img src={i.image} alt={i.name} className="thumb s72" />
                </Link>
                <div className="info">
                  <div className="row between top">
                    <Link to={`/product/${i.slug}`} onClick={close} className="title">
                      {i.name}
                    </Link>
                    <button className="icon-btn" style={{ padding: 8, margin: -6 }} onClick={() => remove(i.variant_id)} aria-label="Remove">
                      <Icon name="close" className="icon sm" />
                    </button>
                  </div>
                  <div className="meta">
                    {i.color} · Size {i.size}
                  </div>
                  {issue && <div className="issue">{issue}</div>}
                  <div className="row between mt-8">
                    <div className="qty sm">
                      <button onClick={() => setQty(i.variant_id, i.quantity - 1)} aria-label="Decrease">−</button>
                      <span>{i.quantity}</span>
                      <button onClick={() => setQty(i.variant_id, i.quantity + 1)} aria-label="Increase">+</button>
                    </div>
                    <b>{money(i.price * i.quantity)}</b>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </Drawer>
  );
}

export default function StoreLayout() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
    </>
  );
}
