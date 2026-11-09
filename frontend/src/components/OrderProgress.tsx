import { FLOW, STATUS_LABEL, fmtDateTime } from "../lib/format";
import type { Order } from "../lib/types";

export function Tracker({ order }: { order: Order }) {
  if (order.status === "CANCELLED" || order.status === "PENDING_PAYMENT") return null;
  const idx = FLOW.indexOf(order.status);
  return (
    <div className="tracker">
      <div className="bar" style={{ width: `${(idx / (FLOW.length - 1)) * 88}%` }} />
      {FLOW.map((s, i) => (
        <div key={s} className={`st ${i <= idx ? "done" : ""}`}>
          <i>{i <= idx ? "✓" : i + 1}</i>
          <span>{STATUS_LABEL[s]}</span>
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
          <b>{STATUS_LABEL[e.status]}</b>
          {e.note && <div className="muted small">{e.note}</div>}
          <small>{fmtDateTime(e.created_at)}</small>
        </li>
      ))}
    </ul>
  );
}
