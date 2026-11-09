import { useEffect, type ReactNode } from "react";
import { PAY_LABEL, PAY_TONE, STATUS_LABEL, STATUS_TONE, discountPct, money } from "../lib/format";
import type { OrderStatus, PaymentStatus } from "../lib/types";
import Icon from "./Icon";

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children, footer }: { title: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  useEscape(onClose);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="overlay drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  );
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && fn();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn]);
}

export const Loader = () => (
  <div className="loader">
    <div className="spinner" />
  </div>
);

export function Empty({ title, children, icon = "bag" }: { title: string; children?: ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} className="icon" />
      <h3 className="mt-8">{title}</h3>
      {children}
    </div>
  );
}

export const StatusBadge = ({ status }: { status: OrderStatus }) => (
  <span className={`badge tone-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
);

export const PayBadge = ({ status }: { status: PaymentStatus }) => (
  <span className={`badge tone-${PAY_TONE[status]}`}>{PAY_LABEL[status]}</span>
);

export function Price({ price, mrp }: { price: number; mrp: number }) {
  const off = discountPct(price, mrp);
  return (
    <span>
      <span className="price">{money(price)}</span>
      {off > 0 && (
        <>
          <span className="mrp">{money(mrp)}</span>
          <span className="off">{off}% off</span>
        </>
      )}
    </span>
  );
}

export function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange(p: number): void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1,
  );
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        ‹
      </button>
      {nums.map((n, i) => (
        <span key={n} className="row" style={{ gap: 6 }}>
          {i > 0 && n - nums[i - 1] > 1 && <span className="muted">…</span>}
          <button className={n === page ? "on" : ""} onClick={() => onChange(n)}>
            {n}
          </button>
        </span>
      ))}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
        ›
      </button>
    </div>
  );
}

export function Img({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  if (!src) return <div className={className} style={{ background: "var(--surface-2)" }} aria-label={alt} />;
  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
