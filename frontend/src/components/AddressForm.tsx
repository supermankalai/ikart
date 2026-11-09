import { useState, type FormEvent } from "react";
import { INDIAN_STATES } from "../lib/format";
import type { AddressInput } from "../lib/types";

const EMPTY: AddressInput = { name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", is_default: false };

export default function AddressForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save address",
}: {
  initial?: Partial<AddressInput>;
  onSubmit(data: AddressInput): Promise<void>;
  onCancel?(): void;
  submitLabel?: string;
}) {
  const [f, setF] = useState<AddressInput>({ ...EMPTY, ...initial, line2: initial?.line2 ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await onSubmit({ ...f, line2: f.line2?.trim() || null });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {err && <div className="form-error">{err}</div>}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="a-name">Full name</label>
          <input id="a-name" className="input" required value={f.name} onChange={set("name")} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="a-phone">Mobile number</label>
          <input id="a-phone" className="input" required pattern="[6-9][0-9]{9}" title="10-digit Indian mobile number"
            inputMode="numeric" maxLength={10} value={f.phone} onChange={set("phone")} autoComplete="tel-national" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="a-l1">House no., building, street</label>
        <input id="a-l1" className="input" required value={f.line1} onChange={set("line1")} autoComplete="address-line1" />
      </div>
      <div className="field">
        <label htmlFor="a-l2">Area, landmark (optional)</label>
        <input id="a-l2" className="input" value={f.line2 ?? ""} onChange={set("line2")} autoComplete="address-line2" />
      </div>
      <div className="grid-3">
        <div className="field">
          <label htmlFor="a-pin">Pincode</label>
          <input id="a-pin" className="input" required pattern="[0-9]{6}" title="6-digit pincode" inputMode="numeric"
            maxLength={6} value={f.pincode} onChange={set("pincode")} autoComplete="postal-code" />
        </div>
        <div className="field">
          <label htmlFor="a-city">City</label>
          <input id="a-city" className="input" required value={f.city} onChange={set("city")} autoComplete="address-level2" />
        </div>
        <div className="field">
          <label htmlFor="a-state">State</label>
          <select id="a-state" className="input" required value={f.state} onChange={set("state")}>
            <option value="">Select</option>
            {INDIAN_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <label className="check mb-16">
        <input type="checkbox" checked={f.is_default} onChange={set("is_default")} /> Make this my default address
      </label>
      <div className="row">
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
