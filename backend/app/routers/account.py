from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Address, Product, User, WishlistItem
from ..schemas import AddressIn, AddressOut, ProductCard
from ..services.catalog import product_card

router = APIRouter(prefix="/api/me", tags=["account"])


# ---------- Addresses ----------
@router.get("/addresses", response_model=list[AddressOut])
def list_addresses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Address).where(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id.desc())
    ).all()


def _clear_default(db: Session, user_id: int) -> None:
    db.execute(update(Address).where(Address.user_id == user_id).values(is_default=False))


@router.post("/addresses", response_model=AddressOut, status_code=201)
def add_address(data: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    has_any = db.scalar(select(Address.id).where(Address.user_id == user.id).limit(1))
    if data.is_default or not has_any:
        _clear_default(db, user.id)
    addr = Address(user_id=user.id, **data.model_dump())
    if not has_any:
        addr.is_default = True
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return addr


def _own_address(db: Session, user: User, address_id: int) -> Address:
    addr = db.get(Address, address_id)
    if not addr or addr.user_id != user.id:
        raise HTTPException(404, "Address not found")
    return addr


@router.put("/addresses/{address_id}", response_model=AddressOut)
def edit_address(address_id: int, data: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    addr = _own_address(db, user, address_id)
    if data.is_default:
        _clear_default(db, user.id)
    for k, v in data.model_dump().items():
        setattr(addr, k, v)
    db.commit()
    db.refresh(addr)
    return addr


@router.delete("/addresses/{address_id}", status_code=204)
def delete_address(address_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    addr = _own_address(db, user, address_id)
    was_default = addr.is_default
    db.delete(addr)
    db.flush()
    if was_default:
        nxt = db.scalar(select(Address).where(Address.user_id == user.id).order_by(Address.id.desc()).limit(1))
        if nxt:
            nxt.is_default = True
    db.commit()


# ---------- Wishlist ----------
@router.get("/wishlist", response_model=list[ProductCard])
def wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.scalars(
        select(WishlistItem).where(WishlistItem.user_id == user.id).order_by(WishlistItem.id.desc())
    ).all()
    return [product_card(w.product) for w in items if w.product.is_active]


@router.get("/wishlist/ids", response_model=list[int])
def wishlist_ids(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(WishlistItem.product_id).where(WishlistItem.user_id == user.id)).all()


@router.post("/wishlist/{product_id}", status_code=204)
def add_wishlist(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Product, product_id):
        raise HTTPException(404, "Product not found")
    exists = db.scalar(select(WishlistItem.id).where(WishlistItem.user_id == user.id, WishlistItem.product_id == product_id))
    if not exists:
        db.add(WishlistItem(user_id=user.id, product_id=product_id))
        db.commit()


@router.delete("/wishlist/{product_id}", status_code=204)
def remove_wishlist(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.scalar(select(WishlistItem).where(WishlistItem.user_id == user.id, WishlistItem.product_id == product_id))
    if item:
        db.delete(item)
        db.commit()
