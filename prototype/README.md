# eKart prototype

A clickable prototype of the eKart store and admin portal. There is no backend: all data lives in the browser (localStorage), so an order placed in the store shows up in admin right away.

## Open it
- **Customer store:** open `index.html` in a browser
- **Admin portal:** open `admin.html` (demo login `admin@ekart.shop` / `admin123`)

## Files
| File | Purpose |
|---|---|
| `index.html` | Store: catalogue, search, product details, cart, checkout, Cashfree payment (simulated), order tracking |
| `admin.html` | Admin: dashboard, orders, products, customers, payments, shipments, settings |
| `assets/data.js` | Shared mock data. The real build replaces this with backend API calls |
| `assets/style.css` | Shared premium theme |

## Try the full flow
1. In the store, add products to the cart → Checkout → enter an address → Pay online → Pay.
2. In admin → Orders, open the new order → **Mark as packed** → **Create shipment** (an AWB number is generated) → Out for delivery → Delivered.
3. Back in the store → Track Order → enter the same mobile number to see the timeline update.

## What's simulated and how the real build will do it
**Cashfree payments**
1. Store → backend `POST /api/payments/create-order`
2. Backend → Cashfree `POST /pg/orders` (App ID + Secret key, server-side only) → returns `payment_session_id`
3. Store opens the Cashfree JS SDK: `cashfree.checkout({ paymentSessionId })`
4. Cashfree webhook → backend verifies the signature and marks the order PAID. Refunds also go through the Cashfree refund API.

**Delivery partner**
1. Admin clicks "Create shipment" → backend calls the partner's create-shipment API (pickup, drop address, weight, COD amount)
2. The partner returns an AWB number and label → saved on the order
3. Partner webhook → backend updates the status (Shipped → Out for delivery → Delivered)

## Suggested production stack
Next.js (store + admin) · Node/Express or Next.js API routes · PostgreSQL or MongoDB · Cloudinary or S3 for product photos · Cashfree PG · your delivery partner's API
