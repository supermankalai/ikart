"""Custom-printed T-shirts: pricing, orders, design changes and print files.

A custom order has order_type = "CUSTOM" and one order item per size. Every custom item carries the same
`custom_design` dict:
    {"version": 3, "sides": [{"side", "preview_url", "layers": [...]}], "preview_url", "color_hex",
     "roster": [{"size", "name", "number"}] | None, "glow": bool, "pricing": {...},
     "change_request": {"message", "requested_at"} | None, "revisions": [...]}
"""
import copy
import csv
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Address, Order, OrderItem, OrderStatus, OrderType, PaymentMethod, PaymentStatus, ProductVariant, User, is_custom
from ..schemas import CustomDesignIn, CustomLineIn, CustomOrderIn, CustomQuoteLine, CustomQuoteOut, RosterRow
from . import cashfree
from .orders import _unique_order_number, add_event, expire_stale_orders, start_payment
from .store_settings import get_store_settings
from .utils import sort_sizes

VIEW_ORDER = {"front": 0, "back": 1, "left": 2, "right": 3}
VIEW_LABEL = {"front": "Front", "back": "Back", "left": "Left sleeve", "right": "Right sleeve"}


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Pricing ----------
def side_price(s, side: str) -> int:
    return {"front": s.custom_print_price, "back": s.custom_back_print_price}.get(side, s.custom_sleeve_print_price)


def custom_quote(
    db: Session, lines: list[CustomLineIn], sides: set[str], foil_sides: set[str] = frozenset(),
    name: bool = False, number: bool = False, glow: bool = False, lock: bool = False,
) -> tuple[CustomQuoteOut, list[tuple[ProductVariant, int]]]:
    if not sides:
        raise HTTPException(400, "Add a design to at least one side")
    qty: dict[int, int] = {}
    for ln in lines:
        qty[ln.variant_id] = qty.get(ln.variant_id, 0) + ln.quantity
    stmt = select(ProductVariant).where(ProductVariant.id.in_(qty.keys())).order_by(ProductVariant.id)
    if lock:
        stmt = stmt.with_for_update()
    variants = {v.id: v for v in db.scalars(stmt)}
    if len(variants) != len(qty):
        raise HTTPException(404, "Some sizes are no longer available")
    first = next(iter(variants.values()))
    p = first.product
    if not p.is_active or not p.is_customizable or not p.category.is_active:
        raise HTTPException(404, "This T-shirt is not available for custom printing")
    if any(v.product_id != p.id or v.color != first.color for v in variants.values()):
        raise HTTPException(400, "All sizes in one custom order must be the same T-shirt and colour")

    s = get_store_settings(db)
    total_qty = sum(qty.values())
    if total_qty > s.custom_max_qty:
        raise HTTPException(400, f"For more than {s.custom_max_qty} pieces, please contact us for a bulk price")

    side_charges = {side: side_price(s, side) for side in sorted(sides, key=VIEW_ORDER.get)}
    foil = s.custom_foil_price * len(set(foil_sides) & set(sides))
    name_c = s.custom_name_price if name else 0
    number_c = s.custom_number_price if number else 0
    glow_c = s.custom_glow_price if glow else 0
    extras = sum(side_charges.values()) + foil + name_c + number_c + glow_c
    unit = p.price + extras
    subtotal = unit * total_qty

    tiers = sorted(s.custom_bulk_tiers, key=lambda t: t.min_qty)
    pct = max((t.percent for t in tiers if t.min_qty <= total_qty), default=0)
    nxt = next(({"min_qty": t.min_qty, "percent": t.percent} for t in tiers if t.min_qty > total_qty and t.percent > pct), None)
    discount = subtotal * pct // 100
    after = subtotal - discount
    shipping = 0 if after >= s.free_shipping_above else s.shipping_fee
    total = after + shipping

    out_lines = []
    for vid in sorted(qty, key=lambda i: sort_sizes([v.size for v in variants.values()]).index(variants[i].size)):
        v, q = variants[vid], qty[vid]
        issue = "Out of stock" if v.stock <= 0 else (f"Only {v.stock} left" if v.stock < q else None)
        out_lines.append(CustomQuoteLine(variant_id=v.id, size=v.size, quantity=q, stock=v.stock, issue=issue))

    quote = CustomQuoteOut(
        product_name=p.name, color=first.color, lines=out_lines, quantity=total_qty, tshirt_price=p.price,
        side_charges=side_charges, foil_charge=foil, name_charge=name_c, number_charge=number_c, glow_charge=glow_c,
        print_price=extras, unit_price=unit, subtotal=subtotal, discount_percent=pct, discount=discount,
        shipping_fee=shipping, total=total, max_quantity=s.custom_max_qty, next_tier=nxt,
        cod_enabled=s.custom_cod_enabled and s.cod_enabled and (s.cod_max_order == 0 or total <= s.cod_max_order),
        has_issues=any(ln.issue for ln in out_lines),
    )
    return quote, [(variants[ln.variant_id], ln.quantity) for ln in out_lines]


def design_dict(d: CustomDesignIn) -> dict:
    sides = sorted((s.model_dump() for s in d.sides), key=lambda s: VIEW_ORDER[s["side"]])
    return {"version": 3, "sides": sides, "preview_url": sides[0]["preview_url"]}


def _roster_lines(db: Session, design: CustomDesignIn, roster: list[RosterRow], any_variant_id: int | None) -> list[CustomLineIn]:
    """Name & number orders: one roster row = one T-shirt. Returns order lines (quantity per size)."""
    if not roster:
        raise HTTPException(400, "Add at least one name / number to the list")
    if any_variant_id is None:
        raise HTTPException(400, "Choose a T-shirt colour")
    base = db.get(ProductVariant, any_variant_id)
    if not base:
        raise HTTPException(404, "This T-shirt is no longer available")
    by_size = {v.size.upper(): v for v in base.product.variants if v.color == base.color}
    counts: dict[int, int] = {}
    for i, r in enumerate(roster, 1):
        v = by_size.get(r.size.strip().upper())
        if not v:
            raise HTTPException(400, f"Row {i}: size '{r.size}' is not available in {base.color}")
        if design.has_name and not (r.name or "").strip():
            raise HTTPException(400, f"Row {i}: please enter a name")
        if design.has_number and not (r.number or "").strip():
            raise HTTPException(400, f"Row {i}: please enter a number")
        counts[v.id] = counts.get(v.id, 0) + 1
    return [CustomLineIn(variant_id=vid, quantity=q) for vid, q in counts.items()]


# ---------- Orders ----------
def create_custom_order(db: Session, user: User, data: CustomOrderIn) -> tuple[Order, object | None]:
    expire_stale_orders(db)
    address = db.get(Address, data.address_id)
    if not address or address.user_id != user.id:
        raise HTTPException(404, "Delivery address not found")

    d = data.design
    personalised = d.has_name or d.has_number
    if personalised:
        lines = _roster_lines(db, d, data.roster or [], data.lines[0].variant_id if data.lines else None)
    else:
        if not data.lines:
            raise HTTPException(400, "Choose at least one size")
        lines = data.lines
    quote, priced = custom_quote(db, lines, d.printed_sides, d.foil_sides, d.has_name, d.has_number, data.glow, lock=True)
    if quote.has_issues:
        raise HTTPException(409, "; ".join(f"{ln.size}: {ln.issue}" for ln in quote.lines if ln.issue))
    if data.payment_method == PaymentMethod.COD and not quote.cod_enabled:
        raise HTTPException(400, "Cash on delivery is not available for custom print orders")

    p = priced[0][0].product
    design = design_dict(d)
    design.update(
        color_hex=d.color_hex or priced[0][0].color_hex,
        roster=[r.model_dump() for r in data.roster] if personalised and data.roster else None,
        glow=data.glow,
        pricing=quote.model_dump(include={"tshirt_price", "side_charges", "foil_charge", "name_charge", "number_charge",
                                          "glow_charge", "print_price", "unit_price", "discount_percent"}),
        print_price=quote.print_price,
        change_request=None,
        revisions=[],
    )
    order = Order(
        order_number=_unique_order_number(db),
        user_id=user.id,
        order_type=OrderType.CUSTOM,
        payment_method=data.payment_method,
        payment_status=PaymentStatus.PENDING,
        status=OrderStatus.CUSTOM_NEW if data.payment_method == PaymentMethod.COD else OrderStatus.PENDING_PAYMENT,
        subtotal=quote.subtotal,
        discount=quote.discount,
        shipping_fee=quote.shipping_fee,
        total=quote.total,
        notes=data.notes,
        shipping_address={
            "name": address.name, "phone": address.phone, "line1": address.line1, "line2": address.line2,
            "city": address.city, "state": address.state, "pincode": address.pincode,
        },
    )
    for v, q in priced:
        v.stock -= q
        order.items.append(OrderItem(
            product_id=p.id, variant_id=v.id, product_name=f"Custom print · {p.name}", product_slug=p.slug,
            size=v.size, color=v.color, image_url=design["preview_url"], unit_price=quote.unit_price, quantity=q,
            custom_design=copy.deepcopy(design),
        ))
    add_event(order, order.status,
              "Custom print order placed · Cash on delivery" if data.payment_method == PaymentMethod.COD else None)
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


def custom_items(order: Order) -> list[OrderItem]:
    items = [i for i in order.items if i.custom_design]
    if not is_custom(order) or not items:
        raise HTTPException(400, "This is not a custom print order")
    return items


def sides_of(design: dict) -> list[dict]:
    """Printed sides of a stored design; also reads the first version (single front image)."""
    if design.get("sides"):
        return design["sides"]
    if design.get("artwork_url") and design.get("placement"):
        return [{"side": "front", "preview_url": design.get("preview_url"),
                 "layers": [{"type": "image", "url": design["artwork_url"], **design["placement"],
                             "width": design.get("artwork_width"), "height": design.get("artwork_height")}]}]
    return []


def _set_design(order: Order, new: dict) -> None:
    for item in custom_items(order):
        item.custom_design = copy.deepcopy(new)
        item.image_url = new.get("preview_url") or item.image_url


def request_design_change(db: Session, order: Order, message: str) -> Order:
    """Admin asks the customer for a new image/design during design review."""
    items = custom_items(order)
    if order.status not in (OrderStatus.CUSTOM_NEW, OrderStatus.DESIGN_REVIEW):
        raise HTTPException(400, "A new design can only be requested before the design is approved")
    current = items[0].custom_design
    _set_design(order, {**current, "change_request": {"message": message.strip(), "requested_at": now().isoformat()}})
    order.status = OrderStatus.DESIGN_REVIEW
    add_event(order, OrderStatus.DESIGN_REVIEW, f"New design requested: {message.strip()}")
    db.commit()
    db.refresh(order)
    return order


def submit_new_design(db: Session, order: Order, design: CustomDesignIn) -> Order:
    """Customer uploads a replacement design after the admin asked for one. The price can't change."""
    current = custom_items(order)[0].custom_design
    if not current.get("change_request") or order.status not in (OrderStatus.CUSTOM_NEW, OrderStatus.DESIGN_REVIEW):
        raise HTTPException(400, "This order is not waiting for a new design")
    old_sides = sides_of(current)
    paid = {s["side"] for s in old_sides}
    if design.printed_sides != paid:
        names = " and ".join(VIEW_LABEL[s].lower() for s in sorted(paid, key=VIEW_ORDER.get))
        raise HTTPException(400, f"Your order includes printing on the {names}. Please design exactly the same side(s).")
    paid_foil = {s["side"] for s in old_sides if any(layer.get("foil") for layer in s.get("layers", []))}
    if design.foil_sides != paid_foil:
        raise HTTPException(400, "Gold/silver foil must stay on the same sides as your original order")
    old_name = any(layer.get("type") == "name" for s in old_sides for layer in s.get("layers", []))
    old_number = any(layer.get("type") == "number" for s in old_sides for layer in s.get("layers", []))
    if design.has_name != old_name or design.has_number != old_number:
        raise HTTPException(400, "Keep the name / number on your design, as in your original order")

    previous = {"sides": old_sides, "preview_url": current.get("preview_url"), "replaced_at": now().isoformat(),
                "request": current["change_request"].get("message")}
    new = {**current, **design_dict(design), "change_request": None,
           "revisions": [*(current.get("revisions") or []), previous]}
    for k in ("artwork_url", "placement", "side", "artwork_width", "artwork_height"):
        new.pop(k, None)  # first-version fields
    _set_design(order, new)
    add_event(order, order.status, "Customer uploaded a new design")
    db.commit()
    db.refresh(order)
    return order


# ---------- Print files ----------
def _local(url: str) -> Path | None:
    if not url or not url.startswith("/uploads/"):
        return None
    path = (Path(settings.upload_dir) / url[len("/uploads/"):]).resolve()
    root = Path(settings.upload_dir).resolve()
    return path if root in path.parents and path.is_file() else None


def design_files(design: dict | None) -> list[str]:
    """Print files of a custom design: every layer of every printed side."""
    if not design:
        return []
    return [layer["url"] for side in sides_of(design) for layer in side.get("layers", []) if layer.get("url")]


def design_zip(order: Order) -> bytes:
    """ZIP for the print team: previews, every print file, roster.csv and a readable job sheet."""
    items = custom_items(order)
    d = items[0].custom_design
    buf = io.BytesIO()
    lines = [
        f"Order #{order.order_number}",
        f"T-shirt: {items[0].product_name.replace('Custom print · ', '')} · colour {items[0].color}",
        "Sizes: " + ", ".join(f"{i.size} × {i.quantity}" for i in items),
        f"Glow in the dark: {'YES' if d.get('glow') else 'no'}",
        "",
    ]
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for side in sides_of(d):
            label = side["side"]
            lines.append(f"== {VIEW_LABEL.get(label, label)} ==")
            if (p := _local(side.get("preview_url"))):
                z.write(p, f"{label}/preview{p.suffix}")
            for n, layer in enumerate(side.get("layers", []), 1):
                kind = layer.get("type", "image")
                desc = f"{n}. {kind}"
                if layer.get("text"):
                    desc += f' "{layer["text"]}"'
                if layer.get("font"):
                    desc += f" · font {layer['font']}"
                if layer.get("color"):
                    desc += f" · colour {layer['color']}"
                if layer.get("effect") and layer["effect"] != "straight":
                    desc += f" · effect {layer['effect']}"
                if layer.get("foil"):
                    desc += f" · {layer['foil'].upper()} FOIL"
                desc += (f" · box x{layer.get('x', 0):.2f} y{layer.get('y', 0):.2f} w{layer.get('w', 0):.2f}"
                         f" h{layer.get('h', 0):.2f} (fractions of print area) · rotate {round(layer.get('rotation') or 0)}°")
                if layer.get("flip"):
                    desc += " · mirrored"
                lines.append(desc)
                if (p := _local(layer.get("url"))):
                    z.write(p, f"{label}/{n:02d}-{kind}{p.suffix}")
            lines.append("")
        if d.get("roster"):
            out = io.StringIO()
            w = csv.writer(out)
            w.writerow(["size", "name", "number"])
            for r in d["roster"]:
                w.writerow([r.get("size"), r.get("name") or "", r.get("number") or ""])
            z.writestr("roster.csv", out.getvalue())
            lines.append(f"Names & numbers: {len(d['roster'])} pieces, see roster.csv")
        if order.notes:
            lines += ["", f"Customer note: {order.notes}"]
        z.writestr("job-sheet.txt", "\n".join(lines))
        z.writestr("design.json", json.dumps({k: d.get(k) for k in ("sides", "roster", "glow", "color_hex", "pricing")}, indent=2))
    return buf.getvalue()
