import hmac
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Order, OrderStatus, PaymentStatus, User
from ..schemas import CancelIn, MockCompleteIn, OrderCreateIn, OrderCreateOut, OrderOut, OrderPage, PaymentSession, VerifyIn
from ..services import cashfree
from ..services import orders as svc

router = APIRouter(prefix="/api", tags=["orders"])
log = logging.getLogger("ikart.orders")


def _my_order(db: Session, user: User, number: str) -> Order:
    o = db.scalar(select(Order).where(Order.order_number == number))
    if not o or (o.user_id != user.id and not user.is_admin):
        raise HTTPException(404, "Order not found")
    return o


@router.post("/orders", response_model=OrderCreateOut, status_code=201)
def place_order(data: OrderCreateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order, session = svc.create_order(db, user, data)
    return OrderCreateOut(order=OrderOut.model_validate(order), payment=session)


@router.get("/orders", response_model=OrderPage)
def my_orders(page: int = 1, page_size: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    page, page_size = max(page, 1), min(max(page_size, 1), 50)
    stmt = select(Order).where(Order.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return OrderPage(items=[svc.order_summary(o) for o in rows], total=total, page=page, page_size=page_size)


@router.get("/orders/{number}", response_model=OrderOut)
def order_detail(number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _my_order(db, user, number)


@router.post("/orders/{number}/pay", response_model=PaymentSession)
def retry_payment(number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = _my_order(db, user, number)
    try:
        svc.sync_payment_from_cashfree(order)
    except cashfree.CashfreeError:
        pass
    if order.payment_status == PaymentStatus.PAID:
        db.commit()
        raise HTTPException(400, "This order is already paid")
    try:
        session = svc.start_payment(order, order.user)
    except cashfree.CashfreeError as e:
        db.rollback()
        raise HTTPException(502, str(e))
    db.commit()
    return session


@router.post("/orders/{number}/cancel", response_model=OrderOut)
def cancel(number: str, data: CancelIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = _my_order(db, user, number)
    return svc.cancel_order(db, order, data.reason, by_admin=False)


# ---------- Payments ----------
@router.post("/payments/verify", response_model=OrderOut)
def verify_payment(data: VerifyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Called by the browser after Cashfree checkout closes. Confirms status with Cashfree server-side."""
    order = _my_order(db, user, data.order_number)
    try:
        svc.sync_payment_from_cashfree(order)
    except cashfree.CashfreeError as e:
        raise HTTPException(502, str(e))
    db.commit()
    db.refresh(order)
    return order


@router.post("/payments/mock-complete", response_model=OrderOut)
def mock_complete(data: MockCompleteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """TEST MODE ONLY: simulates a Cashfree result when no Cashfree keys are configured."""
    if settings.cashfree_enabled:
        raise HTTPException(403, "Test payments are disabled when Cashfree is configured")
    order = _my_order(db, user, data.order_number)
    if order.status != OrderStatus.PENDING_PAYMENT:
        raise HTTPException(400, "This order is not awaiting payment")
    if data.success:
        svc.mark_paid(order, f"TEST{order.payment_attempts}{order.id:05d}", "test")
    else:
        svc.add_event(order, OrderStatus.PENDING_PAYMENT, "Payment failed. You can retry.")
    db.commit()
    db.refresh(order)
    return order


@router.post("/payments/webhook", include_in_schema=False)
async def cashfree_webhook(
    request: Request,
    x_webhook_signature: str | None = Header(None),
    x_webhook_timestamp: str | None = Header(None),
    db: Session = Depends(get_db),
):
    raw = await request.body()
    if not cashfree.verify_webhook_signature(raw, x_webhook_timestamp, x_webhook_signature):
        raise HTTPException(401, "Invalid signature")
    try:
        payload = json.loads(raw)
        cf_order_id = payload["data"]["order"]["order_id"]
    except (ValueError, KeyError, TypeError):
        return {"ok": True}
    order_number = cf_order_id.rsplit("_", 1)[0]
    order = db.scalar(select(Order).where(Order.order_number == order_number))
    if not order:
        return {"ok": True}
    # Re-confirm with Cashfree rather than trusting the payload alone
    if order.cf_order_id != cf_order_id:
        order.cf_order_id = cf_order_id
    try:
        svc.sync_payment_from_cashfree(order)
    except cashfree.CashfreeError:
        log.exception("Webhook sync failed for %s", cf_order_id)
        raise HTTPException(502, "Retry later")
    db.commit()
    return {"ok": True}


# ---------- Delivery partner webhook ----------
@router.post("/shipping/webhook", include_in_schema=False)
async def shipping_webhook(
    request: Request,
    x_webhook_secret: str | None = Header(None),
    x_api_key: str | None = Header(None),  # Shiprocket sends the token you set as "x-api-key"
    db: Session = Depends(get_db),
):
    secret = settings.shipping_webhook_secret
    given = x_webhook_secret or x_api_key or ""
    if not secret or not hmac.compare_digest(given.encode(), secret.encode()):
        raise HTTPException(401, "Invalid secret")
    try:
        payload = await request.json()
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        return {"ok": True, "ignored": "no JSON body"}  # e.g. a test ping from the partner panel

    # Generic format: {"awb", "status"}. Shiprocket format: {"awb", "current_status", "shipment_status", ...}
    awb = str(payload.get("awb") or payload.get("awb_code") or "").strip()
    raw_status = str(payload.get("status") or payload.get("current_status") or payload.get("shipment_status") or "").strip()
    if not awb or not raw_status:
        return {"ok": True, "ignored": "missing awb or status"}
    order = db.scalar(select(Order).where(Order.awb == awb))
    if not order:
        # 200 so the partner doesn't keep retrying shipments that were not created from this store
        log.info("Shipping webhook for unknown AWB %s", awb)
        return {"ok": True, "ignored": "unknown awb"}
    note = payload.get("note")
    if not note and payload.get("current_status"):
        scans = payload.get("scans") or []
        last = scans[-1] if scans and isinstance(scans[-1], dict) else {}
        where = last.get("location")
        note = f"Courier update: {raw_status.title()}" + (f" · {where}" if where else "")
    svc.apply_partner_update(db, order, raw_status, note)
    return {"ok": True}
