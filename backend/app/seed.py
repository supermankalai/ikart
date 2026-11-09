"""Create tables, the admin account, starter categories and sample products.

Run from the backend folder:  python -m app.seed
Safe to run more than once (skips data that already exists).
"""
from pathlib import Path

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url

from .config import settings
from .database import Base, SessionLocal, engine, init_db
from .models import Category, Coupon, Product, ProductImage, ProductVariant, StoreSetting, User
from .schemas import StoreSettings
from .security import hash_password
from .services.store_settings import save_store_settings
from .services.utils import slugify

UPLOADS = Path(settings.upload_dir)

TEE = ("M215 130 L150 152 L62 245 L128 312 L178 268 L178 660 L422 660 L422 268 L472 312 L538 245 "
       "L450 152 L385 130 Q300 200 215 130 Z")
PANTS = "M205 150 L178 668 L288 668 L300 300 L312 668 L422 668 L395 150 Z"


def _svg(kind: str, color: str, bg: str, zoom: bool = False, stripe: str | None = None) -> str:
    shade = "#00000014"
    if kind == "tee":
        shape = (f'<path d="{TEE}" fill="{color}" stroke="{shade}" stroke-width="3"/>'
                 f'<path d="M215 130 Q300 200 385 130" fill="none" stroke="#00000030" stroke-width="10"/>'
                 f'<path d="M178 268 L178 660" stroke="{shade}" stroke-width="4"/>'
                 f'<path d="M422 268 L422 660" stroke="{shade}" stroke-width="4"/>')
    else:
        shape = (f'<path d="{PANTS}" fill="{color}" stroke="{shade}" stroke-width="3"/>'
                 f'<rect x="200" y="118" width="200" height="40" rx="8" fill="{color}" stroke="#00000026" stroke-width="3"/>'
                 f'<path d="M282 158 L276 205 M318 158 L324 205" stroke="#ffffff55" stroke-width="3"/>'
                 f'<rect x="180" y="640" width="108" height="28" fill="#00000022"/>'
                 f'<rect x="312" y="640" width="108" height="28" fill="#00000022"/>')
        if stripe:
            shape += (f'<path d="M207 160 L184 640" stroke="{stripe}" stroke-width="9"/>'
                      f'<path d="M393 160 L416 640" stroke="{stripe}" stroke-width="9"/>')
    transform = ' transform="translate(-150 -120) scale(1.5)"' if zoom else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750">'
            f'<rect width="600" height="750" fill="{bg}"/>'
            f'<ellipse cx="300" cy="700" rx="190" ry="16" fill="#0000000d"/>'
            f'<g{transform}>{shape}</g></svg>')


PRODUCTS = [
    # (category, name, price, mrp, kind, colors[(name, hex)], featured, description, details, stripe)
    ("t-shirts", "Essential Crew Neck Tee", 799, 1199, "tee",
     [("Black", "#1d1d1f"), ("White", "#f4f3ee"), ("Navy", "#1f2a44")], True,
     "Our everyday hero. A clean crew-neck tee cut from soft, breathable combed cotton that keeps its shape wash after wash.",
     "100% combed cotton, 180 GSM\nRegular fit\nMachine wash cold, do not bleach", None),
    ("t-shirts", "Supima Cotton Polo", 1299, 1799, "tee",
     [("Olive", "#5b6340"), ("Black", "#1d1d1f")], True,
     "A refined polo in premium Supima cotton with a ribbed collar. Smart enough for work, easy enough for weekends.",
     "100% Supima cotton pique\nTailored fit\nMachine wash cold", None),
    ("t-shirts", "Oversized Street Tee", 999, 1499, "tee",
     [("Beige", "#d8c7a8"), ("Charcoal", "#3a3a3c")], False,
     "Relaxed drop-shoulder silhouette in heavyweight cotton for that effortless oversized look.",
     "100% cotton, 220 GSM\nOversized fit (size down for a regular fit)\nMachine wash cold, dry in shade", None),
    ("t-shirts", "Henley Long Sleeve Tee", 1199, 1599, "tee",
     [("Maroon", "#6b1f2a"), ("Grey", "#8a8d91")], False,
     "A three-button henley with long sleeves and a soft slub texture. Layers beautifully.",
     "Cotton-modal blend\nSlim fit\nGentle machine wash", None),
    ("t-shirts", "Performance Dry-Fit Tee", 899, 1299, "tee",
     [("Cobalt", "#2b5fa8"), ("Black", "#1d1d1f")], True,
     "Lightweight, quick-dry fabric that wicks sweat during workouts and runs.",
     "Polyester-elastane performance knit\nAthletic fit\nMachine wash cold, no fabric softener", None),
    ("track-pants", "Classic Jogger Track Pants", 1399, 1999, "pants",
     [("Black", "#1d1d1f"), ("Grey Melange", "#9a9a9c"), ("Navy", "#1f2a44")], True,
     "Soft brushed-fleece joggers with elastic cuffs, deep pockets and an adjustable drawstring waist.",
     "Cotton-poly fleece, 280 GSM\nRegular jogger fit\nZip side pockets\nMachine wash cold", None),
    ("track-pants", "Tapered Fit Track Pants", 1599, 2199, "pants",
     [("Charcoal", "#3a3a3c"), ("Olive", "#5b6340")], False,
     "A modern tapered leg in four-way stretch fabric. Looks sharp, moves with you.",
     "Nylon-spandex 4-way stretch\nTapered fit\nZip pockets, ankle zips\nMachine wash cold", None),
    ("track-pants", "Side-Stripe Track Pants", 1499, 1999, "pants",
     [("Black", "#1d1d1f"), ("Navy", "#1f2a44")], True,
     "Retro-inspired track pants with contrast side stripes and a straight, easy fit.",
     "Polyester tricot\nStraight fit\nContrast side stripes\nMachine wash cold", "#f4f3ee"),
    ("track-pants", "Lightweight Training Pants", 1299, 1799, "pants",
     [("Black", "#1d1d1f"), ("Dark Grey", "#4a4a4d")], False,
     "Breathable, featherlight pants made for training days and travel.",
     "Quick-dry polyester\nAthletic fit\nReflective logo\nMachine wash cold", None),
]
SIZES = ["S", "M", "L", "XL", "XXL"]
BGS = ["#efebe4", "#e9e6e1", "#ece8df"]


def ensure_database() -> None:
    """Create the PostgreSQL database (e.g. 'ekart') if it doesn't exist yet."""
    url = make_url(settings.database_url)
    if not url.drivername.startswith("postgresql") or not url.database:
        return
    admin_engine = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database}).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{url.database}"'))
                print(f"[ok] Database '{url.database}' created")
    finally:
        admin_engine.dispose()


def seed() -> None:
    ensure_database()
    init_db()
    UPLOADS.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.email == settings.admin_email.lower()))
        if not admin:
            db.add(User(name="eKart Admin", email=settings.admin_email.lower(), phone="9876543210",
                        password_hash=hash_password(settings.admin_password), is_admin=True))
            print(f"[ok] Admin created: {settings.admin_email} / {settings.admin_password}")
        else:
            print("[skip] Admin already exists")

        if not db.get(StoreSetting, "store"):
            save_store_settings(db, StoreSettings())
            print("[ok] Store settings created")

        if not db.scalar(select(Coupon.id).where(Coupon.code == "WELCOME10")):
            db.add(Coupon(code="WELCOME10", description="10% off your first order (up to ₹200)", discount_type="percent",
                          value=10, min_order=999, max_discount=200, is_active=True))
            print("[ok] Coupon WELCOME10 created")

        cats = {}
        for i, (slug, name, desc) in enumerate([
            ("t-shirts", "T-Shirts", "Everyday essentials, polos and oversized tees in premium cotton."),
            ("track-pants", "Track Pants", "Joggers and track pants built for comfort, training and travel."),
        ]):
            c = db.scalar(select(Category).where(Category.slug == slug))
            if not c:
                c = Category(name=name, slug=slug, description=desc, sort_order=i, is_active=True)
                db.add(c)
                db.flush()
                print(f"[ok] Category {name}")
            cats[slug] = c

        if db.scalar(select(Product.id).limit(1)):
            print("[skip] Products already exist, skipping sample products")
        else:
            for n, (cat, name, price, mrp, kind, colors, featured, desc, details, stripe) in enumerate(PRODUCTS):
                slug = slugify(name)
                p = Product(category_id=cats[cat].id, name=name, slug=slug, price=price, mrp=mrp, is_featured=featured,
                            description=desc, details=details, is_active=True)
                # Image of the first colour + a close-up; additional colours get their own image too
                imgs = []
                for ci, (cname, chex) in enumerate(colors):
                    fname = f"seed-{slug}-{slugify(cname)}.svg"
                    (UPLOADS / fname).write_text(_svg(kind, chex, BGS[n % 3], stripe=stripe), encoding="utf-8")
                    imgs.append(f"/uploads/{fname}")
                    if ci == 0:
                        zname = f"seed-{slug}-detail.svg"
                        (UPLOADS / zname).write_text(_svg(kind, chex, BGS[(n + 1) % 3], zoom=True, stripe=stripe),
                                                     encoding="utf-8")
                        imgs.append(f"/uploads/{zname}")
                p.images = [ProductImage(url=u, sort_order=i) for i, u in enumerate(imgs)]
                p.variants = [
                    ProductVariant(size=s, color=cname, color_hex=chex,
                                   sku=f"EK-{n + 1:03d}-{cname[:3].upper()}-{s}",
                                   stock=(0 if (n + si + ci) % 11 == 0 else 3 + (n * 7 + si * 5 + ci * 3) % 25))
                    for ci, (cname, chex) in enumerate(colors) for si, s in enumerate(SIZES)
                ]
                db.add(p)
            print(f"[ok] {len(PRODUCTS)} sample products")
        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
