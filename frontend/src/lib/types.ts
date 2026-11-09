export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Address {
  id: number;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}
export type AddressInput = Omit<Address, "id">;

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
}
export interface CategoryAdmin extends Category {
  is_active: boolean;
  sort_order: number;
  product_count: number;
}

export interface Color {
  name: string;
  hex: string | null;
}

export interface Variant {
  id: number;
  size: string;
  color: string;
  color_hex: string | null;
  sku: string | null;
  stock: number;
}

export interface ProductCard {
  id: number;
  name: string;
  slug: string;
  price: number;
  mrp: number;
  image: string | null;
  hover_image: string | null;
  category: Category;
  sizes: string[];
  colors: Color[];
  in_stock: boolean;
  is_featured: boolean;
}

export interface ProductDetail extends ProductCard {
  description: string | null;
  details: string | null;
  images: string[];
  variants: Variant[];
}

export interface ProductList {
  items: ProductCard[];
  total: number;
  page: number;
  page_size: number;
  facets: { sizes: string[]; colors: Color[]; min_price: number; max_price: number };
}

export interface ProductAdmin {
  id: number;
  name: string;
  slug: string;
  category_id: number;
  category: Category;
  description: string | null;
  details: string | null;
  price: number;
  mrp: number;
  is_active: boolean;
  is_featured: boolean;
  images: string[];
  variants: Variant[];
  total_stock: number;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface CartItem {
  variant_id: number;
  quantity: number;
  product_id: number;
  name: string;
  slug: string;
  image: string | null;
  size: string;
  color: string;
  price: number;
}

export interface QuoteLine {
  variant_id: number;
  product_id: number | null;
  product_name: string;
  product_slug: string | null;
  image: string | null;
  size: string;
  color: string;
  unit_price: number;
  mrp: number;
  quantity: number;
  line_total: number;
  stock: number;
  issue: string | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  coupon_code: string | null;
  coupon_valid: boolean | null;
  coupon_message: string | null;
  free_shipping_above: number;
  cod_enabled: boolean;
  has_issues: boolean;
}

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PLACED"
  | "PACKED"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface OrderItem {
  product_id: number | null;
  variant_id: number | null;
  product_name: string;
  product_slug: string | null;
  size: string;
  color: string;
  image_url: string | null;
  unit_price: number;
  quantity: number;
}

export interface OrderEvent {
  status: OrderStatus;
  note: string | null;
  created_at: string;
}

export interface Order {
  id: number;
  order_number: string;
  status: OrderStatus;
  payment_method: "ONLINE" | "COD";
  payment_status: PaymentStatus;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  coupon_code: string | null;
  shipping_address: Omit<AddressInput, "is_default">;
  notes: string | null;
  payment_ref: string | null;
  payment_mode: string | null;
  paid_at: string | null;
  shipping_partner: string | null;
  awb: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  items: OrderItem[];
  events: OrderEvent[];
}

export interface OrderAdmin extends Order {
  user: User;
  cf_order_id: string | null;
  refund_ref: string | null;
  shipping_provider: string | null;
  partner_order_id: string | null;
  partner_shipment_id: string | null;
  label_url: string | null;
  pickup_requested_at: string | null;
  partner_status: string | null;
}

export interface OrderSummary {
  order_number: string;
  status: OrderStatus;
  payment_method: "ONLINE" | "COD";
  payment_status: PaymentStatus;
  total: number;
  created_at: string;
  item_count: number;
  first_image: string | null;
  customer_name: string;
  customer_phone: string | null;
  city: string | null;
  awb: string | null;
  payment_ref: string | null;
}

export interface PaymentSession {
  mode: "cashfree" | "mock";
  env: string;
  payment_session_id: string;
  cf_order_id: string;
}

export interface StoreSettings {
  store_name: string;
  tagline: string;
  announcement: string;
  support_phone: string;
  support_email: string;
  instagram_url: string;
  business_name: string;
  business_address: string;
  jurisdiction_city: string;
  free_shipping_above: number;
  shipping_fee: number;
  cod_enabled: boolean;
  cod_max_order: number;
  shipping_partner_name: string;
  tracking_url_template: string;
  return_days: number;
  hero_rail_photos: boolean;
  parcel_weight_per_item_kg: number;
  parcel_min_weight_kg: number;
  parcel_length_cm: number;
  parcel_breadth_cm: number;
  parcel_height_cm: number;
}

export interface IntegrationStatus {
  cashfree_mode: "cashfree" | "mock";
  cashfree_env: string;
  shipping_provider: string;
  backend_url: string;
  shiprocket_configured: boolean;
  shiprocket_pickup_location: string;
  shipping_webhook_url: string;
  shipping_webhook_secret_set: boolean;
}

export interface AdminSettings {
  store: StoreSettings;
  integrations: IntegrationStatus;
}

export interface CourierOption {
  id: number;
  name: string;
  rate: number;
  etd: string | null;
  days: string | null;
  cod: boolean;
  recommended: boolean;
}

export interface CourierQuote {
  weight_kg: number;
  couriers: CourierOption[];
}

export interface Coupon {
  id: number;
  code: string;
  description: string | null;
  discount_type: "percent" | "flat";
  value: number;
  min_order: number;
  max_discount: number | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
}

export interface Dashboard {
  gross_sales: number;
  collected: number;
  orders_today: number;
  revenue_today: number;
  to_ship: number;
  in_transit: number;
  pending_payment: number;
  status_counts: Record<string, number>;
  customers: number;
  products: number;
  sales_by_day: { date: string; total: number }[];
  top_products: { name: string; qty: number; revenue: number; image: string | null }[];
  low_stock: { product_id: number; name: string; size: string; color: string; stock: number }[];
  recent_orders: OrderSummary[];
}
