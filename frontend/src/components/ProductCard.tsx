import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import { useStore } from "../context/store";
import { useToast } from "../context/toast";
import { discountPct } from "../lib/format";
import type { ProductCard as P } from "../lib/types";
import Icon from "./Icon";
import { Price } from "./ui";

export default function ProductCard({ p }: { p: P }) {
  const { wishlist, toggleWishlist } = useStore();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const off = discountPct(p.price, p.mrp);
  const wished = wishlist.has(p.id);

  const onWish = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      nav(`/login?next=/product/${p.slug}`);
      return;
    }
    try {
      const added = await toggleWishlist(p.id);
      toast(added ? "Added to wishlist" : "Removed from wishlist");
    } catch {
      toast("Could not update wishlist", "error");
    }
  };

  return (
    <Link to={`/product/${p.slug}`} className="pcard">
      <div className="media">
        {p.image && <img src={p.image} alt={p.name} loading="lazy" />}
        {p.hover_image && <img src={p.hover_image} alt="" className="alt" loading="lazy" />}
        {!p.in_stock ? (
          <div className="sold">Sold out</div>
        ) : off >= 25 ? (
          <span className="flag">-{off}%</span>
        ) : p.is_featured ? (
          <span className="flag dark">Bestseller</span>
        ) : null}
        <button className="icon-btn wish" onClick={onWish} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}>
          <Icon name="heart" className={`icon sm heart ${wished ? "on" : ""}`} />
        </button>
        {p.in_stock && p.sizes.length > 0 && <div className="sizes">Sizes: {p.sizes.join(" · ")}</div>}
      </div>
      <div className="cat">{p.category.name}</div>
      <div className="name">{p.name}</div>
      <Price price={p.price} mrp={p.mrp} />
      {p.colors.length > 1 && (
        <div className="swatches">
          {p.colors.slice(0, 5).map((c) => (
            <span key={c.name} className="swatch-dot" title={c.name} style={{ background: c.hex || "#ccc" }} />
          ))}
        </div>
      )}
    </Link>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid-products">
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          <div className="skeleton" style={{ aspectRatio: "4/5" }} />
          <div className="skeleton mt-16" style={{ height: 14, width: "70%" }} />
          <div className="skeleton mt-8" style={{ height: 14, width: "40%" }} />
        </div>
      ))}
    </div>
  );
}
