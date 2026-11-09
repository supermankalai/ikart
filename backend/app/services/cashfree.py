"""Cashfree Payment Gateway (PG API v2023-08-01).

Flow:
  1. create_order()   -> returns payment_session_id for the browser SDK
  2. Browser opens Cashfree checkout with that session id
  3. fetch_order()    -> confirm order_status == "PAID" (never trust the browser alone)
  4. Webhook          -> verify_webhook_signature() then confirm again with fetch_order()

Docs: https://www.cashfree.com/docs/api-reference/payments/latest/orders/create
"""
import base64
import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone

import httpx

from ..config import settings
from ..models import Order, User

log = logging.getLogger("ekart.cashfree")


class CashfreeError(Exception):
    pass


def _headers() -> dict[str, str]:
    return {
        "x-client-id": settings.cashfree_app_id,
        "x-client-secret": settings.cashfree_secret_key,
        "x-api-version": settings.cashfree_api_version,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _request(method: str, path: str, json: dict | None = None) -> dict:
    url = f"{settings.cashfree_base_url}{path}"
    try:
        r = httpx.request(method, url, headers=_headers(), json=json, timeout=20)
    except httpx.HTTPError as e:
        log.exception("Cashfree request failed")
        raise CashfreeError("Could not reach the payment gateway. Please try again.") from e
    if r.status_code >= 400:
        log.error("Cashfree %s %s -> %s %s", method, path, r.status_code, r.text)
        try:
            msg = r.json().get("message")
        except ValueError:
            msg = None
        raise CashfreeError(msg or "Payment gateway error")
    return r.json() if r.content else {}


def create_order(order: Order, user: User, cf_order_id: str) -> dict:
    addr = order.shipping_address or {}
    body: dict = {
        "order_id": cf_order_id,
        "order_amount": float(order.total),
        "order_currency": "INR",
        "customer_details": {
            "customer_id": f"user_{user.id}",
            "customer_name": user.name,
            "customer_email": user.email,
            "customer_phone": addr.get("phone") or user.phone or "9999999999",
        },
        "order_meta": {
            "return_url": f"{settings.frontend_url}/order/{order.order_number}/status",
        },
        "order_note": f"eKart order {order.order_number}",
        # Payment link expires with our pending-payment window (Cashfree minimum is 15 min)
        "order_expiry_time": (
            datetime.now(timezone.utc) + timedelta(minutes=max(settings.pending_payment_expiry_minutes, 16))
        ).isoformat(timespec="seconds"),
    }
    # Cashfree only accepts HTTPS notify URLs
    if settings.backend_url.startswith("https://"):
        body["order_meta"]["notify_url"] = f"{settings.backend_url}/api/payments/webhook"
    return _request("POST", "/orders", body)


def fetch_order(cf_order_id: str) -> dict:
    return _request("GET", f"/orders/{cf_order_id}")


def fetch_payments(cf_order_id: str) -> list[dict]:
    data = _request("GET", f"/orders/{cf_order_id}/payments")
    return data if isinstance(data, list) else []


def create_refund(cf_order_id: str, amount: int, refund_id: str, note: str = "Order cancelled") -> dict:
    return _request("POST", f"/orders/{cf_order_id}/refunds", {
        "refund_amount": float(amount),
        "refund_id": refund_id,
        "refund_note": note[:100],
    })


def verify_webhook_signature(raw_body: bytes, timestamp: str | None, signature: str | None) -> bool:
    if not (timestamp and signature and settings.cashfree_secret_key):
        return False
    message = timestamp.encode() + raw_body
    digest = hmac.new(settings.cashfree_secret_key.encode(), message, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, signature)
