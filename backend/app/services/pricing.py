"""Cart pricing: the single source of truth for prices, stock checks, coupons and shipping."""
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Coupon, ProductVariant
from ..schemas import CartItemIn, QuoteLine, QuoteOut
from .store_settings import get_store_settings


@dataclass
class PricedLine:
    variant: ProductVariant
    quantity: int
    unit_price: int


def evaluate_coupon(db: Session, code: str | None, subtotal: int) -> tuple[Coupon | None, int, str | None]:
    """Returns (coupon, discount, error_message)."""
    if not code:
        return None, 0, None
    coupon = db.scalar(select(Coupon).where(func.upper(Coupon.code) == code.strip().upper()))
    if not coupon or not coupon.is_active:
        return None, 0, "This coupon code is not valid"
    expires = coupon.expires_at
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires < datetime.now(timezone.utc):
        return None, 0, "This coupon has expired"
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        return None, 0, "This coupon has reached its usage limit"
    if subtotal < coupon.min_order:
        return None, 0, f"Add items worth ₹{coupon.min_order - subtotal} more to use this coupon"
    if coupon.discount_type == "percent":
        discount = subtotal * coupon.value // 100
        if coupon.max_discount:
            discount = min(discount, coupon.max_discount)
    else:
        discount = coupon.value
    return coupon, min(discount, subtotal), None


def build_quote(
    db: Session, items: list[CartItemIn], coupon_code: str | None, lock: bool = False
) -> tuple[QuoteOut, list[PricedLine], Coupon | None]:
    # Merge duplicate variants
    qty: dict[int, int] = {}
    for it in items:
        qty[it.variant_id] = qty.get(it.variant_id, 0) + it.quantity

    stmt = select(ProductVariant).where(ProductVariant.id.in_(qty.keys())).order_by(ProductVariant.id)
    if lock:
        stmt = stmt.with_for_update()
    variants = {v.id: v for v in db.scalars(stmt)}

    lines: list[QuoteLine] = []
    priced: list[PricedLine] = []
    for vid, q in qty.items():
        v = variants.get(vid)
        if not v:
            lines.append(QuoteLine(variant_id=vid, product_id=None, product_name="Unavailable item", product_slug=None,
                                   image=None, size="-", color="-", unit_price=0, mrp=0, quantity=q, line_total=0,
                                   stock=0, issue="This item is no longer available"))
            continue
        p = v.product
        issue = None
        if not p.is_active or not p.category.is_active:
            issue = "This item is no longer available"
        elif v.stock <= 0:
            issue = "Out of stock"
        elif v.stock < q:
            issue = f"Only {v.stock} left in stock"
        lines.append(QuoteLine(
            variant_id=v.id, product_id=p.id, product_name=p.name, product_slug=p.slug,
            image=p.images[0].url if p.images else None, size=v.size, color=v.color,
            unit_price=p.price, mrp=p.mrp, quantity=q, line_total=p.price * q, stock=v.stock, issue=issue,
        ))
        if not issue:
            priced.append(PricedLine(variant=v, quantity=q, unit_price=p.price))

    s = get_store_settings(db)
    subtotal = sum(pl.unit_price * pl.quantity for pl in priced)
    coupon, discount, coupon_error = evaluate_coupon(db, coupon_code, subtotal)
    after_discount = subtotal - discount
    shipping = 0 if subtotal == 0 or after_discount >= s.free_shipping_above else s.shipping_fee

    quote = QuoteOut(
        lines=lines,
        subtotal=subtotal,
        discount=discount,
        shipping_fee=shipping,
        total=after_discount + shipping,
        coupon_code=coupon.code if coupon else (coupon_code.strip().upper() if coupon_code else None),
        coupon_valid=None if not coupon_code else coupon is not None,
        coupon_message=coupon_error if coupon_error else (f"Coupon applied. You save ₹{discount}" if coupon else None),
        free_shipping_above=s.free_shipping_above,
        cod_enabled=s.cod_enabled and (s.cod_max_order == 0 or after_discount + shipping <= s.cod_max_order),
        has_issues=any(line.issue for line in lines),
    )
    return quote, priced, coupon
