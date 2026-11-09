/* Cashfree JS SDK v3 loader. Docs: https://www.cashfree.com/docs/payments/online/web/redirect */

interface CheckoutResult {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
}
interface CashfreeInstance {
  checkout(opts: { paymentSessionId: string; redirectTarget?: "_self" | "_blank" | "_modal" }): Promise<CheckoutResult>;
}
declare global {
  interface Window {
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => CashfreeInstance;
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        reject(new Error("Could not load the payment gateway. Check your connection."));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** Opens Cashfree checkout as a popup on top of the page. Resolves when the popup closes. */
export async function openCashfreeCheckout(paymentSessionId: string, env: string): Promise<CheckoutResult> {
  await loadScript();
  const cf = window.Cashfree!({ mode: env === "production" ? "production" : "sandbox" });
  return cf.checkout({ paymentSessionId, redirectTarget: "_modal" });
}
