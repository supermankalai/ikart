import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import Coupon, Order, OrderItem, OrderStatus, PaymentStatus, Product, ProductVariant, User
from ..schemas import (
    AdminSettingsOut, CancelIn, CouponIn, CouponOut, CourierQuoteOut, CustomerOut, CustomerPage, IntegrationStatus,
    OrderAdminOut, OrderPage, ShipIn, StatusUpdateIn, StoreSettings,
)
from ..services import orders as svc
from ..services import shiprocket
from ..services.store_settings import get_store_settings, save_store_settings

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

INACTIVE = (OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------- Dashboard ----------
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    svc.expire_stale_orders(db)
    today = datetime.now(timezone.utc).date()
    since = datetime.combine(today - timedelta(days=13), time.min, tzinfo=timezone.utc)

    active = select(Order).where(Order.status.notin_(INACTIVE))
    recent_active = db.scalars(active.where(Order.created_at >= since)).all()
    by_day: dict[date, int] = {today - timedelta(days=i): 0 for i in range(14)}
    orders_today = revenue_today = 0
    for o in recent_active:
        d = _aware(o.created_at).date()
        if d in by_day:
            by_day[d] += o.total
        if d == today:
            orders_today += 1
            revenue_today += o.total

    collected = db.scalar(select(func.coalesce(func.sum(Order.total), 0)).where(Order.payment_status == PaymentStatus.PAID)) or 0
    gross = db.scalar(select(func.coalesce(func.sum(Order.total), 0)).where(Order.status.notin_(INACTIVE))) or 0
    count_by_status = dict(db.execute(select(Order.status, func.count(Order.id)).group_by(Order.status)).all())

    top = db.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity).label("qty"),
               func.sum(OrderItem.quantity * OrderItem.unit_price).label("revenue"), func.max(OrderItem.image_url))
        .join(Order).where(Order.status.notin_(INACTIVE))
        .group_by(OrderItem.product_name).order_by(func.sum(OrderItem.quantity).desc()).limit(5)
    ).all()
    low = db.execute(
        select(Product.id, Product.name, ProductVariant.size, ProductVariant.color, ProductVariant.stock)
        .join(Product).where(ProductVariant.stock < 5, Product.is_active.is_(True))
        .order_by(ProductVariant.stock, Product.name).limit(10)
    ).all()
    recent = db.scalars(select(Order).order_by(Order.created_at.desc()).limit(8)).all()

    return {
        "gross_sales": gross,
        "collected": collected,
        "orders_today": orders_today,
        "revenue_today": revenue_today,
        "to_ship": count_by_status.get(OrderStatus.PLACED, 0) + count_by_status.get(OrderStatus.PACKED, 0),
        "in_transit": count_by_status.get(OrderStatus.SHIPPED, 0) + count_by_status.get(OrderStatus.OUT_FOR_DELIVERY, 0),
        "pending_payment": count_by_status.get(OrderStatus.PENDING_PAYMENT, 0),
        "status_counts": count_by_status,
        "customers": db.scalar(select(func.count(User.id)).where(User.is_admin.is_(False))) or 0,
        "products": db.scalar(select(func.count(Product.id))) or 0,
        "sales_by_day": [{"date": d.isoformat(), "total": by_day[d]} for d in sorted(by_day)],
        "top_products": [{"name": r[0], "qty": int(r[1] or 0), "revenue": int(r[2] or 0), "image": r[3]} for r in top],
        "low_stock": [{"product_id": r[0], "name": r[1], "size": r[2], "color": r[3], "stock": r[4]} for r in low],
        "recent_orders": [svc.order_summary(o) for o in recent],
    }


# ---------- Orders ----------
def _order_query(status, payment_status, payment_method, q, date_from, date_to):
    stmt = select(Order).join(User)
    if status:
        stmt = stmt.where(Order.status == status)
    if payment_status:
        stmt = stmt.where(Order.payment_status == payment_status)
    if payment_method:
        stmt = stmt.where(Order.payment_method == payment_method)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Order.order_number.ilike(like), Order.awb.ilike(like), Order.payment_ref.ilike(like),
                              User.name.ilike(like), User.email.ilike(like), User.phone.ilike(like)))
    if date_from:
        stmt = stmt.where(Order.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(Order.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc))
    return stmt


@router.get("/orders", response_model=OrderPage)
def list_orders(
    status: str | None = None,
    payment_status: str | None = None,
    payment_method: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    svc.expire_stale_orders(db)
    stmt = _order_query(status, payment_status, payment_method, q, date_from, date_to)
    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(Order.id).subquery())) or 0
    rows = db.scalars(stmt.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return OrderPage(items=[svc.order_summary(o) for o in rows], total=total, page=page, page_size=page_size)


@router.get("/orders/export")
def export_orders(
    status: str | None = None,
    payment_status: str | None = None,
    payment_method: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    rows = db.scalars(_order_query(status, payment_status, payment_method, q, date_from, date_to)
                      .order_by(Order.created_at.desc())).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Order", "Date", "Customer", "Phone", "Email", "Address", "City", "State", "Pincode", "Items",
                "Subtotal", "Discount", "Shipping", "Total", "Payment method", "Payment status", "Payment ref",
                "Status", "Partner", "AWB"])
    for o in rows:
        a = o.shipping_address or {}
        items = "; ".join(f"{i.product_name} ({i.size}/{i.color}) x{i.quantity}" for i in o.items)
        w.writerow([o.order_number, _aware(o.created_at).strftime("%Y-%m-%d %H:%M"), a.get("name"), a.get("phone"),
                    o.user.email, " ".join(filter(None, [a.get("line1"), a.get("line2")])), a.get("city"),
                    a.get("state"), a.get("pincode"), items, o.subtotal, o.discount, o.shipping_fee, o.total,
                    o.payment_method, o.payment_status, o.payment_ref, o.status, o.shipping_partner, o.awb])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=ikart-orders.csv"})


def _get_order(db: Session, number: str) -> Order:
    o = db.scalar(select(Order).where(Order.order_number == number))
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@router.get("/orders/{number}", response_model=OrderAdminOut)
def get_order(number: str, db: Session = Depends(get_db)):
    return _get_order(db, number)


@router.post("/orders/{number}/status", response_model=OrderAdminOut)
def update_status(number: str, data: StatusUpdateIn, db: Session = Depends(get_db)):
    return svc.set_status(db, _get_order(db, number), data.status, data.note)


@router.post("/orders/{number}/ship", response_model=OrderAdminOut)
def ship(number: str, data: ShipIn, db: Session = Depends(get_db)):
    return svc.ship_order(db, _get_order(db, number), data)


@router.get("/orders/{number}/couriers", response_model=CourierQuoteOut)
def couriers(number: str, weight_kg: float | None = Query(None, gt=0, le=50), db: Session = Depends(get_db)):
    """Courier options and rates from Shiprocket for this order's PIN code."""
    if not settings.shiprocket_enabled:
        raise HTTPException(400, "Shiprocket is not set up. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to backend/.env")
    o = _get_order(db, number)
    store = get_store_settings(db)
    weight = weight_kg or shiprocket.parcel_weight(o, store.parcel_weight_per_item_kg, store.parcel_min_weight_kg)
    try:
        options = shiprocket.couriers(o, weight)
    except shiprocket.ShiprocketError as e:
        raise HTTPException(502, str(e))
    return CourierQuoteOut(weight_kg=weight, couriers=options)


@router.post("/orders/{number}/pickup", response_model=OrderAdminOut)
def request_pickup(number: str, db: Session = Depends(get_db)):
    return svc.request_partner_pickup(db, _get_order(db, number))


@router.post("/orders/{number}/label", response_model=OrderAdminOut)
def get_label(number: str, db: Session = Depends(get_db)):
    return svc.fetch_partner_label(db, _get_order(db, number))


@router.post("/orders/{number}/sync-tracking", response_model=OrderAdminOut)
def sync_tracking(number: str, db: Session = Depends(get_db)):
    return svc.sync_partner_tracking(db, _get_order(db, number))


@router.post("/orders/{number}/cancel", response_model=OrderAdminOut)
def cancel(number: str, data: CancelIn, db: Session = Depends(get_db)):
    return svc.cancel_order(db, _get_order(db, number), data.reason, by_admin=True)


@router.post("/orders/{number}/sync-payment", response_model=OrderAdminOut)
def sync_payment(number: str, db: Session = Depends(get_db)):
    o = _get_order(db, number)
    try:
        svc.sync_payment_from_cashfree(o)
    except svc.cashfree.CashfreeError as e:
        raise HTTPException(502, str(e))
    db.commit()
    db.refresh(o)
    return o


# ---------- Customers ----------
@router.get("/customers", response_model=CustomerPage)
def customers(q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
              db: Session = Depends(get_db)):
    agg = (select(Order.user_id, func.count(Order.id).label("cnt"), func.coalesce(func.sum(Order.total), 0).label("spent"))
           .where(Order.status.notin_(INACTIVE)).group_by(Order.user_id).subquery())
    stmt = select(User, func.coalesce(agg.c.cnt, 0), func.coalesce(agg.c.spent, 0)).outerjoin(agg, agg.c.user_id == User.id)
    stmt = stmt.where(User.is_admin.is_(False))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.name.ilike(like), User.email.ilike(like), User.phone.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.execute(stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return CustomerPage(
        items=[CustomerOut(id=u.id, name=u.name, email=u.email, phone=u.phone, created_at=u.created_at,
                           order_count=int(c), total_spent=int(s)) for u, c, s in rows],
        total=total, page=page, page_size=page_size,
    )


# ---------- Coupons ----------
@router.get("/coupons", response_model=list[CouponOut])
def list_coupons(db: Session = Depends(get_db)):
    return db.scalars(select(Coupon).order_by(Coupon.created_at.desc())).all()


@router.post("/coupons", response_model=CouponOut, status_code=201)
def create_coupon(data: CouponIn, db: Session = Depends(get_db)):
    if data.discount_type == "percent" and data.value > 90:
        raise HTTPException(400, "Percentage discount cannot be more than 90%")
    c = Coupon(**data.model_dump())
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A coupon with this code already exists")
    db.refresh(c)
    return c


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, data: CouponIn, db: Session = Depends(get_db)):
    c = db.get(Coupon, coupon_id)
    if not c:
        raise HTTPException(404, "Coupon not found")
    if data.discount_type == "percent" and data.value > 90:
        raise HTTPException(400, "Percentage discount cannot be more than 90%")
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A coupon with this code already exists")
    db.refresh(c)
    return c


@router.delete("/coupons/{coupon_id}", status_code=204)
def delete_coupon(coupon_id: int, db: Session = Depends(get_db)):
    c = db.get(Coupon, coupon_id)
    if c:
        db.delete(c)
        db.commit()


# ---------- Settings ----------
def _integrations() -> IntegrationStatus:
    return IntegrationStatus(
        cashfree_mode="cashfree" if settings.cashfree_enabled else "mock",
        cashfree_env=settings.cashfree_env,
        shipping_provider=settings.shipping_provider,
        backend_url=settings.backend_url,
        shiprocket_configured=settings.shiprocket_enabled,
        shiprocket_pickup_location=settings.shiprocket_pickup_location,
        shipping_webhook_url=f"{settings.backend_url.rstrip('/')}/api/shipping/webhook",
        shipping_webhook_secret_set=bool(settings.shipping_webhook_secret)
        and settings.shipping_webhook_secret != "change-this-webhook-secret",
    )


@router.get("/settings", response_model=AdminSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return AdminSettingsOut(store=get_store_settings(db), integrations=_integrations())


@router.put("/settings", response_model=AdminSettingsOut)
def put_settings(data: StoreSettings, db: Session = Depends(get_db)):
    return AdminSettingsOut(store=save_store_settings(db, data), integrations=_integrations())
