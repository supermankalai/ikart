# eKart: online store + admin portal

Premium T-shirts and track pants store with a full admin portal.

| Part | Tech |
|---|---|
| Backend API | FastAPI · SQLAlchemy 2 · PostgreSQL · JWT login |
| Frontend | React 18 · TypeScript · Vite (one app: store at `/`, admin at `/admin`) |
| Payments | Cashfree Payment Gateway (built-in test mode until keys are added) |
| Delivery | Pluggable delivery-partner module + status webhook |

```
ekart/
├── backend/          FastAPI app (app/main.py), models, routers, services
├── frontend/         React app (src/pages/store, src/pages/admin)
├── prototype/        The first HTML prototype (for reference)
├── docker-compose.yml  Optional PostgreSQL in Docker
└── start-dev.ps1     Starts backend + frontend together
```

---

## 1. First-time setup

### Database
PostgreSQL 18 is already installed on this PC. Open `backend/.env` and put your **postgres password** in `DATABASE_URL`:

```
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/ekart
```

(Or run `docker compose up -d` and use the Docker URL shown in `docker-compose.yml`.)

### Backend
```powershell
cd backend
python -m venv .venv                  # already done
.\.venv\Scripts\pip install -r requirements.txt   # already done
.\.venv\Scripts\python -m app.seed    # creates the 'ekart' database, tables, admin, categories, sample products
```

### Frontend
```powershell
cd frontend
npm install                           # already done
```

## 2. Run (development)
```powershell
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```
or manually in two terminals:
```powershell
cd backend;  .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
cd frontend; npm run dev
```

| URL | What |
|---|---|
| http://localhost:5173 | Customer store |
| http://localhost:5173/admin | Admin portal (login `admin@ekart.shop` / `admin123`, **change this**) |
| http://localhost:8000/docs | Interactive API documentation |

Sample coupon: `WELCOME10` (10% off orders above ₹999, max ₹200).

---

## 3. Features

**Customer store**
- Home page with hero banner, categories, bestsellers and new arrivals
- Shop with category, size, colour and price filters, sorting, search and pagination
- Product page: photo gallery with zoom, colour and size selection, live stock, related products
- Wishlist, slide-out bag, full cart page, free-shipping progress bar
- Sign up / sign in, saved addresses, profile and password change
- Checkout with address book, coupons, **Cashfree online payment** or **cash on delivery**
- Order tracking with progress bar, timeline, AWB number and tracking link; self-cancel before packing
- Policy pages (Terms, Privacy, Refund, Shipping, Contact), which Cashfree needs to approve your account

**Admin portal**
- Dashboard: sales, today's orders, to-ship count, 14-day chart, top products, low-stock alerts
- **Categories: add, edit, hide, reorder and delete dynamically.** They appear in the store menu automatically.
- Products: photos (upload, reorder, cover), price/MRP, **size × colour variants with stock and SKU**, featured, live/hidden
- Orders: status tabs, search, filters, date range, CSV export
- Order page: mark packed → create shipment (partner + AWB) → out for delivery → delivered, cancel with automatic Cashfree refund, print invoice, WhatsApp customer
- Customers with order count and total spent
- Coupons: percentage or flat, minimum order, maximum discount, usage limit, expiry
- Settings: store info, announcement bar, shipping fee and free-shipping threshold, COD rules, delivery partner and tracking link template

**Built-in safeguards**
- Prices, stock and coupons are always re-checked on the server; the browser is never trusted
- Stock is reserved when an order is placed and released when it's cancelled or payment expires (30 min)
- Payment is confirmed server-side with Cashfree (and via signed webhook) before an order is marked paid

---

## 4. Going live with Cashfree
1. Create a Cashfree merchant account → complete KYC. The policy pages above must be live on your domain.
2. Dashboard → Developers → API Keys → copy **App ID** and **Secret Key** (start with *Test* keys).
3. In `backend/.env`:
   ```
   CASHFREE_ENV=sandbox          # change to production when going live
   CASHFREE_APP_ID=...
   CASHFREE_SECRET_KEY=...
   BACKEND_URL=https://api.yourdomain.com
   FRONTEND_URL=https://yourdomain.com
   ```
4. Cashfree Dashboard → Developers → Webhooks → add `https://api.yourdomain.com/api/payments/webhook` (Payment events).
5. Restart the backend. Admin → Settings will show **Connected**.

Without keys, the site runs in **test mode**: checkout shows a "Simulate payment" dialog so you can test everything.

## 5. Delivery with Shiprocket
Shiprocket gives you many couriers (Delhivery, Xpressbees, Blue Dart, DTDC…) from one account, with COD.

**One-time setup**
1. Sign up at shiprocket.in, complete KYC and add your bank account (for COD money).
2. Settings → Pickup Addresses: add your shop/home address. Note its exact name (e.g. `Primary`).
3. Settings → API → **Create API User** (use a different email from your main login).
4. In `backend/.env`:
   ```
   SHIPROCKET_EMAIL=<API user email>
   SHIPROCKET_PASSWORD=<API user password>
   SHIPROCKET_PICKUP_LOCATION=Primary
   ```
   Restart the backend. Admin → Settings shows **Connected**. Set your usual parcel weight and box size there.
5. Recharge the Shiprocket wallet (each shipment's courier charge is taken from it).
6. When the site is live on HTTPS: Shiprocket → Settings → API → **Webhooks**
   URL `https://yourdomain.com/api/shipping/webhook`, Token = `SHIPPING_WEBHOOK_SECRET` from `.env`.
   Orders then move to *Out for delivery* / *Delivered* (and COD is marked paid) automatically.

**Shipping an order**: Admin → Order → *Create shipment* → *Ship with Shiprocket* → check parcel weight → pick a courier (rates and delivery dates are shown) → **Ship & request pickup**. Then download the **Shipping label**, stick it on the parcel and hand it to the courier. If the wallet is low, the error is shown; recharge and click again (the same Shiprocket order is reused). On localhost, use **Refresh tracking** because webhooks can't reach your PC.

**Manual / other couriers** (India Post, local courier): use the *Enter tracking number* tab. A tracking link template can be set in Settings. Other systems can post updates to the same webhook:
```
POST https://yourdomain.com/api/shipping/webhook
Header: X-Webhook-Secret: <SHIPPING_WEBHOOK_SECRET>
Body:   {"awb": "1234567890", "status": "out_for_delivery"}   # shipped | in_transit | out_for_delivery | delivered
```
Courier problems (RTO, undelivered, lost…) are added to the order timeline without changing the order status.

---

## 6. Production deployment (summary)
1. `cd frontend && npm run build`. FastAPI automatically serves `frontend/dist`, so one server hosts both the store and the API.
2. Run `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2` behind Nginx with HTTPS (Let's Encrypt).
3. Use a strong `JWT_SECRET`, change the admin password, and back up PostgreSQL and the `backend/uploads` folder.
