import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { openCashfreeCheckout } from "../lib/cashfree";
import { money } from "../lib/format";
import type { PaymentSession } from "../lib/types";
import Icon from "./Icon";
import { Modal } from "./ui";

/**
 * Runs a payment for an order.
 *  - "cashfree": opens the real Cashfree checkout popup.
 *  - "mock": Cashfree keys are not configured on the server yet, so a test dialog simulates the result.
 * Resolves when the customer has finished (success or not); the caller then asks the server for the real status.
 */
export function usePayment() {
  const [mock, setMock] = useState<{ number: string; amount?: number; resolve(): void } | null>(null);

  const pay = useCallback(async (s: PaymentSession, orderNumber: string, amount?: number) => {
    if (s.mode === "cashfree") {
      await openCashfreeCheckout(s.payment_session_id, s.env);
      return;
    }
    await new Promise<void>((resolve) => setMock({ number: orderNumber, amount, resolve }));
  }, []);

  const modal = mock ? (
    <TestPaymentModal
      orderNumber={mock.number}
      amount={mock.amount}
      onDone={() => {
        mock.resolve();
        setMock(null);
      }}
    />
  ) : null;

  return { pay, modal };
}

function TestPaymentModal({ orderNumber, amount, onDone }: { orderNumber: string; amount?: number; onDone(): void }) {
  const [busy, setBusy] = useState(false);
  const complete = async (success: boolean) => {
    setBusy(true);
    try {
      await api("/api/payments/mock-complete", { body: { order_number: orderNumber, success } });
    } finally {
      onDone();
    }
  };
  return (
    <Modal title="Test payment" onClose={() => !busy && onDone()}>
      <div className="note-box warn mb-16">
        <b>Test mode:</b> Cashfree keys are not configured on the server yet, so no real money is charged. Add your keys in{" "}
        <code>backend/.env</code> to enable live payments.
      </div>
      <div className="center" style={{ padding: "10px 0 20px" }}>
        <div className="muted small">Order #{orderNumber}</div>
        {amount !== undefined && <div className="serif" style={{ fontSize: 34, fontWeight: 600 }}>{money(amount)}</div>}
      </div>
      <button className="btn block lg" disabled={busy} onClick={() => complete(true)}>
        <Icon name="check" className="icon sm" /> Simulate successful payment
      </button>
      <button className="btn danger block mt-8" disabled={busy} onClick={() => complete(false)}>
        Simulate failed payment
      </button>
    </Modal>
  );
}
