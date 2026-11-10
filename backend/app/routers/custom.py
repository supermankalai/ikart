"""Custom-printed T-shirts ("Design your own").

These orders get order_type = "CUSTOM" and follow their own workflow
(New custom order -> Design review -> Design approved -> Printing -> Quality check -> Ready to ship -> Shipped -> Delivered).
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..models import AiImage, Category, Clipart, Order, Product, SavedDesign, User
from ..schemas import (
    AiImageIn, ClipartOut, CustomConfigOut, CustomDesignIn, CustomOrderIn, CustomProductOut, CustomQuoteIn,
    CustomQuoteOut, OrderCreateOut, OrderOut, SavedDesignIn, SavedDesignOut,
)
from ..services import ai_image
from ..services import custom as svc
from ..services.catalog import product_detail
from ..services.store_settings import get_store_settings

router = APIRouter(prefix="/api/custom", tags=["custom print"])

ARTWORK_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
SUBDIR = "custom"


def _folder() -> Path:
    folder = Path(settings.upload_dir) / SUBDIR
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _save(data: bytes, ext: str) -> str:
    name = f"{uuid.uuid4().hex}{ext}"
    (_folder() / name).write_bytes(data)
    return f"/uploads/{SUBDIR}/{name}"


def _require_enabled(db: Session) -> None:
    if not get_store_settings(db).custom_print_enabled:
        raise HTTPException(404, "Custom printing is not available right now")


def _ai_used_today(db: Session, user: User) -> int:
    since = datetime.now(timezone.utc) - timedelta(days=1)
    return db.scalar(select(func.count(AiImage.id)).where(AiImage.user_id == user.id, AiImage.created_at >= since)) or 0


@router.get("/config", response_model=CustomConfigOut)
def config(user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    s = get_store_settings(db)
    enabled = settings.ai_images_enabled and s.ai_daily_limit > 0
    remaining = max(0, s.ai_daily_limit - _ai_used_today(db, user)) if enabled and user else None
    return CustomConfigOut(ai_enabled=enabled, ai_daily_limit=s.ai_daily_limit, ai_remaining=remaining)


@router.get("/products", response_model=list[CustomProductOut])
def customizable_products(db: Session = Depends(get_db)):
    _require_enabled(db)
    rows = db.scalars(
        select(Product).join(Category)
        .where(Product.is_active.is_(True), Product.is_customizable.is_(True), Category.is_active.is_(True))
        .options(selectinload(Product.images), selectinload(Product.variants), selectinload(Product.category))
        .order_by(Product.price, Product.name)
    ).all()
    return [CustomProductOut(**product_detail(p).model_dump(), custom_mockups=p.custom_mockups)
            for p in rows if any(v.stock > 0 for v in p.variants)]


@router.get("/clipart", response_model=list[ClipartOut])
def clipart(db: Session = Depends(get_db)):
    return db.scalars(select(Clipart).where(Clipart.is_active.is_(True)).order_by(Clipart.category, Clipart.sort_order, Clipart.name)).all()


@router.post("/uploads")
async def upload_artwork(file: UploadFile = File(...), _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Stores a design file (artwork, rendered text/art, or a preview). Logged-in customers only."""
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
    return {"url": _save(data, ext)}


@router.post("/ai-image")
def generate_ai_image(data: AiImageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_enabled(db)
    s = get_store_settings(db)
    if not settings.ai_images_enabled or s.ai_daily_limit <= 0:
        raise HTTPException(404, "AI images are not available")
    if _ai_used_today(db, user) >= s.ai_daily_limit:
        raise HTTPException(429, f"You've used all {s.ai_daily_limit} AI images for today. Please try again tomorrow.")
    try:
        png = ai_image.generate(data.prompt, data.style)
    except ai_image.AiImageError as e:
        raise HTTPException(502, str(e))
    url = _save(png, ".png")
    db.add(AiImage(user_id=user.id, prompt=data.prompt, url=url))
    db.commit()
    return {"url": url, "remaining": max(0, s.ai_daily_limit - _ai_used_today(db, user))}


@router.post("/quote", response_model=CustomQuoteOut)
def quote(data: CustomQuoteIn, db: Session = Depends(get_db)):
    _require_enabled(db)
    q, _ = svc.custom_quote(db, data.lines, set(data.sides), set(data.foil_sides), data.name, data.number, data.glow)
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


# ---------- Saved designs (My designs + share links) ----------
def _design_out(d: SavedDesign, user: User | None) -> SavedDesignOut:
    return SavedDesignOut(
        id=d.id, token=d.token, name=d.name, product_id=d.product_id,
        product_slug=d.product.slug if d.product else None, product_name=d.product.name if d.product else None,
        color=d.color, preview_url=d.preview_url, data=d.data, is_owner=bool(user and user.id == d.user_id),
        created_at=d.created_at, updated_at=d.updated_at,
    )


def _design_data(data: SavedDesignIn) -> dict:
    return {
        "design": {**data.design.model_dump(), "sides": svc.design_dict(data.design)["sides"]},
        "roster": [r.model_dump() for r in data.roster] if data.roster else None,
        "sizes": {k: max(0, min(int(v), 500)) for k, v in list(data.sizes.items())[:20]},
        "glow": data.glow,
    }


@router.get("/designs", response_model=list[SavedDesignOut])
def my_designs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(SavedDesign).where(SavedDesign.user_id == user.id).order_by(SavedDesign.updated_at.desc())).all()
    return [_design_out(d, user) for d in rows]


@router.post("/designs", response_model=SavedDesignOut, status_code=201)
def save_design(data: SavedDesignIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_enabled(db)
    _check_files(data.design)
    if not db.get(Product, data.product_id):
        raise HTTPException(404, "T-shirt not found")
    count = db.scalar(select(func.count(SavedDesign.id)).where(SavedDesign.user_id == user.id)) or 0
    if count >= 50:
        raise HTTPException(400, "You can keep up to 50 saved designs. Please delete some first.")
    d = SavedDesign(user_id=user.id, token=secrets.token_urlsafe(12)[:16], name=data.name.strip(), product_id=data.product_id,
                    color=data.color, data=_design_data(data), preview_url=svc.design_dict(data.design)["preview_url"])
    db.add(d)
    db.commit()
    db.refresh(d)
    return _design_out(d, user)


def _own(db: Session, user: User, design_id: int) -> SavedDesign:
    d = db.get(SavedDesign, design_id)
    if not d or d.user_id != user.id:
        raise HTTPException(404, "Design not found")
    return d


@router.put("/designs/{design_id}", response_model=SavedDesignOut)
def update_design(design_id: int, data: SavedDesignIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = _own(db, user, design_id)
    _check_files(data.design)
    d.name, d.product_id, d.color = data.name.strip(), data.product_id, data.color
    d.data = _design_data(data)
    d.preview_url = svc.design_dict(data.design)["preview_url"]
    db.commit()
    db.refresh(d)
    return _design_out(d, user)


@router.delete("/designs/{design_id}", status_code=204)
def delete_design(design_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, design_id))
    db.commit()


@router.get("/designs/shared/{token}", response_model=SavedDesignOut)
def shared_design(token: str, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    """Anyone with the link can open a design (they edit and order their own copy)."""
    d = db.scalar(select(SavedDesign).where(SavedDesign.token == token))
    if not d:
        raise HTTPException(404, "This design link is not valid")
    return _design_out(d, user)
