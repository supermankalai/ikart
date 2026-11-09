from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

PHONE = r"^[6-9]\d{9}$"
PINCODE = r"^\d{6}$"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(pattern=PHONE)
    password: str = Field(min_length=6, max_length=72)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    name: str
    email: str
    phone: str | None
    is_admin: bool
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    user: UserOut


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=PHONE)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=72)


# ---------- Address ----------
class AddressIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=PHONE)
    line1: str = Field(min_length=3, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    pincode: str = Field(pattern=PINCODE)
    is_default: bool = False


class AddressOut(ORM, AddressIn):
    id: int


# ---------- Catalogue ----------
class CategoryOut(ORM):
    id: int
    name: str
    slug: str
    description: str | None = None
    image_url: str | None = None


class CategoryAdminOut(CategoryOut):
    is_active: bool
    sort_order: int
    product_count: int = 0


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = None
    image_url: str | None = None
    is_active: bool = True
    sort_order: int = 0


class ColorOut(BaseModel):
    name: str
    hex: str | None = None


class VariantOut(ORM):
    id: int
    size: str
    color: str
    color_hex: str | None
    sku: str | None
    stock: int


class ProductCard(BaseModel):
    id: int
    name: str
    slug: str
    price: int
    mrp: int
    image: str | None
    hover_image: str | None
    category: CategoryOut
    sizes: list[str]
    colors: list[ColorOut]
    in_stock: bool
    is_featured: bool


class ProductDetail(ProductCard):
    description: str | None
    details: str | None
    images: list[str]
    variants: list[VariantOut]


class Facets(BaseModel):
    sizes: list[str]
    colors: list[ColorOut]
    min_price: int
    max_price: int


class ProductList(BaseModel):
    items: list[ProductCard]
    total: int
    page: int
    page_size: int
    facets: Facets


class VariantIn(BaseModel):
    id: int | None = None
    size: str = Field(min_length=1, max_length=20)
    color: str = Field(min_length=1, max_length=40)
    color_hex: str | None = Field(default=None, max_length=9)
    sku: str | None = Field(default=None, max_length=64)
    stock: int = Field(ge=0)

    @field_validator("sku")
    @classmethod
    def blank_sku(cls, v: str | None) -> str | None:
        return v.strip() or None if v else None


class ProductIn(BaseModel):
    category_id: int
    name: str = Field(min_length=2, max_length=200)
    slug: str | None = Field(default=None, max_length=220)
    description: str | None = None
    details: str | None = None
    price: int = Field(gt=0)
    mrp: int = Field(ge=0)
    is_active: bool = True
    is_featured: bool = False
    images: list[str] = []
    variants: list[VariantIn] = Field(min_length=1)


class ProductAdminOut(BaseModel):
    id: int
    name: str
    slug: str
    category_id: int
    category: CategoryOut
    description: str | None
    details: str | None
    price: int
    mrp: int
    is_active: bool
    is_featured: bool
    images: list[str]
    variants: list[VariantOut]
    total_stock: int
    created_at: datetime


class ProductAdminList(BaseModel):
    items: list[ProductAdminOut]
    total: int
    page: int
    page_size: int


# ---------- Cart / pricing ----------
class CartItemIn(BaseModel):
    variant_id: int
    quantity: int = Field(ge=1, le=20)


class QuoteIn(BaseModel):
    items: list[CartItemIn]
    coupon_code: str | None = None


class QuoteLine(BaseModel):
    variant_id: int
    product_id: int | None
    product_name: str
    product_slug: str | None
    image: str | None
    size: str
    color: str
    unit_price: int
    mrp: int
    quantity: int
    line_total: int
    stock: int
    issue: str | None = None


class QuoteOut(BaseModel):
    lines: list[QuoteLine]
    subtotal: int
    discount: int
    shipping_fee: int
    total: int
    coupon_code: str | None
    coupon_valid: bool | None
    coupon_message: str | None
    free_shipping_above: int
    cod_enabled: bool
    has_issues: bool


# ---------- Orders ----------
class OrderCreateIn(BaseModel):
    items: list[CartItemIn] = Field(min_length=1)
    address_id: int
    payment_method: Literal["ONLINE", "COD"]
    coupon_code: str | None = None
    notes: str | None = Field(default=None, max_length=500)


class OrderItemOut(ORM):
    product_id: int | None
    variant_id: int | None
    product_name: str
    product_slug: str | None
    size: str
    color: str
    image_url: str | None
    unit_price: int
    quantity: int


class OrderEventOut(ORM):
    status: str
    note: str | None
    created_at: datetime


class OrderOut(ORM):
    id: int
    order_number: str
    status: str
    payment_method: str
    payment_status: str
    subtotal: int
    discount: int
    shipping_fee: int
    total: int
    coupon_code: str | None
    shipping_address: dict
    notes: str | None
    payment_ref: str | None
    payment_mode: str | None
    paid_at: datetime | None
    shipping_partner: str | None
    awb: str | None
    tracking_url: str | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime
    items: list[OrderItemOut]
    events: list[OrderEventOut]


class OrderAdminOut(OrderOut):
    user: UserOut
    cf_order_id: str | None
    refund_ref: str | None
    shipping_provider: str | None = None
    partner_order_id: str | None = None
    partner_shipment_id: str | None = None
    label_url: str | None = None
    pickup_requested_at: datetime | None = None
    partner_status: str | None = None


class OrderSummary(BaseModel):
    order_number: str
    status: str
    payment_method: str
    payment_status: str
    total: int
    created_at: datetime
    item_count: int
    first_image: str | None
    customer_name: str
    customer_phone: str | None
    city: str | None
    awb: str | None
    payment_ref: str | None


class OrderPage(BaseModel):
    items: list[OrderSummary]
    total: int
    page: int
    page_size: int


class PaymentSession(BaseModel):
    mode: Literal["cashfree", "mock"]
    env: str
    payment_session_id: str
    cf_order_id: str


class OrderCreateOut(BaseModel):
    order: OrderOut
    payment: PaymentSession | None = None


class VerifyIn(BaseModel):
    order_number: str


class MockCompleteIn(BaseModel):
    order_number: str
    success: bool


# ---------- Admin ----------
class StatusUpdateIn(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=500)


class ShipIn(BaseModel):
    # "manual": admin enters the AWB. "shiprocket": create the shipment through the Shiprocket API.
    method: Literal["manual", "shiprocket"] = "manual"
    awb: str | None = Field(default=None, max_length=100)
    partner: str | None = Field(default=None, max_length=100)
    tracking_url: str | None = Field(default=None, max_length=500)
    # Shiprocket only
    courier_id: int | None = None  # None = let Shiprocket pick the recommended courier
    weight_kg: float | None = Field(default=None, gt=0, le=50)
    length_cm: int | None = Field(default=None, ge=1, le=200)
    breadth_cm: int | None = Field(default=None, ge=1, le=200)
    height_cm: int | None = Field(default=None, ge=1, le=200)


class CourierOption(BaseModel):
    id: int
    name: str
    rate: float
    etd: str | None = None
    days: str | None = None
    cod: bool = True
    recommended: bool = False


class CourierQuoteOut(BaseModel):
    weight_kg: float
    couriers: list[CourierOption]


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    description: str | None = None
    discount_type: Literal["percent", "flat"]
    value: int = Field(gt=0)
    min_order: int = Field(default=0, ge=0)
    max_discount: int | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    is_active: bool = True
    expires_at: datetime | None = None

    @field_validator("code")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.strip().upper()


class CouponOut(ORM):
    id: int
    code: str
    description: str | None
    discount_type: str
    value: int
    min_order: int
    max_discount: int | None
    usage_limit: int | None
    used_count: int
    is_active: bool
    expires_at: datetime | None
    created_at: datetime


class StoreSettings(BaseModel):
    store_name: str = "eKart"
    tagline: str = "Premium everyday wear"
    announcement: str = "Free shipping on orders above ₹999 · Easy 7-day returns"
    support_phone: str = "+91 98765 43210"
    support_email: str = "support@ekart.shop"
    instagram_url: str = ""
    free_shipping_above: int = Field(default=999, ge=0)
    shipping_fee: int = Field(default=79, ge=0)
    cod_enabled: bool = True
    cod_max_order: int = Field(default=5000, ge=0)
    shipping_partner_name: str = "Delivery Partner"
    tracking_url_template: str = ""  # e.g. https://partner.com/track?awb={awb}
    return_days: int = Field(default=7, ge=0)
    # Home page 3D rail: hang the real product photo (when it is a garment on a plain background)
    hero_rail_photos: bool = True
    # Default parcel used when booking shipments through a delivery partner API
    parcel_weight_per_item_kg: float = Field(default=0.3, gt=0, le=20)
    parcel_min_weight_kg: float = Field(default=0.5, gt=0, le=50)
    parcel_length_cm: int = Field(default=30, ge=1, le=200)
    parcel_breadth_cm: int = Field(default=25, ge=1, le=200)
    parcel_height_cm: int = Field(default=4, ge=1, le=200)


class IntegrationStatus(BaseModel):
    cashfree_mode: Literal["cashfree", "mock"]
    cashfree_env: str
    shipping_provider: str
    backend_url: str
    shiprocket_configured: bool = False
    shiprocket_pickup_location: str = ""
    shipping_webhook_url: str = ""
    shipping_webhook_secret_set: bool = False


class AdminSettingsOut(BaseModel):
    store: StoreSettings
    integrations: IntegrationStatus


class CustomerOut(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None
    created_at: datetime
    order_count: int
    total_spent: int


class CustomerPage(BaseModel):
    items: list[CustomerOut]
    total: int
    page: int
    page_size: int
