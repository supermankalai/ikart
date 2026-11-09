from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Category, Product, ProductVariant
from ..schemas import CategoryOut, ColorOut, Facets, ProductCard, ProductDetail, ProductList, QuoteIn, QuoteOut, StoreSettings
from ..services.catalog import product_card, product_detail
from ..services.pricing import build_quote
from ..services.store_settings import get_store_settings
from ..services.utils import sort_sizes

router = APIRouter(prefix="/api", tags=["catalog"])

LOAD = (selectinload(Product.images), selectinload(Product.variants), selectinload(Product.category))


def _visible():
    return select(Product).join(Category).where(Product.is_active.is_(True), Category.is_active.is_(True))


@router.get("/settings/public", response_model=StoreSettings)
def public_settings(db: Session = Depends(get_db)):
    return get_store_settings(db)


@router.get("/categories", response_model=list[CategoryOut])
def categories(db: Session = Depends(get_db)):
    return db.scalars(
        select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order, Category.name)
    ).all()


def _csv(v: str | None) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()] if v else []


@router.get("/products", response_model=ProductList)
def products(
    category: str | None = None,
    q: str | None = None,
    sizes: str | None = None,
    colors: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    featured: bool | None = None,
    sort: str = Query("newest", pattern="^(newest|price_asc|price_desc|featured)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=60),
    db: Session = Depends(get_db),
):
    base = _visible()
    if category:
        base = base.where(Category.slug == category)
    if q:
        like = f"%{q.strip()}%"
        base = base.where(or_(Product.name.ilike(like), Product.description.ilike(like), Category.name.ilike(like)))

    # Facets are computed before size/colour/price filters so shoppers can always widen again
    facet_ids = base.with_only_columns(Product.id).subquery()
    var_rows = db.execute(
        select(ProductVariant.size, ProductVariant.color, ProductVariant.color_hex)
        .where(ProductVariant.product_id.in_(select(facet_ids.c.id)), ProductVariant.stock > 0)
    ).all()
    price_row = db.execute(
        select(func.min(Product.price), func.max(Product.price)).where(Product.id.in_(select(facet_ids.c.id)))
    ).one()
    color_map: dict[str, str | None] = {}
    for r in var_rows:
        color_map.setdefault(r.color, r.color_hex)
    facets = Facets(
        sizes=sort_sizes(r.size for r in var_rows),
        colors=[ColorOut(name=k, hex=v) for k, v in sorted(color_map.items())],
        min_price=price_row[0] or 0,
        max_price=price_row[1] or 0,
    )

    stmt = base
    size_list, color_list = _csv(sizes), _csv(colors)
    if size_list or color_list:
        cond = [ProductVariant.product_id == Product.id, ProductVariant.stock > 0]
        if size_list:
            cond.append(ProductVariant.size.in_(size_list))
        if color_list:
            cond.append(ProductVariant.color.in_(color_list))
        stmt = stmt.where(exists().where(*cond))
    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)
    if featured is not None:
        stmt = stmt.where(Product.is_featured.is_(featured))

    total = db.scalar(select(func.count()).select_from(stmt.with_only_columns(Product.id).subquery())) or 0
    order = {
        "newest": [Product.created_at.desc(), Product.id.desc()],
        "price_asc": [Product.price.asc(), Product.id.desc()],
        "price_desc": [Product.price.desc(), Product.id.desc()],
        "featured": [Product.is_featured.desc(), Product.created_at.desc()],
    }[sort]
    rows = db.scalars(stmt.options(*LOAD).order_by(*order).offset((page - 1) * page_size).limit(page_size)).all()
    return ProductList(items=[product_card(p) for p in rows], total=total, page=page, page_size=page_size, facets=facets)


@router.get("/products/{slug}", response_model=ProductDetail)
def product(slug: str, db: Session = Depends(get_db)):
    p = db.scalar(_visible().where(Product.slug == slug).options(*LOAD))
    if not p:
        raise HTTPException(404, "Product not found")
    return product_detail(p)


@router.get("/products/{slug}/related", response_model=list[ProductCard])
def related(slug: str, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.slug == slug))
    if not p:
        return []
    rows = db.scalars(
        _visible().where(Product.category_id == p.category_id, Product.id != p.id)
        .options(*LOAD).order_by(Product.is_featured.desc(), Product.created_at.desc()).limit(4)
    ).all()
    return [product_card(r) for r in rows]


@router.post("/cart/quote", response_model=QuoteOut)
def quote(data: QuoteIn, db: Session = Depends(get_db)):
    q, _, _ = build_quote(db, data.items, data.coupon_code)
    return q
