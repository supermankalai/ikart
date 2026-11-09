import type { CustomDesign, DesignSide, Order, OrderStatus, PaymentStatus } from "./types";

export const money = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");

export const discountPct = (price: number, mrp: number) =>
  mrp > price ? Math.round((1 - price / mrp) * 100) : 0;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PLACED: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  CUSTOM_NEW: "New custom order",
  DESIGN_REVIEW: "Design review",
  DESIGN_APPROVED: "Design approved",
  PRINTING: "Printing",
  QUALITY_CHECK: "Quality check",
  READY_TO_SHIP: "Ready to ship",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "warn",
  PLACED: "info",
  PACKED: "warn",
  SHIPPED: "info",
  OUT_FOR_DELIVERY: "warn",
  DELIVERED: "ok",
  CANCELLED: "bad",
  CUSTOM_NEW: "info",
  DESIGN_REVIEW: "warn",
  DESIGN_APPROVED: "info",
  PRINTING: "warn",
  QUALITY_CHECK: "warn",
  READY_TO_SHIP: "info",
};

export const PAY_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export const PAY_TONE: Record<PaymentStatus, string> = {
  PENDING: "warn",
  PAID: "ok",
  FAILED: "bad",
  REFUNDED: "neutral",
};

export const FLOW: OrderStatus[] = ["PLACED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

/** Production workflow for custom-printed T-shirt orders. */
export const CUSTOM_FLOW: OrderStatus[] = [
  "CUSTOM_NEW", "DESIGN_REVIEW", "DESIGN_APPROVED", "PRINTING", "QUALITY_CHECK", "READY_TO_SHIP",
  "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED",
];

export const isCustom = (o: Pick<Order, "order_type">) => o.order_type === "CUSTOM";

/** Printed sides of a custom design (also reads designs saved in the first, single-image format). */
export function designSides(d: Pick<CustomDesign, "sides" | "artwork_url" | "preview_url" | "placement" | "artwork_width" | "artwork_height">): DesignSide[] {
  if (d.sides?.length) return d.sides;
  if (!d.artwork_url || !d.placement) return [];
  return [{
    side: "front",
    preview_url: d.preview_url,
    layers: [{ type: "image", url: d.artwork_url, ...d.placement, width: d.artwork_width, height: d.artwork_height }],
  }];
}

export const SIDE_LABEL = { front: "Front", back: "Back" } as const;
export const flowFor = (o: Pick<Order, "order_type">) => (isCustom(o) ? CUSTOM_FLOW : FLOW);

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
  "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];
