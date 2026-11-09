import { CUSTOM_FLOW, FLOW, STATUS_LABEL, fmtDateTime, isCustom } from "../lib/format";
import type { Order, OrderStatus } from "../lib/types";

/** Customer-facing milestones for custom print orders (the admin workflow has more steps). */
const CUSTOM_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "CUSTOM_NEW", label: "Order received" },
  { status: "DESIGN_APPROVED", label: "Design approved" },
  { status: "PRINTING", label: "Printing" },
  { status: "READY_TO_SHIP", label: "Ready to ship" },
  { status: "SHIPPED", label: "Shipped" },
  { status: "DELIVERED", label: "Delivered" },
];

export function Tracker({ order }: { order: Order }) {
  if (order.status === "CANCELLED" || order.status === "PENDING_PAYMENT") return null;
  const custom = isCustom(order);
  const flow = custom ? CUSTOM_FLOW : FLOW;
  const steps = custom ? CUSTOM_STEPS : FLOW.map((s) => ({ status: s, label: STATUS_LABEL[s] }));
  const pos = flow.indexOf(order.status);
  // Last milestone the order has reached
  const idx = steps.reduce((acc, s, i) => (flow.indexOf(s.status) <= pos ? i : acc), -1);
  return (
    <div className="tracker">
      <div className="bar" style={{ width: `${(Math.max(idx, 0) / (steps.length - 1)) * 88}%` }} />
      {steps.map((s, i) => (
        <div key={s.status} className={`st ${i <= idx ? "done" : ""}`}>
          <i>{i <= idx ? "✓" : i + 1}</i>
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Timeline({ order }: { order: Order }) {
  const events = [...order.events].reverse();
  return (
    <ul className="timeline">
      {events.map((e, i) => (
        <li key={i} className={e.status === "CANCELLED" ? "cancel" : ""}>
          <b>{STATUS_LABEL[e.status] ?? e.status}</b>
          {e.note && <div className="muted small">{e.note}</div>}
          <small>{fmtDateTime(e.created_at)}</small>
        </li>
      ))}
    </ul>
  );
}
