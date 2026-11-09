"""Turn Product rows into API shapes."""
from ..models import Product
from ..schemas import CategoryOut, ColorOut, ProductAdminOut, ProductCard, ProductDetail, VariantOut
from .utils import sort_sizes


def _colors(p: Product) -> list[ColorOut]:
    seen: dict[str, ColorOut] = {}
    for v in p.variants:
        if v.color not in seen:
            seen[v.color] = ColorOut(name=v.color, hex=v.color_hex)
    return list(seen.values())


def product_card(p: Product) -> ProductCard:
    imgs = [i.url for i in p.images]
    return ProductCard(
        id=p.id,
        name=p.name,
        slug=p.slug,
        price=p.price,
        mrp=p.mrp,
        image=imgs[0] if imgs else None,
        hover_image=imgs[1] if len(imgs) > 1 else None,
        category=CategoryOut.model_validate(p.category),
        sizes=sort_sizes(v.size for v in p.variants if v.stock > 0),
        colors=_colors(p),
        in_stock=any(v.stock > 0 for v in p.variants),
        is_featured=p.is_featured,
    )


def product_detail(p: Product) -> ProductDetail:
    card = product_card(p)
    return ProductDetail(
        **card.model_dump(exclude={"category", "colors"}),
        category=card.category,
        colors=card.colors,
        description=p.description,
        details=p.details,
        images=[i.url for i in p.images],
        variants=[VariantOut.model_validate(v) for v in p.variants],
    )


def product_admin(p: Product) -> ProductAdminOut:
    return ProductAdminOut(
        id=p.id,
        name=p.name,
        slug=p.slug,
        category_id=p.category_id,
        category=CategoryOut.model_validate(p.category),
        description=p.description,
        details=p.details,
        price=p.price,
        mrp=p.mrp,
        is_active=p.is_active,
        is_featured=p.is_featured,
        images=[i.url for i in p.images],
        variants=[VariantOut.model_validate(v) for v in p.variants],
        total_stock=sum(v.stock for v in p.variants),
        created_at=p.created_at,
    )
