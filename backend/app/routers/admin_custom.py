"""Admin: custom print orders (design requests, print files) and the clipart library."""
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import Clipart, Order
from ..schemas import ClipartIn, ClipartOut, DesignRequestIn, OrderAdminOut
from ..services import custom as svc

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])

CLIPART_TYPES = {"image/png": ".png", "image/webp": ".webp", "image/svg+xml": ".svg"}
UNSAFE_SVG = re.compile(rb"<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*[\"']https?:", re.I)


def _get_order(db: Session, number: str) -> Order:
    o = db.scalar(select(Order).where(Order.order_number == number))
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@router.post("/orders/{number}/design-request", response_model=OrderAdminOut)
def design_request(number: str, data: DesignRequestIn, db: Session = Depends(get_db)):
    """Ask the customer to upload a new design (custom print orders, before approval)."""
    return svc.request_design_change(db, _get_order(db, number), data.message)


@router.get("/orders/{number}/print-files")
def print_files(number: str, db: Session = Depends(get_db)):
    """ZIP with every print file, previews, roster.csv and a job sheet for the print team."""
    o = _get_order(db, number)
    data = svc.design_zip(o)
    return Response(data, media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="ikart-{o.order_number}-print-files.zip"'})


# ---------- Clipart library ----------
@router.get("/clipart", response_model=list[ClipartOut])
def list_clipart(db: Session = Depends(get_db)):
    return db.scalars(select(Clipart).order_by(Clipart.category, Clipart.sort_order, Clipart.name)).all()


@router.post("/clipart/upload")
async def upload_clipart(file: UploadFile = File(...)):
    ext = CLIPART_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Clipart must be PNG, WEBP or SVG")
    data = await file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Clipart must be smaller than 5 MB")
    if ext == ".svg":
        if b"<svg" not in data[:2048].lower() or UNSAFE_SVG.search(data):
            raise HTTPException(400, "This SVG contains scripts or external links and can't be used")
    elif not (data.startswith(b"\x89PNG") or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")):
        raise HTTPException(400, "This file is not a valid image")
    folder = Path(settings.upload_dir) / "clipart"
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(data)
    return {"url": f"/uploads/clipart/{name}"}


@router.post("/clipart", response_model=ClipartOut, status_code=201)
def create_clipart(data: ClipartIn, db: Session = Depends(get_db)):
    c = Clipart(**data.model_dump())
    c.name, c.category = c.name.strip(), c.category.strip()
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/clipart/{clip_id}", response_model=ClipartOut)
def update_clipart(clip_id: int, data: ClipartIn, db: Session = Depends(get_db)):
    c = db.get(Clipart, clip_id)
    if not c:
        raise HTTPException(404, "Clipart not found")
    for k, v in data.model_dump().items():
        setattr(c, k, v.strip() if isinstance(v, str) and k in ("name", "category") else v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/clipart/{clip_id}", status_code=204)
def delete_clipart(clip_id: int, db: Session = Depends(get_db)):
    c = db.get(Clipart, clip_id)
    if c:
        db.delete(c)
        db.commit()
