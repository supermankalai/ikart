"""Shiprocket API client (https://apiv2.shiprocket.in/v1/external).

Flow used by eKart when the admin clicks "Ship with Shiprocket":
  1. POST /orders/create/adhoc       -> Shiprocket order_id + shipment_id
  2. POST /courier/assign/awb        -> AWB number + courier name (needs wallet balance)
  3. POST /courier/generate/pickup   -> pickup request with the courier
  4. POST /courier/generate/label    -> shipping label PDF url
Tracking: webhook (Settings -> API -> Webhooks in Shiprocket) or GET /courier/track/awb/{awb}.

Auth: POST /auth/login with the *API user* email/password returns a bearer token (valid ~10 days).
"""
import logging
import threading
import time
from datetime import timezone, timedelta

import httpx

from ..config import settings
from ..models import Order
from ..schemas import CourierOption

log = logging.getLogger("ekart.shiprocket")
IST = timezone(timedelta(hours=5, minutes=30))
TRACKING_URL = "https://shiprocket.co/tracking/{awb}"

_token: str | None = None
_token_expiry = 0.0
_lock = threading.Lock()


class ShiprocketError(Exception):
    pass


def _login() -> str:
    global _token, _token_expiry
    if not settings.shiprocket_enabled:
        raise ShiprocketError("Shiprocket is not set up. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD to backend/.env")
    try:
        r = httpx.post(f"{settings.shiprocket_base_url}/auth/login",
                       json={"email": settings.shiprocket_email, "password": settings.shiprocket_password}, timeout=20)
    except httpx.HTTPError as e:
        raise ShiprocketError("Could not reach Shiprocket. Please try again.") from e
    if r.status_code >= 400 or not r.json().get("token"):
        log.error("Shiprocket login failed: %s %s", r.status_code, r.text[:300])
        raise ShiprocketError("Shiprocket login failed. Check SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD (use the API user, not your main login).")
    _token = r.json()["token"]
    _token_expiry = time.time() + 9 * 24 * 3600  # tokens last 10 days; refresh a day early
    return _token


def _get_token(force: bool = False) -> str:
    with _lock:
        if force or not _token or time.time() >= _token_expiry:
            return _login()
        return _token


def _error_message(r: httpx.Response) -> str:
    try:
        data = r.json()
    except ValueError:
        return f"Shiprocket error ({r.status_code})"
    msg = data.get("message") or ""
    errors = data.get("errors")
    if isinstance(errors, dict) and errors:
        first = next(iter(errors.values()))
        detail = first[0] if isinstance(first, list) and first else first
        msg = f"{msg} {detail}".strip() if detail else msg
    return msg or f"Shiprocket error ({r.status_code})"


def _request(method: str, path: str, *, json: dict | None = None, params: dict | None = None) -> dict:
    for attempt in (1, 2):
        token = _get_token(force=attempt == 2)
        try:
            r = httpx.request(method, f"{settings.shiprocket_base_url}{path}", json=json, params=params, timeout=30,
                              headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        except httpx.HTTPError as e:
            log.exception("Shiprocket request failed: %s %s", method, path)
            raise ShiprocketError("Could not reach Shiprocket. Please try again.") from e
        if r.status_code == 401 and attempt == 1:
            continue  # token expired early: log in again once
        if r.status_code >= 400:
            log.error("Shiprocket %s %s -> %s %s", method, path, r.status_code, r.text[:500])
            raise ShiprocketError(_error_message(r))
        return r.json() if r.content else {}
    raise ShiprocketError("Shiprocket authentication failed")


# ---------- Helpers ----------
def _digits(s: str | None) -> str:
    return "".join(ch for ch in (s or "") if ch.isdigit())


def parcel_weight(order: Order, per_item: float, minimum: float) -> float:
    qty = sum(i.quantity for i in order.items)
    return round(max(minimum, per_item * qty), 2)


_pickup_pin_cache: dict[str, str] = {}


def pickup_pincode() -> str:
    """PIN code of the pickup address (from .env, otherwise looked up in Shiprocket)."""
    if settings.shiprocket_pickup_pincode:
        return settings.shiprocket_pickup_pincode
    name = settings.shiprocket_pickup_location
    if name in _pickup_pin_cache:
        return _pickup_pin_cache[name]
    data = _request("GET", "/settings/company/pickup")
    addresses = (data.get("data") or {}).get("shipping_address") or []
    for a in addresses:
        if str(a.get("pickup_location", "")).strip().lower() == name.strip().lower():
            pin = str(a.get("pin_code") or "")
            if pin:
                _pickup_pin_cache[name] = pin
                return pin
    names = ", ".join(str(a.get("pickup_location")) for a in addresses) or "none"
    raise ShiprocketError(f"Pickup location '{name}' not found in Shiprocket (found: {names}). "
                          "Set SHIPROCKET_PICKUP_LOCATION in backend/.env to the exact name.")


# ---------- API calls ----------
def couriers(order: Order, weight_kg: float) -> list[CourierOption]:
    addr = order.shipping_address or {}
    is_cod = order.payment_method == "COD" and order.payment_status != "PAID"
    data = _request("GET", "/courier/serviceability/", params={
        "pickup_postcode": pickup_pincode(),
        "delivery_postcode": addr.get("pincode"),
        "weight": weight_kg,
        "cod": 1 if is_cod else 0,
        "declared_value": order.total,
    })
    body = data.get("data") or {}
    recommended = body.get("recommended_courier_company_id")
    out: list[CourierOption] = []
    for c in body.get("available_courier_companies") or []:
        try:
            cid = int(c.get("courier_company_id"))
        except (TypeError, ValueError):
            continue
        out.append(CourierOption(
            id=cid,
            name=str(c.get("courier_name") or f"Courier {cid}"),
            rate=float(c.get("rate") or c.get("freight_charge") or 0),
            etd=c.get("etd") or None,
            days=str(c.get("estimated_delivery_days")) if c.get("estimated_delivery_days") not in (None, "") else None,
            cod=bool(c.get("cod", 1)),
            recommended=cid == recommended,
        ))
    if is_cod:
        out = [c for c in out if c.cod]
    if not out:
        raise ShiprocketError(data.get("message") or
                              f"No courier delivers to PIN {addr.get('pincode')}{' with cash on delivery' if is_cod else ''}")
    out.sort(key=lambda c: (not c.recommended, c.rate))
    return out


def create_order(order: Order, weight_kg: float, dims: tuple[int, int, int]) -> tuple[str, str]:
    addr = order.shipping_address or {}
    first, _, last = (addr.get("name") or order.user.name or "Customer").strip().partition(" ")
    is_cod = order.payment_method == "COD" and order.payment_status != "PAID"
    body = {
        "order_id": order.order_number,
        "order_date": order.created_at.astimezone(IST).strftime("%Y-%m-%d %H:%M"),
        "pickup_location": settings.shiprocket_pickup_location,
        "billing_customer_name": first,
        "billing_last_name": last,
        "billing_address": addr.get("line1") or "",
        "billing_address_2": addr.get("line2") or "",
        "billing_city": addr.get("city") or "",
        "billing_pincode": addr.get("pincode") or "",
        "billing_state": addr.get("state") or "",
        "billing_country": "India",
        "billing_email": order.user.email,
        "billing_phone": _digits(addr.get("phone") or order.user.phone)[-10:],
        "shipping_is_billing": True,
        "order_items": [
            {
                "name": f"{i.product_name} ({i.color}, {i.size})"[:200],
                "sku": f"{i.product_slug or 'item'}-{i.color}-{i.size}".lower().replace(" ", "-")[:50],
                "units": i.quantity,
                "selling_price": i.unit_price,
                "discount": 0,
                "tax": 0,
            }
            for i in order.items
        ],
        "payment_method": "COD" if is_cod else "Prepaid",
        "shipping_charges": order.shipping_fee,
        "giftwrap_charges": 0,
        "transaction_charges": 0,
        "total_discount": order.discount,
        "sub_total": order.subtotal,
        "length": dims[0],
        "breadth": dims[1],
        "height": dims[2],
        "weight": weight_kg,
    }
    data = _request("POST", "/orders/create/adhoc", json=body)
    if not data.get("order_id") or not data.get("shipment_id"):
        raise ShiprocketError(data.get("message") or "Shiprocket did not return a shipment")
    return str(data["order_id"]), str(data["shipment_id"])


def assign_awb(shipment_id: str, courier_id: int | None) -> tuple[str, str]:
    body: dict = {"shipment_id": shipment_id}
    if courier_id:
        body["courier_id"] = courier_id
    data = _request("POST", "/courier/assign/awb", json=body)
    inner = ((data.get("response") or {}).get("data") or {}) if isinstance(data.get("response"), dict) else {}
    awb = inner.get("awb_code")
    if data.get("awb_assign_status") != 1 or not awb:
        err = inner.get("awb_assign_error") or data.get("message") or "Could not assign a courier"
        raise ShiprocketError(f"{err}. Check your Shiprocket wallet balance and try another courier.")
    return str(awb), str(inner.get("courier_name") or "Shiprocket")


def request_pickup(shipment_id: str) -> str | None:
    data = _request("POST", "/courier/generate/pickup", json={"shipment_id": [int(shipment_id)]})
    resp = data.get("response") if isinstance(data.get("response"), dict) else {}
    if data.get("pickup_status") != 1:
        raise ShiprocketError(str(data.get("message") or (resp or {}).get("data") or "Pickup request failed"))
    return (resp or {}).get("pickup_scheduled_date")


def generate_label(shipment_id: str) -> str:
    data = _request("POST", "/courier/generate/label", json={"shipment_id": [int(shipment_id)]})
    url = data.get("label_url")
    if not url:
        raise ShiprocketError(str(data.get("response") or data.get("message") or "Label not ready yet. Try again in a minute."))
    return str(url)


def track(awb: str) -> tuple[str | None, str | None]:
    """Returns (current status text, tracking url)."""
    data = _request("GET", f"/courier/track/awb/{awb}")
    td = data.get("tracking_data")
    if td is None and len(data) == 1:  # some responses are keyed by AWB / shipment id
        td = (next(iter(data.values())) or {}).get("tracking_data")
    td = td or {}
    status = None
    tracks = td.get("shipment_track") or []
    if tracks and isinstance(tracks[0], dict):
        status = tracks[0].get("current_status")
    if not status:
        acts = td.get("shipment_track_activities") or []
        if acts and isinstance(acts[0], dict):
            status = acts[0].get("sr-status-label") or acts[0].get("activity")
    return (str(status) if status else None), td.get("track_url")


def cancel_order(partner_order_id: str) -> None:
    _request("POST", "/orders/cancel", json={"ids": [int(partner_order_id)]})
