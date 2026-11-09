import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import Category, Product, ProductImage, ProductVariant
from ..schemas import CategoryAdminOut, CategoryIn, ProductAdminList, ProductAdminOut, ProductIn
from ..services.catalog import product_admin
from ..services.utils import slugify

router = APIRouter(prefix="/api/admin", tags=["admin-catalog"], dependencies=[Depends(require_admin)])

ALLOWED_IMAGES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}


def _unique_slug(db: Session, model, wanted: str, exclude_id: int | None = None) -> str:
    base = slugify(wanted)
    slug, n = base, 2
    while True:
        stmt = select(model.id).where(model.slug == slug)
        if exclude_id:
            stmt = stmt.where(model.id != exclude_id)
        if not db.scalar(stmt):
            return slug
        slug = f"{base}-{n}"
        n += 1


# ---------- Uploads ----------
@router.post("/uploads")
async def upload_image(file: UploadFile = File(...)):
    ext = ALLOWED_IMAGES.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Only JPG, PNG, WEBP or GIF images are allowed")
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(400, f"Image must be smaller than {settings.max_upload_mb} MB")
    is_image = (data.startswith(b"\x89PNG") or data.startswith(b"\xff\xd8\xff") or data.startswith(b"GIF8")
                or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"))
    if not is_image:
        raise HTTPException(400, "This file is not a valid image")
    folder = Path(settings.upload_dir)
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(data)
    return {"url": f"/uploads/{name}"}


# ---------- Categories ----------
@router.get("/categories", response_model=list[CategoryAdminOut])
def list_categories(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Product.category_id, func.count(Product.id)).group_by(Product.category_id)).all())
    cats = db.scalars(select(Category).order_by(Category.sort_order, Category.name)).all()
    out = []
    for c in cats:
        item = CategoryAdminOut.model_validate(c)
        item.product_count = counts.get(c.id, 0)
        out.append(item)
    return out


@router.post("/categories", response_model=CategoryAdminOut, status_code=201)
def create_category(data: CategoryIn, db: Session = Depends(get_db)):
    cat = Category(**data.model_dump(exclude={"slug"}), slug=_unique_slug(db, Category, data.slug or data.name))
    cat.name = cat.name.strip()
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryAdminOut.model_validate(cat)


@router.put("/categories/{cat_id}", response_model=CategoryAdminOut)
def update_category(cat_id: int, data: CategoryIn, db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    for k, v in data.model_dump(exclude={"slug"}).items():
        setattr(cat, k, v)
    cat.slug = _unique_slug(db, Category, data.slug or data.name, exclude_id=cat.id)
    db.commit()
    db.refresh(cat)
    out = CategoryAdminOut.model_validate(cat)
    out.product_count = db.scalar(select(func.count(Product.id)).where(Product.category_id == cat.id)) or 0
    return out


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    if db.scalar(select(func.count(Product.id)).where(Product.category_id == cat_id)):
        raise HTTPException(400, "This category still has products. Move or delete them first, or hide the category.")
    db.delete(cat)
    db.commit()


# ---------- Products ----------
LOAD = (selectinload(Product.images), selectinload(Product.variants), selectinload(Product.category))


@router.get("/products", response_model=ProductAdminList)
def list_products(
    q: str | None = None,
    category_id: int | None = None,
    stock: str | None = Query(None, pattern="^(low|out)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Product)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.slug.ilike(like),
                              Product.variants.any(ProductVariant.sku.ilike(like))))
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if stock:
        total_stock = (select(func.coalesce(func.sum(ProductVariant.stock), 0))
                       .where(ProductVariant.product_id == Product.id).scalar_subquery())
        stmt = stmt.where(total_stock == 0) if stock == "out" else stmt.where(total_stock.between(1, 9))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.options(*LOAD).order_by(Product.created_at.desc(), Product.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return ProductAdminList(items=[product_admin(p) for p in rows], total=total, page=page, page_size=page_size)


@router.get("/products/{product_id}", response_model=ProductAdminOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.id == product_id).options(*LOAD))
    if not p:
        raise HTTPException(404, "Product not found")
    return product_admin(p)


def _apply(db: Session, p: Product, data: ProductIn) -> None:
    if not db.get(Category, data.category_id):
        raise HTTPException(400, "Please choose a valid category")
    keys = [(v.size.strip().upper(), v.color.strip().lower()) for v in data.variants]
    if len(keys) != len(set(keys)):
        raise HTTPException(400, "Each size + colour combination can only be added once")

    p.category_id = data.category_id
    p.name = data.name.strip()
    p.slug = _unique_slug(db, Product, data.slug or data.name, exclude_id=p.id)
    p.description = data.description
    p.details = data.details
    p.price = data.price
    p.mrp = max(data.mrp, data.price)
    p.is_active = data.is_active
    p.is_featured = data.is_featured

    p.images.clear()
    for i, url in enumerate(u for u in data.images if u):
        p.images.append(ProductImage(url=url, sort_order=i))

    existing = {v.id: v for v in p.variants}
    keep: list[ProductVariant] = []
    for vin in data.variants:
        v = existing.get(vin.id) if vin.id else None
        if v is None:
            v = ProductVariant()
        v.size = vin.size.strip().upper()
        v.color = vin.color.strip()
        v.color_hex = vin.color_hex
        v.sku = vin.sku
        v.stock = vin.stock
        keep.append(v)
    p.variants[:] = keep


@router.post("/products", response_model=ProductAdminOut, status_code=201)
def create_product(data: ProductIn, db: Session = Depends(get_db)):
    p = Product()
    db.add(p)
    _apply(db, p, data)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A variant SKU is already used by another product")
    return get_product(p.id, db)


@router.put("/products/{product_id}", response_model=ProductAdminOut)
def update_product(product_id: int, data: ProductIn, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.id == product_id).options(*LOAD))
    if not p:
        raise HTTPException(404, "Product not found")
    _apply(db, p, data)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A variant SKU is already used by another product")
    db.expire_all()
    return get_product(p.id, db)


@router.patch("/products/{product_id}/active", response_model=ProductAdminOut)
def toggle_product(product_id: int, active: bool, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    p.is_active = active
    db.commit()
    return get_product(p.id, db)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    db.delete(p)
    db.commit()
