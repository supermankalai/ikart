import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    Address, Coupon, Order, OrderEvent, OrderItem, OrderStatus, OrderType, PaymentMethod, PaymentStatus, ProductVariant,
    User, flow_for, is_custom,
)
from ..schemas import OrderCreateIn, OrderSummary, PaymentSession, ShipIn
from . import cashfree
from .pricing import build_quote
from .shipping import ShippingError, get_provider, interpret_partner_status
from .store_settings import get_store_settings
from .utils import new_order_number

log = logging.getLogger("ikart.orders")

DEFAULT_NOTES = {
    OrderStatus.PENDING_PAYMENT: "Waiting for payment",
    OrderStatus.PLACED: "Order confirmed",
    OrderStatus.PACKED: "Your order has been packed",
    OrderStatus.SHIPPED: "Handed over to the delivery partner",
    OrderStatus.OUT_FOR_DELIVERY: "Out for delivery",
    OrderStatus.DELIVERED: "Delivered. Enjoy your purchase!",
    OrderStatus.CANCELLED: "Order cancelled",
    OrderStatus.CUSTOM_NEW: "Custom print order received",
    OrderStatus.DESIGN_REVIEW: "Our team is reviewing your design",
    OrderStatus.DESIGN_APPROVED: "Your design is approved for printing",
    OrderStatus.PRINTING: "Your T-shirt is being printed",
    OrderStatus.QUALITY_CHECK: "Print quality check in progress",
    OrderStatus.READY_TO_SHIP: "Packed and ready to ship",
}


def first_status(order: Order) -> str:
    """Status an order moves to once it is confirmed (COD placed, or online payment received)."""
    return OrderStatus.CUSTOM_NEW if is_custom(order) else OrderStatus.PLACED


def now() -> datetime:
    return datetime.now(timezone.utc)


def add_event(order: Order, status: str, note: str | None = None) -> None:
    order.events.append(OrderEvent(status=status, note=note or DEFAULT_NOTES.get(status), created_at=now()))


def _unique_order_number(db: Session) -> str:
    for _ in range(10):
        n = new_order_number()
        if not db.scalar(select(Order.id).where(Order.order_number == n)):
            return n
    raise HTTPException(500, "Could not generate order number")


# ---------- Create ----------
def create_order(db: Session, user: User, data: OrderCreateIn) -> tuple[Order, PaymentSession | None]:
    expire_stale_orders(db)

    address = db.get(Address, data.address_id)
    if not address or address.user_id != user.id:
        raise HTTPException(404, "Delivery address not found")

    quote, priced, coupon = build_quote(db, data.items, data.coupon_code, lock=True)
    if quote.has_issues or not priced:
        raise HTTPException(409, "Some items in your cart are no longer available. Please review your cart.")
    if data.coupon_code and not coupon:
        raise HTTPException(400, quote.coupon_message or "Invalid coupon")
    if data.payment_method == PaymentMethod.COD and not quote.cod_enabled:
        raise HTTPException(400, "Cash on delivery is not available for this order")

    order = Order(
        order_number=_unique_order_number(db),
        user_id=user.id,
        order_type=OrderType.STANDARD,
        payment_method=data.payment_method,
        payment_status=PaymentStatus.PENDING,
        status=OrderStatus.PLACED if data.payment_method == PaymentMethod.COD else OrderStatus.PENDING_PAYMENT,
        subtotal=quote.subtotal,
        discount=quote.discount,
        shipping_fee=quote.shipping_fee,
        total=quote.total,
        coupon_code=coupon.code if coupon else None,
        notes=data.notes,
        shipping_address={
            "name": address.name, "phone": address.phone, "line1": address.line1, "line2": address.line2,
            "city": address.city, "state": address.state, "pincode": address.pincode,
        },
    )
    for pl in priced:
        v = pl.variant
        v.stock -= pl.quantity
        p = v.product
        order.items.append(OrderItem(
            product_id=p.id, variant_id=v.id, product_name=p.name, product_slug=p.slug, size=v.size,
            color=v.color, image_url=p.images[0].url if p.images else None,
            unit_price=pl.unit_price, quantity=pl.quantity,
        ))
    if coupon:
        coupon.used_count += 1

    add_event(order, order.status, "Order placed · Cash on delivery" if data.payment_method == PaymentMethod.COD else None)
    db.add(order)
    db.flush()

    session = None
    if data.payment_method == PaymentMethod.ONLINE:
        try:
            session = start_payment(order, user)
        except cashfree.CashfreeError as e:
            db.rollback()
            raise HTTPException(502, str(e))
    db.commit()
    db.refresh(order)
    return order, session


# ---------- Payment ----------
def start_payment(order: Order, user: User) -> PaymentSession:
    """Creates a fresh Cashfree order for this iKart order (one per attempt)."""
    if order.status != OrderStatus.PENDING_PAYMENT:
        raise HTTPException(400, "This order does not need payment")
    order.payment_attempts = (order.payment_attempts or 0) + 1
    cf_order_id = f"{order.order_number}_{order.payment_attempts}"
    order.updated_at = now()

    if settings.cashfree_enabled:
        resp = cashfree.create_order(order, user, cf_order_id)
        session_id = resp.get("payment_session_id")
        if not session_id:
            raise cashfree.CashfreeError("Payment gateway did not return a session")
        mode = "cashfree"
    else:
        session_id = f"mock_session_{cf_order_id}"
        mode = "mock"

    order.cf_order_id = cf_order_id
    order.payment_session_id = session_id
    return PaymentSession(mode=mode, env=settings.cashfree_env, payment_session_id=session_id, cf_order_id=cf_order_id)


def mark_paid(order: Order, payment_ref: str | None, payment_mode: str | None) -> None:
    if order.payment_status == PaymentStatus.PAID:
        return
    order.payment_status = PaymentStatus.PAID
    order.payment_ref = payment_ref
    order.payment_mode = payment_mode
    order.paid_at = now()
    if order.status == OrderStatus.PENDING_PAYMENT:
        order.status = first_status(order)
        add_event(order, order.status, "Payment received · Order confirmed")
    else:
        # Payment arrived after the order was cancelled/expired: needs a manual refund.
        add_event(order, order.status, f"Payment {payment_ref} received after cancellation. Refund required.")
        log.warning("Late payment on cancelled order %s", order.order_number)


def sync_payment_from_cashfree(order: Order) -> None:
    """Asks Cashfree for the real status of the latest attempt and updates the order."""
    if not settings.cashfree_enabled or not order.cf_order_id or order.payment_status == PaymentStatus.PAID:
        return
    data = cashfree.fetch_order(order.cf_order_id)
    if data.get("order_status") == "PAID":
        ref, mode = None, None
        try:
            for p in cashfree.fetch_payments(order.cf_order_id):
                if p.get("payment_status") == "SUCCESS":
                    ref, mode = str(p.get("cf_payment_id")), p.get("payment_group")
                    break
        except cashfree.CashfreeError:
            pass
        mark_paid(order, ref or data.get("cf_order_id"), mode)


# ---------- Cancel / refund ----------
def _restore_stock(db: Session, order: Order) -> None:
    for it in order.items:
        if it.variant_id:
            v = db.get(ProductVariant, it.variant_id)
            if v:
                v.stock += it.quantity
    if order.coupon_code:
        c = db.scalar(select(Coupon).where(Coupon.code == order.coupon_code))
        if c and c.used_count > 0:
            c.used_count -= 1


def cancel_order(db: Session, order: Order, reason: str | None, by_admin: bool) -> Order:
    if order.status in (OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED):
        raise HTTPException(400, "Shipped orders cannot be cancelled")
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(400, "Order is already cancelled")
    if not by_admin and order.status not in (OrderStatus.PENDING_PAYMENT, OrderStatus.PLACED, OrderStatus.CUSTOM_NEW):
        raise HTTPException(400, "This order is already being prepared. Please contact support to cancel.")

    # Make sure we don't cancel an order that was actually paid moments ago
    if order.status == OrderStatus.PENDING_PAYMENT:
        try:
            sync_payment_from_cashfree(order)
        except cashfree.CashfreeError:
            pass

    if order.payment_status == PaymentStatus.PAID and order.payment_method == PaymentMethod.ONLINE:
        refund_id = f"RF{order.order_number}"
        if settings.cashfree_enabled and order.cf_order_id:
            try:
                cashfree.create_refund(order.cf_order_id, order.total, refund_id, reason or "Order cancelled")
            except cashfree.CashfreeError as e:
                raise HTTPException(502, f"Refund failed: {e}")
        order.payment_status = PaymentStatus.REFUNDED
        order.refund_ref = refund_id
        note = f"Order cancelled · Refund of ₹{order.total} initiated"
    else:
        if order.payment_method == PaymentMethod.ONLINE:
            order.payment_status = PaymentStatus.FAILED
        note = "Order cancelled"
    if reason:
        note += f" · {reason}"

    # A Shiprocket order may exist if shipping was started but not finished (e.g. wallet too low)
    if order.partner_order_id and order.shipping_provider:
        try:
            get_provider(order.shipping_provider).cancel_shipment(order)
            note += f" · {order.shipping_provider.title()} order cancelled"
        except ShippingError as e:
            note += f" · Could not cancel the {order.shipping_provider.title()} order ({e}), cancel it in their panel"

    _restore_stock(db, order)
    order.status = OrderStatus.CANCELLED
    add_event(order, OrderStatus.CANCELLED, note)
    db.commit()
    db.refresh(order)
    return order


def expire_stale_orders(db: Session) -> int:
    """Cancel unpaid online orders older than the expiry window and release their stock."""
    cutoff = now() - timedelta(minutes=settings.pending_payment_expiry_minutes)
    stale = db.scalars(
        select(Order).where(Order.status == OrderStatus.PENDING_PAYMENT, Order.updated_at < cutoff)
    ).all()
    count = 0
    for o in stale:
        try:
            sync_payment_from_cashfree(o)
        except cashfree.CashfreeError:
            continue  # try again later rather than cancel a possibly-paid order
        if o.payment_status == PaymentStatus.PAID:
            continue
        o.payment_status = PaymentStatus.FAILED
        o.status = OrderStatus.CANCELLED
        _restore_stock(db, o)
        add_event(o, OrderStatus.CANCELLED, "Payment not completed in time · Order cancelled")
        count += 1
    if stale:
        db.commit()
    return count


# ---------- Fulfilment (admin) ----------
def set_status(db: Session, order: Order, status: str, note: str | None) -> Order:
    flow = flow_for(order)
    if status not in flow:
        raise HTTPException(400, "Invalid status")
    if order.status not in flow:
        raise HTTPException(400, f"Cannot change status of a {order.status.replace('_', ' ').lower()} order")
    if flow.index(status) <= flow.index(order.status):
        raise HTTPException(400, "Orders can only move forward")
    if status in (OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED) and not order.awb:
        raise HTTPException(400, "Create the shipment first")
    if status == OrderStatus.SHIPPED:
        raise HTTPException(400, "Use 'Create shipment' to ship an order")

    order.status = status
    if status == OrderStatus.DELIVERED:
        order.delivered_at = now()
        if order.payment_method == PaymentMethod.COD and order.payment_status != PaymentStatus.PAID:
            order.payment_status = PaymentStatus.PAID
            order.payment_ref = "COD"
            order.payment_mode = "cash"
            order.paid_at = now()
    add_event(order, status, note)
    db.commit()
    db.refresh(order)
    return order


def ship_order(db: Session, order: Order, data: ShipIn) -> Order:
    if is_custom(order):
        if order.status != OrderStatus.READY_TO_SHIP:
            raise HTTPException(400, "Custom orders can be shipped once they are marked Ready to ship")
    elif order.status not in (OrderStatus.PLACED, OrderStatus.PACKED):
        raise HTTPException(400, "Only placed or packed orders can be shipped")
    if data.method == "shiprocket" and not settings.shiprocket_enabled:
        raise HTTPException(400, "Shiprocket is not set up. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to backend/.env")
    try:
        result = get_provider(data.method).create_shipment(order, get_store_settings(db), data)
    except ShippingError as e:
        db.commit()  # keep any partner ids already created, so a retry continues where it stopped
        raise HTTPException(400, str(e))
    order.shipping_provider = order.shipping_provider or data.method
    order.shipping_partner = result.partner
    order.awb = result.awb
    order.tracking_url = result.tracking_url
    order.label_url = result.label_url
    order.shipped_at = now()
    order.status = OrderStatus.SHIPPED
    note = f"Shipped via {result.partner} · AWB {result.awb}"
    add_event(order, OrderStatus.SHIPPED, f"{note} · {result.note}" if result.note else note)
    db.commit()
    db.refresh(order)
    return order


def _partner_order(order: Order) -> str:
    if order.shipping_provider != "shiprocket" or not order.partner_shipment_id:
        raise HTTPException(400, "This order was not shipped through Shiprocket")
    return order.partner_shipment_id


def request_partner_pickup(db: Session, order: Order) -> Order:
    from . import shiprocket

    shipment_id = _partner_order(order)
    try:
        when = shiprocket.request_pickup(shipment_id)
    except shiprocket.ShiprocketError as e:
        raise HTTPException(502, str(e))
    order.pickup_requested_at = now()
    add_event(order, order.status, f"Pickup requested{f' for {when}' if when else ''}")
    db.commit()
    db.refresh(order)
    return order


def fetch_partner_label(db: Session, order: Order) -> Order:
    from . import shiprocket

    shipment_id = _partner_order(order)
    try:
        order.label_url = shiprocket.generate_label(shipment_id)
    except shiprocket.ShiprocketError as e:
        raise HTTPException(502, str(e))
    db.commit()
    db.refresh(order)
    return order


def sync_partner_tracking(db: Session, order: Order) -> Order:
    """Pull the latest courier status (useful when the webhook is not set up, e.g. on localhost)."""
    from . import shiprocket

    _partner_order(order)
    if not order.awb:
        raise HTTPException(400, "No AWB on this order yet")
    try:
        raw, track_url = shiprocket.track(order.awb)
    except shiprocket.ShiprocketError as e:
        raise HTTPException(502, str(e))
    if track_url:
        order.tracking_url = track_url
    if raw:
        apply_partner_update(db, order, raw, None)
    db.commit()
    db.refresh(order)
    return order


def apply_partner_update(db: Session, order: Order, raw_status: str, note: str | None) -> None:
    """Apply a courier status (from a webhook or tracking sync) to the order."""
    status, alert = interpret_partner_status(raw_status)
    pretty = raw_status.strip().replace("_", " ").title()
    changed = (order.partner_status or "").lower() != raw_status.strip().lower()
    order.partner_status = raw_status.strip()[:80]
    if status:
        apply_partner_status(db, order, status, note or f"Courier update: {pretty}")
        return
    if alert and changed:
        add_event(order, order.status, note or f"Courier update: {pretty}. Check with the courier / Shiprocket.")
    db.commit()


def apply_partner_status(db: Session, order: Order, status: str, note: str | None) -> None:
    flow = flow_for(order)
    if order.status not in flow or flow.index(status) <= flow.index(order.status):
        db.commit()
        return  # ignore duplicates / out-of-order webhooks
    order.status = status
    if status == OrderStatus.DELIVERED:
        order.delivered_at = now()
        if order.payment_method == PaymentMethod.COD:
            order.payment_status = PaymentStatus.PAID
            order.payment_ref = "COD"
            order.payment_mode = "cash"
            order.paid_at = now()
    add_event(order, status, note)
    db.commit()


# ---------- Shapes ----------
def order_summary(o: Order) -> OrderSummary:
    addr = o.shipping_address or {}
    return OrderSummary(
        order_number=o.order_number, status=o.status, payment_method=o.payment_method,
        payment_status=o.payment_status, total=o.total, created_at=o.created_at,
        item_count=sum(i.quantity for i in o.items),
        first_image=next((i.image_url for i in o.items if i.image_url), None),
        customer_name=addr.get("name") or o.user.name, customer_phone=addr.get("phone") or o.user.phone,
        city=addr.get("city"), awb=o.awb, payment_ref=o.payment_ref, order_type=o.order_type or OrderType.STANDARD,
    )
