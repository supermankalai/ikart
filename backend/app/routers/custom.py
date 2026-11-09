"""Custom-printed T-shirts: the customer picks a T-shirt, uploads artwork, previews it and orders.

These orders get order_type = "CUSTOM" and follow their own workflow
(New custom order -> Design review -> Design approved -> Printing -> Quality check -> Ready to ship -> Shipped -> Delivered).
"""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Category, Order, Product, User
from ..schemas import CustomDesignIn, CustomOrderIn, CustomQuoteIn, CustomQuoteOut, OrderCreateOut, OrderOut, ProductDetail
from ..services import orders as svc
from ..services.catalog import product_detail
from ..services.store_settings import get_store_settings

router = APIRouter(prefix="/api/custom", tags=["custom print"])

ARTWORK_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
SUBDIR = "custom"


def _folder() -> Path:
    folder = Path(settings.upload_dir) / SUBDIR
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _require_enabled(db: Session) -> None:
    if not get_store_settings(db).custom_print_enabled:
        raise HTTPException(404, "Custom printing is not available right now")


@router.get("/products", response_model=list[ProductDetail])
def customizable_products(db: Session = Depends(get_db)):
    _require_enabled(db)
    rows = db.scalars(
        select(Product).join(Category)
        .where(Product.is_active.is_(True), Product.is_customizable.is_(True), Category.is_active.is_(True))
        .options(selectinload(Product.images), selectinload(Product.variants), selectinload(Product.category))
        .order_by(Product.price, Product.name)
    ).all()
    return [product_detail(p) for p in rows if any(v.stock > 0 for v in p.variants)]


@router.post("/uploads")
async def upload_artwork(file: UploadFile = File(...), _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Stores the customer's artwork (or the generated preview). Logged-in customers only."""
    _require_enabled(db)
    ext = ARTWORK_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Please upload a JPG, PNG or WEBP image")
    limit = settings.max_custom_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(400, f"Image must be smaller than {settings.max_custom_upload_mb} MB")
    is_image = (data.startswith(b"\x89PNG") or data.startswith(b"\xff\xd8\xff")
                or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"))
    if not is_image:
        raise HTTPException(400, "This file is not a valid image")
    name = f"{uuid.uuid4().hex}{ext}"
    (_folder() / name).write_bytes(data)
    return {"url": f"/uploads/{SUBDIR}/{name}"}


@router.post("/quote", response_model=CustomQuoteOut)
def quote(data: CustomQuoteIn, db: Session = Depends(get_db)):
    _require_enabled(db)
    q, _ = svc.custom_quote(db, data.variant_id, data.quantity, data.front, data.back)
    return q


def _check_files(design: CustomDesignIn) -> None:
    for side in design.sides:
        for url in (side.preview_url, *(layer.url for layer in side.layers)):
            if not (_folder() / Path(url).name).is_file():
                raise HTTPException(400, "Part of your design was not uploaded. Please save the design again.")


@router.post("/orders", response_model=OrderCreateOut, status_code=201)
def place_custom_order(data: CustomOrderIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_enabled(db)
    _check_files(data.design)
    order, session = svc.create_custom_order(db, user, data)
    return OrderCreateOut(order=OrderOut.model_validate(order), payment=session)


@router.post("/orders/{number}/design", response_model=OrderOut)
def replace_design(number: str, data: CustomDesignIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Customer sends a new design after the store asked for one."""
    order = db.scalar(select(Order).where(Order.order_number == number))
    if not order or order.user_id != user.id:
        raise HTTPException(404, "Order not found")
    _check_files(data)
    return svc.submit_new_design(db, order, data)
