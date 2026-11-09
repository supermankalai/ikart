/*
 * eKart prototype — shared mock data layer.
 * Both the store (index.html) and admin (admin.html) read/write the same
 * browser localStorage, so an order placed in the store appears in admin.
 *
 * In the real build this file is replaced by API calls to your backend:
 *   GET/POST /api/products, /api/orders, /api/settings ...
 */
const EK = (() => {
  const PREFIX = "ekart_";

  const SEED_PRODUCTS = [
    { id: "P1001", name: "Classic Leather Watch", cat: "Accessories", price: 4999, mrp: 6499, stock: 24, emoji: "⌚", color: "#ebe2d2", desc: "Genuine leather strap, sapphire-coated glass and a minimal dial. Water resistant to 30m.", active: true },
    { id: "P1002", name: "Signature Perfume 100ml", cat: "Beauty", price: 2799, mrp: 3299, stock: 40, emoji: "🧴", color: "#efe4e0", desc: "Warm notes of oud, amber and vanilla. Long-lasting eau de parfum.", active: true },
    { id: "P1003", name: "Wireless Earbuds Pro", cat: "Electronics", price: 3499, mrp: 4999, stock: 15, emoji: "🎧", color: "#e3e6ea", desc: "Active noise cancellation, 30-hour battery and a premium matte case.", active: true },
    { id: "P1004", name: "Handwoven Cotton Kurta", cat: "Fashion", price: 1899, mrp: 2499, stock: 32, emoji: "👕", color: "#e6ebe2", desc: "Breathable handloom cotton with a relaxed fit. Made by local artisans.", active: true },
    { id: "P1005", name: "Ceramic Coffee Mug Set", cat: "Home", price: 1299, mrp: 1599, stock: 50, emoji: "☕", color: "#efe8dc", desc: "Set of 2 hand-glazed stoneware mugs, 350ml each. Microwave safe.", active: true },
    { id: "P1006", name: "Leather Sling Bag", cat: "Accessories", price: 3299, mrp: 4299, stock: 8, emoji: "👜", color: "#eadfd4", desc: "Full-grain leather, adjustable strap and a padded tablet pocket.", active: true },
    { id: "P1007", name: "Aroma Soy Candle", cat: "Home", price: 899, mrp: 1099, stock: 3, emoji: "🕯️", color: "#f1eadb", desc: "Hand-poured soy wax with sandalwood fragrance. 40-hour burn time.", active: true },
    { id: "P1008", name: "Smart Fitness Band", cat: "Electronics", price: 2499, mrp: 3499, stock: 0, emoji: "⌚", color: "#e2e7e4", desc: "Heart rate, SpO2, sleep tracking and 14-day battery life.", active: true },
  ];

  const DEFAULT_SETTINGS = {
    storeName: "eKart",
    supportPhone: "+91 98765 43210",
    supportEmail: "support@ekart.shop",
    freeShippingAbove: 999,
    shippingFee: 79,
    codEnabled: true,
    cashfree: { mode: "sandbox", appId: "", secretKey: "", webhookUrl: "https://your-domain.com/api/payments/cashfree/webhook" },
    delivery: { partner: "Delivery Partner", apiKey: "", pickupName: "eKart Warehouse", pickupAddress: "", pickupPincode: "" },
  };

  // Order lifecycle used by both portals.
  const STATUSES = ["Placed", "Packed", "Shipped", "Out for delivery", "Delivered"];

  const read = (k, d) => { try { const v = localStorage.getItem(PREFIX + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} };

  const uid = (p) => p + Date.now().toString().slice(-6) + Math.floor(Math.random() * 90 + 10);
  const daysAgo = (n, h = 10) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 15, 0, 0); return d.toISOString(); };

  function seedOrders() {
    const p = SEED_PRODUCTS;
    const mk = (id, day, cust, items, method, status, awb) => {
      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const shipping = subtotal >= DEFAULT_SETTINGS.freeShippingAbove ? 0 : DEFAULT_SETTINGS.shippingFee;
      const idx = STATUSES.indexOf(status);
      const history = status === "Cancelled"
        ? [{ status: "Placed", at: daysAgo(day) }, { status: "Cancelled", at: daysAgo(day - 1) }]
        : STATUSES.slice(0, idx + 1).map((s, i) => ({ status: s, at: daysAgo(Math.max(day - i, 0), 10 + i) }));
      return {
        id, date: daysAgo(day), customer: cust, items, subtotal, shipping, total: subtotal + shipping,
        payment: method === "COD"
          ? { method: "COD", status: status === "Delivered" ? "PAID" : "PENDING", gateway: "Cash on Delivery", ref: "-" }
          : { method, status: status === "Cancelled" ? "REFUNDED" : "PAID", gateway: "Cashfree", ref: "cf_" + id.slice(2) + "8842" },
        status, history,
        shipment: awb ? { partner: DEFAULT_SETTINGS.delivery.partner, awb, createdAt: history[2] ? history[2].at : daysAgo(day) } : null,
      };
    };
    const it = (prod, qty) => ({ id: prod.id, name: prod.name, price: prod.price, qty, emoji: prod.emoji, color: prod.color });
    const c = (name, phone, city, pincode) => ({ name, phone, email: name.split(" ")[0].toLowerCase() + "@mail.com", address: "12, Main Street", city, pincode });
    return [
      mk("EK240581", 0, c("Priya Sharma", "9876500011", "Chennai", "600040"), [it(p[1], 1), it(p[6], 2)], "UPI", "Placed"),
      mk("EK240577", 1, c("Arjun Mehta", "9876500022", "Bengaluru", "560001"), [it(p[2], 1)], "Card", "Packed"),
      mk("EK240569", 2, c("Kavya Reddy", "9876500033", "Hyderabad", "500032"), [it(p[0], 1)], "UPI", "Shipped", "DP7781204561"),
      mk("EK240552", 4, c("Rahul Verma", "9876500044", "Mumbai", "400001"), [it(p[3], 2), it(p[4], 1)], "COD", "Out for delivery", "DP7781204490"),
      mk("EK240538", 6, c("Sneha Iyer", "9876500055", "Coimbatore", "641001"), [it(p[5], 1)], "NetBanking", "Delivered", "DP7781204311"),
      mk("EK240521", 8, c("Vikram Singh", "9876500066", "Delhi", "110001"), [it(p[7], 1)], "UPI", "Cancelled"),
    ];
  }

  if (!read("products")) write("products", SEED_PRODUCTS);
  if (!read("orders")) write("orders", seedOrders());
  if (!read("settings")) write("settings", DEFAULT_SETTINGS);

  return {
    STATUSES,
    products: () => read("products", SEED_PRODUCTS),
    saveProducts: (v) => write("products", v),
    orders: () => read("orders", []),
    saveOrders: (v) => write("orders", v),
    cart: () => read("cart", []),
    saveCart: (v) => write("cart", v),
    settings: () => read("settings", DEFAULT_SETTINGS),
    saveSettings: (v) => write("settings", v),
    uid,
    money: (n) => "₹" + Number(n || 0).toLocaleString("en-IN"),
    date: (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    dateTime: (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
    esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    statusBadge(s) {
      const map = { Placed: "b-info", Packed: "b-warn", Shipped: "b-info", "Out for delivery": "b-warn", Delivered: "b-ok", Cancelled: "b-bad" };
      return `<span class="badge ${map[s] || "b-neutral"}">${s}</span>`;
    },
    payBadge(s) {
      const map = { PAID: "b-ok", PENDING: "b-warn", FAILED: "b-bad", REFUNDED: "b-neutral" };
      return `<span class="badge ${map[s] || "b-neutral"}">${s}</span>`;
    },
    toast(msg) {
      let t = document.getElementById("toast");
      if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
      t.textContent = msg; t.classList.add("show");
      clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400);
    },
    resetDemo() {
      ["products", "orders", "settings", "cart"].forEach((k) => { try { localStorage.removeItem(PREFIX + k); } catch (e) {} });
      location.reload();
    },
  };
})();
