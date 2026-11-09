import { Link } from "react-router-dom";
import { useStore } from "../../context/store";
import { money } from "../../lib/format";

/*
 * Policy pages. Cashfree (and most payment gateways) require Terms, Privacy, Refund, Shipping and
 * Contact pages to be live on your website before they activate your account.
 * Review and edit this text with your real business details before going live.
 */

type PageKey = "about" | "contact" | "shipping" | "refund" | "terms" | "privacy";

export default function InfoPage({ page }: { page: PageKey }) {
  const { settings: s } = useStore();
  const name = s.store_name;

  const pages: Record<PageKey, { title: string; body: JSX.Element }> = {
    about: {
      title: `About ${name}`,
      body: (
        <>
          <p>{name} is a homegrown apparel store offering premium T-shirts and track pants designed for everyday comfort.</p>
          <p>Every product is quality checked and packed by our own team before it ships to you.</p>
          <p><Link to="/shop" className="link">Explore the collection →</Link></p>
        </>
      ),
    },
    contact: {
      title: "Contact us",
      body: (
        <>
          <p>We're happy to help with orders, sizing, returns, refunds or anything else.</p>
          <h2>Customer support</h2>
          <p>
            Phone / WhatsApp: <b>{s.support_phone}</b><br />
            Email: <b>{s.support_email}</b><br />
            Hours: Monday to Saturday, 10 AM to 7 PM (IST)
          </p>
          <p>We reply to all emails within 24 hours on working days. For order queries, please include your order number.</p>
          {(s.business_name || s.business_address) && (
            <>
              <h2>Business address</h2>
              <p>
                {s.business_name && <><b>{s.business_name}</b><br /></>}
                {s.business_address.split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}
              </p>
            </>
          )}
        </>
      ),
    },
    shipping: {
      title: "Shipping policy",
      body: (
        <>
          <h2>Dispatch</h2>
          <p>Orders are packed and handed to our delivery partner within 1–2 business days.</p>
          <h2>Delivery time</h2>
          <p>Most orders arrive within 3–7 business days depending on your location.</p>
          <h2>Shipping charges</h2>
          <p>Free shipping on orders above {money(s.free_shipping_above)}. A flat fee of {money(s.shipping_fee)} applies to smaller orders.</p>
          <h2>Tracking</h2>
          <p>Once shipped, your tracking number appears in <Link to="/account/orders" className="link">My orders</Link>.</p>
        </>
      ),
    },
    refund: {
      title: "Refund & cancellation policy",
      body: (
        <>
          <h2>Cancellations</h2>
          <p>You can cancel an order from <Link to="/account/orders" className="link">My orders</Link> any time before it is packed for dispatch. Once an order has been dispatched it cannot be cancelled, but you can return it after delivery as described below.</p>
          <p>We may cancel an order if the item is out of stock, the delivery address is not serviceable, or there is a pricing error. In that case you will receive a full refund.</p>
          <h2>Returns</h2>
          <p>You can request a return within {s.return_days} days of delivery. Items must be unused, unwashed, and returned with original tags and packaging. Innerwear and items bought on clearance sale are not returnable for hygiene reasons.</p>
          <p>Custom printed T-shirts are made to order with your design, so they can't be returned or exchanged unless they arrive damaged, defective or misprinted. A custom order can be cancelled for a full refund until our team starts reviewing the design.</p>
          <p>If you receive a damaged, defective or wrong item, contact us within 48 hours of delivery with photos of the product and packaging. We will arrange a free pickup and a replacement or full refund.</p>
          <h2>Refunds</h2>
          <ul>
            <li>Cancelled prepaid orders: full refund to the original payment method, initiated within 2 business days of cancellation.</li>
            <li>Returned items: refund initiated within 2 business days after the returned item passes our quality check.</li>
            <li>Refunds reach your account within 5–7 business days after initiation, depending on your bank.</li>
            <li>Cash-on-delivery orders are refunded by bank transfer or UPI to the account you share with us.</li>
            <li>Shipping charges are non-refundable, except when the item was damaged, defective or wrong.</li>
          </ul>
          <h2>How to request a cancellation, return or refund</h2>
          <p>Email <b>{s.support_email}</b> or call <b>{s.support_phone}</b> with your order number. We will confirm the next steps within 24 hours.</p>
        </>
      ),
    },
    terms: {
      title: "Terms & conditions",
      body: (
        <>
          <p>
            This website ({window.location.host}) is operated by <b>{s.business_name || name}</b>
            {s.business_address && <>, {s.business_address.replace(/\n/g, ", ")}</>}. By using this website or placing an order, you agree to these terms.
          </p>
          <h2>Use of the website</h2>
          <p>You must be at least 18 years old, or use the website under the supervision of a parent or guardian. You agree to provide accurate information and to keep your account password confidential. You are responsible for all activity on your account.</p>
          <h2>Products & descriptions</h2>
          <p>We try to show product colours, sizes and details as accurately as possible. Actual colours may vary slightly depending on your screen. Please check the size chart before ordering.</p>
          <h2>Orders & pricing</h2>
          <p>All prices are in Indian Rupees (₹) and include applicable taxes. Shipping charges, if any, are shown at checkout. An order is confirmed only after successful payment (or acceptance of a cash-on-delivery order). We may cancel orders affected by pricing errors or stock unavailability, with a full refund.</p>
          <h2>Payments</h2>
          <p>Online payments are processed securely by Cashfree Payments using UPI, cards, net banking and wallets. We do not store your card or bank details.</p>
          <h2>Shipping, cancellations & refunds</h2>
          <p>Delivery is governed by our <Link to="/shipping-policy" className="link">Shipping policy</Link>. Cancellations, returns and refunds are governed by our <Link to="/refund-policy" className="link">Refund & cancellation policy</Link>.</p>
          <h2>Intellectual property</h2>
          <p>All content on this website, including logos, images and text, belongs to {name} and may not be copied or reused without written permission.</p>
          <h2>Limitation of liability</h2>
          <p>Our total liability for any claim relating to an order is limited to the amount paid for that order. We are not liable for indirect losses or delays caused by events beyond our control.</p>
          <h2>Governing law</h2>
          <p>These terms are governed by the laws of India. Any disputes are subject to the exclusive jurisdiction of the courts in {s.jurisdiction_city || "our registered city"}.</p>
          <h2>Changes & contact</h2>
          <p>We may update these terms from time to time; the version on this page applies to your order. Questions can be sent to <b>{s.support_email}</b> or <Link to="/contact" className="link">our contact page</Link>.</p>
        </>
      ),
    },
    privacy: {
      title: "Privacy policy",
      body: (
        <>
          <p>We collect only the information needed to process your orders: your name, contact details and delivery address.</p>
          <h2>How we use your data</h2>
          <p>To fulfil and deliver orders, provide support, and share order updates. We share delivery details only with our delivery partner and payment details only with our payment gateway.</p>
          <h2>Security</h2>
          <p>Passwords are stored encrypted, and payments are handled by a PCI-DSS compliant gateway.</p>
          <h2>Your choices</h2>
          <p>You can update your details from your account or ask us to delete your account by emailing {s.support_email}.</p>
        </>
      ),
    },
  };

  const p = pages[page];
  return (
    <div className="container">
      <div className="page-head"><h1>{p.title}</h1></div>
      <div className="prose">{p.body}</div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container status-hero">
      <div className="eyebrow">404</div>
      <h1 className="mt-8">Page not found</h1>
      <p className="muted">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/" className="btn mt-24">Back to home</Link>
    </div>
  );
}
