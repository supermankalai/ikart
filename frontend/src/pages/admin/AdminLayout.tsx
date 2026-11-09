import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import Icon from "../../components/Icon";
import { Loader } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { api } from "../../lib/api";
import type { Dashboard } from "../../lib/types";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: "grid", end: true },
  { to: "/admin/orders", label: "Orders", icon: "receipt" },
  { to: "/admin/products", label: "Products", icon: "box" },
  { to: "/admin/categories", label: "Categories", icon: "tag" },
  { to: "/admin/customers", label: "Customers", icon: "users" },
  { to: "/admin/coupons", label: "Coupons", icon: "ticket" },
  { to: "/admin/settings", label: "Settings", icon: "settings" },
];

export default function AdminLayout() {
  const { user, ready, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [toShip, setToShip] = useState(0);
  const [menu, setMenu] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef, !!user?.is_admin);

  useEffect(() => {
    if (user?.is_admin) api<Dashboard>("/api/admin/dashboard").then((d) => setToShip(d.to_ship)).catch(() => {});
  }, [user, loc.pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
    setMenu(false);
  }, [loc.pathname]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menu]);

  if (!ready) return <Loader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!user.is_admin)
    return (
      <div className="container status-hero">
        <h1>Admins only</h1>
        <p className="muted">Your account doesn't have access to the admin portal.</p>
        <Link to="/" className="btn mt-24">Go to store</Link>
      </div>
    );

  return (
    <>
      <header className="admin-mobile">
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Open admin menu" aria-expanded={menu}>
          <Icon name="menu" />
        </button>
        <Link to="/admin" className="logo">i<span>K</span>art <small>Admin</small></Link>
        <Link to="/admin/orders" className="icon-btn" aria-label={`Orders to ship: ${toShip}`}>
          <Icon name="receipt" />
          {toShip > 0 && <span className="count-dot">{toShip}</span>}
        </Link>
      </header>
      <div className="admin">
        {menu && <div className="admin-scrim" onClick={() => setMenu(false)} />}
        <aside className={`admin-side ${menu ? "open" : ""}`}>
          <button className="icon-btn admin-close" onClick={() => setMenu(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
          <Link to="/admin" className="logo">i<span>K</span>art</Link>
          <div className="sub">Admin portal</div>
          <nav>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <Icon name={n.icon} className="icon sm" />
                {n.label}
                {n.to === "/admin/orders" && toShip > 0 && <span className="n">{toShip}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="foot">
            <div className="xs" style={{ color: "#8a8273", marginBottom: 8 }}>Signed in as {user.name}</div>
            <a href="/" target="_blank" rel="noreferrer"><Icon name="external" className="icon sm" /> View store</a>
            <button onClick={() => { logout(); nav("/login"); }}><Icon name="logout" className="icon sm" /> Sign out</button>
          </div>
        </aside>
        <main className="admin-main" ref={mainRef}>
          <Outlet />
        </main>
      </div>
    </>
  );
}

/**
 * Copies each table's column headings onto its cells as data-label,
 * so that on phones the CSS can show every row as a labelled card.
 */
function useTableLabels(ref: React.RefObject<HTMLElement>, enabled: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const label = () => {
      root.querySelectorAll("table").forEach((t) => {
        const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent?.trim() || "");
        t.querySelectorAll("tbody tr").forEach((tr) => {
          [...tr.children].forEach((td, i) => {
            const l = heads[i] ?? "";
            if (td.getAttribute("data-label") !== l) td.setAttribute("data-label", l);
          });
        });
      });
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ref, enabled]);
}

export function AdminTop({ title, children }: { title: string; children?: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} | iKart Admin`;
  }, [title]);
  return (
    <div className="admin-top">
      <h1>{title}</h1>
      <div className="row wrap">{children}</div>
    </div>
  );
}
