import { type FormEvent, useState } from "react";
import { useAuth } from "../context/auth";
import { Modal } from "./ui";

/** Log in or create an account without leaving the page (keeps unsaved work like a T-shirt design). */
export default function AuthModal({ onClose, onDone, reason }: { onClose(): void; onDone(): void; reason?: string }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (mode === "login") await login(f.email.trim(), f.password);
      else await register({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), password: f.password });
      onDone();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={mode === "login" ? "Log in to continue" : "Create your account"} onClose={() => !busy && onClose()}>
      {reason && <p className="small muted" style={{ marginTop: 0 }}>{reason}</p>}
      <form onSubmit={submit}>
        {mode === "register" && (
          <>
            <div className="field"><label htmlFor="am-name">Full name</label><input id="am-name" className="input" required minLength={2} value={f.name} onChange={set("name")} autoComplete="name" /></div>
            <div className="field"><label htmlFor="am-phone">Mobile number</label><input id="am-phone" className="input" required inputMode="numeric" pattern="[6-9][0-9]{9}" title="10-digit mobile number" value={f.phone} onChange={set("phone")} autoComplete="tel-national" /></div>
          </>
        )}
        <div className="field"><label htmlFor="am-email">Email</label><input id="am-email" className="input" type="email" required value={f.email} onChange={set("email")} autoComplete="email" /></div>
        <div className="field"><label htmlFor="am-pass">Password</label><input id="am-pass" className="input" type="password" required minLength={6} value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
        {err && <div className="form-error">{err}</div>}
        <button className="btn block lg" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="small center mt-16">
        {mode === "login" ? <>New here? <button className="link" onClick={() => setMode("register")}>Create an account</button></> : <>Already have an account? <button className="link" onClick={() => setMode("login")}>Log in</button></>}
      </p>
    </Modal>
  );
}
