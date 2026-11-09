import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useDesignEditor } from "../../components/DesignEditor";
import { Empty, Loader } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";
import { api } from "../../lib/api";
import { type EditorDesign, emptyDesign, loadDesign, printedSides, saveDesign } from "../../lib/designState";
import { SIDE_LABEL, designSides, fmtDate } from "../../lib/format";
import type { CustomDesign, Order, PrintSide } from "../../lib/types";

/** Customer replaces the design of a custom order after the store asked for a new one. */
export default function Redesign() {
  const { number } = useParams();
  const { user, ready } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState("");
  const [design, setDesign] = useState<EditorDesign>(emptyDesign);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const item = order?.items.find((i) => i.custom_design);
  const d: CustomDesign | undefined = item?.custom_design || undefined;
  const color = d?.color_hex || "#ffffff";
  const paid: PrintSide[] = d ? designSides(d).map((s) => s.side) : [];
  const editor = useDesignEditor({ color, design, setDesign });

  useEffect(() => {
    if (!user) return;
    api<Order>(`/api/orders/${number}`)
      .then(async (o) => {
        setOrder(o);
        const cd = o.items.find((i) => i.custom_design)?.custom_design;
        if (cd) setDesign(await loadDesign(designSides(cd)));
        setLoaded(true);
      })
      .catch((e) => setErr(e.message));
  }, [number, user]);

  if (!ready) return <Loader />;
  if (!user) return <Navigate to={`/login?next=/redesign/${number}`} replace />;
  if (err) return <div className="container"><Empty title="Order not found">{err}</Empty></div>;
  if (!order || !loaded) return <Loader />;
  if (!d?.change_request)
    return (
      <div className="container">
        <Empty title="No new design needed">
          <p className="muted">This order isn't waiting for a new design.</p>
          <Link to={`/account/orders/${order.order_number}`} className="btn mt-16">View order</Link>
        </Empty>
      </div>
    );

  const now = printedSides(design);
  const sameSides = now.length === paid.length && now.every((s) => paid.includes(s));

  const submit = async () => {
    setSaving(true);
    try {
      const saved = await saveDesign(design, color);
      await api<Order>(`/api/custom/orders/${order.order_number}/design`, { body: saved.payload });
      toast("Thanks! Your new design was sent to our team.", "success");
      nav(`/account/orders/${order.order_number}`, { replace: true });
    } catch (e) {
      toast((e as Error).message, "error");
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <div className="page-head">
        <div className="crumbs"><Link to={`/account/orders/${order.order_number}`}>Order #{order.order_number}</Link> / New design</div>
        <h1>Update your design</h1>
      </div>
      <div className="note-box warn mb-16">
        <b>Message from our team ({fmtDate(d.change_request.requested_at)}):</b> {d.change_request.message}
      </div>
      <div className="custom-layout">
        <div className="custom-stage">{editor.stage}</div>
        <div className="custom-steps">
          <section className="card co-step">
            <p className="small muted" style={{ marginTop: 0 }}>
              {item?.product_name.replace(/^Custom print · /, "")} · {item?.color} · Size {item?.size}. Your order includes printing on the{" "}
              <b>{paid.map((s) => SIDE_LABEL[s].toLowerCase()).join(" and ")}</b>, so your new design must use the same side{paid.length > 1 ? "s" : ""}.
            </p>
            {editor.panel}
          </section>
          <div className="card">
            {!sameSides && (
              <div className="small mb-16" style={{ color: "var(--bad)" }}>
                Please add a design to the {paid.map((s) => SIDE_LABEL[s].toLowerCase()).join(" and ")} only.
              </div>
            )}
            <button className="btn block lg" disabled={!sameSides || saving} onClick={submit}>
              {saving ? "Sending your design…" : "Send new design"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
