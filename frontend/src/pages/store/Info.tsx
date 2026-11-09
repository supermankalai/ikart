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
          <p>We're happy to help with orders, sizing, returns or anything else.</p>
          <h2>Customer support</h2>
          <p>Phone / WhatsApp: <b>{s.support_phone}</b><br />Email: <b>{s.support_email}</b><br />Hours: Monday to Saturday, 10 AM to 7 PM</p>
          <p>For order queries, please include your order number so we can help faster.</p>
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
      title: "Returns & refund policy",
      body: (
        <>
          <h2>Returns</h2>
          <p>You can request a return within {s.return_days} days of delivery. Items must be unused, unwashed and have original tags attached.</p>
          <h2>Cancellations</h2>
          <p>Orders can be cancelled from your account until they are packed. After that, please contact support.</p>
          <h2>Refunds</h2>
          <p>Approved refunds for prepaid orders are credited to the original payment method within 5–7 business days. Refunds for cash-on-delivery orders are sent by bank transfer or UPI.</p>
          <p>To start a return, contact us at <b>{s.support_email}</b> with your order number.</p>
        </>
      ),
    },
    terms: {
      title: "Terms & conditions",
      body: (
        <>
          <p>By using this website and placing an order, you agree to these terms.</p>
          <h2>Orders & pricing</h2>
          <p>All prices are in Indian Rupees and include applicable taxes. We may cancel orders affected by pricing errors or stock unavailability, with a full refund.</p>
          <h2>Payments</h2>
          <p>Online payments are processed securely by Cashfree Payments. We do not store your card or bank details.</p>
          <h2>Contact</h2>
          <p>Questions about these terms can be sent to {s.support_email}.</p>
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
