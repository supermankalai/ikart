import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import Designer, { type DesignRules, type DesignerInitial } from "../../components/designer/Designer";
import { Empty, Loader } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { loadDesign } from "../../lib/designState";
import { designSides, fmtDate } from "../../lib/format";
import type { CustomDesign, CustomProduct, Order } from "../../lib/types";

/** Customer replaces the design of a custom order after the store asked for a new one. */
export default function Redesign() {
  const { number } = useParams();
  const { user, ready } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [product, setProduct] = useState<CustomProduct | null>(null);
  const [initial, setInitial] = useState<DesignerInitial | null>(null);
  const [rules, setRules] = useState<DesignRules | null>(null);
  const [err, setErr] = useState("");

  const d: CustomDesign | undefined = order?.items.find((i) => i.custom_design)?.custom_design || undefined;

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const o = await api<Order>(`/api/orders/${number}`);
        setOrder(o);
        const item = o.items.find((i) => i.custom_design);
        const cd = item?.custom_design;
        if (!item || !cd) return;
        const sides = designSides(cd);
        // Use the shop's product when it's still available (photo mockups); otherwise a minimal stand-in
        const products = await api<CustomProduct[]>("/api/custom/products").catch(() => [] as CustomProduct[]);
        const p = products.find((x) => x.id === item.product_id) || ({
          id: item.product_id || 0, name: item.product_name.replace(/^Custom print · /, ""), slug: item.product_slug || "", price: 0, mrp: 0,
          image: null, hover_image: null, category: { id: 0, name: "", slug: "" }, sizes: [], colors: [], in_stock: true, is_featured: false,
          description: null, details: null, images: [], variants: [{ id: 0, size: item.size, color: item.color, color_hex: cd.color_hex || "#ffffff", sku: null, stock: 1 }],
        } as unknown as CustomProduct);
        setProduct(p);
        setInitial({ productId: p.id, color: item.color, design: await loadDesign(sides, cd.roster || []), roster: cd.roster || [] });
        setRules({
          sides: sides.map((s) => s.side),
          foilSides: sides.filter((s) => s.layers.some((l) => l.foil)).map((s) => s.side),
          name: sides.some((s) => s.layers.some((l) => l.type === "name")),
          number: sides.some((s) => s.layers.some((l) => l.type === "number")),
        });
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [number, user]);

  if (!ready) return <Loader />;
  if (!user) return <Navigate to={`/login?next=/redesign/${number}`} replace />;
  if (err) return <div className="container"><Empty title="Order not found">{err}</Empty></div>;
  if (!order) return <Loader />;
  if (!d?.change_request)
    return (
      <div className="container">
        <Empty title="No new design needed">
          <p className="muted">This order isn't waiting for a new design.</p>
          <Link to={`/account/orders/${order.order_number}`} className="btn mt-16">View order</Link>
        </Empty>
      </div>
    );
  if (!product || !initial || !rules) return <Loader />;

  return (
    <div className="container dz-page">
      <div className="dz-head">
        <div className="crumbs"><Link to={`/account/orders/${order.order_number}`}>Order #{order.order_number}</Link> / New design</div>
        <h1>Update your design</h1>
      </div>
      <Designer
        products={[product]}
        initial={initial}
        rules={rules}
        continueLabel="Send new design"
        banner={<div className="note-box warn mb-16"><b>Message from our team ({fmtDate(d.change_request.requested_at)}):</b> {d.change_request.message}</div>}
        onContinue={async (r) => {
          await api<Order>(`/api/custom/orders/${order.order_number}/design`, { body: r.saved.payload });
          toast("Thanks! Your new design was sent to our team.", "success");
          nav(`/account/orders/${order.order_number}`, { replace: true });
        }}
      />
    </div>
  );
}
