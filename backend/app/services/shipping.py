"""Delivery partner integration.

Providers:
  * manual     - admin books the pickup on the partner's portal and types the AWB number.
  * shiprocket - eKart creates the shipment, assigns a courier, books the pickup and gets the label
                 through the Shiprocket API (services/shiprocket.py).

Status updates arrive at  POST /api/shipping/webhook  (see routers/orders.py). It accepts:
  * Shiprocket's tracking webhook (header x-api-key: <SHIPPING_WEBHOOK_SECRET>)
  * a generic body {"awb": "...", "status": "out_for_delivery"} (header X-Webhook-Secret)

To add another partner: subclass DeliveryProvider, implement create_shipment(), add it to PROVIDERS.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

from ..config import settings
from ..models import Order, OrderStatus
from ..schemas import ShipIn, StoreSettings
from . import shiprocket


@dataclass
class ShipmentResult:
    partner: str
    awb: str
    tracking_url: str | None = None
    label_url: str | None = None
    note: str | None = None  # extra info for the order timeline (e.g. pickup warnings)


class ShippingError(Exception):
    pass


class DeliveryProvider:
    key = "base"

    def create_shipment(self, order: Order, store: StoreSettings, data: ShipIn) -> ShipmentResult:
        raise NotImplementedError

    def cancel_shipment(self, order: Order) -> None:
        return None


class ManualProvider(DeliveryProvider):
    """Admin books the pickup on the partner's portal/app and enters the AWB number here."""

    key = "manual"

    def create_shipment(self, order, store, data):
        awb = (data.awb or "").strip()
        if not awb:
            raise ShippingError("Enter the AWB / tracking number from your delivery partner")
        partner_name = (data.partner or "").strip() or store.shipping_partner_name
        tracking_url = data.tracking_url
        if not tracking_url and store.tracking_url_template:
            tracking_url = store.tracking_url_template.replace("{awb}", awb)
        return ShipmentResult(partner=partner_name, awb=awb, tracking_url=tracking_url or None)


class ShiprocketProvider(DeliveryProvider):
    key = "shiprocket"

    def create_shipment(self, order, store, data):
        weight = data.weight_kg or shiprocket.parcel_weight(order, store.parcel_weight_per_item_kg, store.parcel_min_weight_kg)
        dims = (data.length_cm or store.parcel_length_cm, data.breadth_cm or store.parcel_breadth_cm,
                data.height_cm or store.parcel_height_cm)
        try:
            # Step 1: create the order in Shiprocket once; a retry continues from the saved shipment
            if not order.partner_shipment_id:
                order.partner_order_id, order.partner_shipment_id = shiprocket.create_order(order, weight, dims)
                order.shipping_provider = self.key
            # Step 2: courier + AWB (this is the step that charges the Shiprocket wallet)
            awb, courier = shiprocket.assign_awb(order.partner_shipment_id, data.courier_id)
        except shiprocket.ShiprocketError as e:
            raise ShippingError(str(e)) from e

        notes: list[str] = []
        # Steps 3-4 are retried from the order page if they fail, so they don't block shipping
        try:
            when = shiprocket.request_pickup(order.partner_shipment_id)
            order.pickup_requested_at = datetime.now(timezone.utc)
            notes.append(f"Pickup requested{f' for {when}' if when else ''}")
        except shiprocket.ShiprocketError as e:
            notes.append(f"Pickup not booked yet ({e}). Use 'Request pickup'.")
        label = None
        try:
            label = shiprocket.generate_label(order.partner_shipment_id)
        except shiprocket.ShiprocketError:
            pass
        return ShipmentResult(partner=courier, awb=awb, tracking_url=shiprocket.TRACKING_URL.format(awb=awb),
                              label_url=label, note=" · ".join(notes) or None)

    def cancel_shipment(self, order):
        if order.partner_order_id:
            try:
                shiprocket.cancel_order(order.partner_order_id)
            except shiprocket.ShiprocketError as e:
                raise ShippingError(str(e)) from e


PROVIDERS: dict[str, type[DeliveryProvider]] = {
    ManualProvider.key: ManualProvider,
    ShiprocketProvider.key: ShiprocketProvider,
}


def get_provider(key: str | None = None) -> DeliveryProvider:
    cls = PROVIDERS.get(key or settings.shipping_provider, ManualProvider)
    return cls()


# ---------- Courier status words -> eKart order statuses ----------
_ADVANCE = {
    "PICKED UP": OrderStatus.SHIPPED,
    "SHIPPED": OrderStatus.SHIPPED,
    "IN TRANSIT": OrderStatus.SHIPPED,
    "OUT FOR DELIVERY": OrderStatus.OUT_FOR_DELIVERY,
    "DELIVERED": OrderStatus.DELIVERED,
}
# Statuses that need the admin's attention; recorded on the timeline without changing the order status
_ALERTS = ("RTO", "UNDELIVERED", "UNDELIVERABLE", "CANCELED", "CANCELLED", "LOST", "DAMAGED", "DESTROYED",
           "EXCEPTION", "DISPOSED", "MISROUTED", "DELAYED")


def interpret_partner_status(raw: str | None) -> tuple[str | None, bool]:
    """Returns (eKart status to move to or None, is_alert)."""
    if not raw:
        return None, False
    s = " ".join(raw.replace("_", " ").replace("-", " ").upper().split())
    if s.startswith("RTO") or any(word in s for word in _ALERTS):
        return None, True
    if s in _ADVANCE:
        return _ADVANCE[s], False
    if s.startswith("IN TRANSIT") or "DESTINATION HUB" in s or s.startswith("REACHED"):
        return OrderStatus.SHIPPED, False
    return None, False


def map_partner_status(raw: str) -> str | None:  # kept for backwards compatibility
    return interpret_partner_status(raw)[0]
