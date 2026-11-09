import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/auth";
import { useToast } from "../../context/toast";

function useNext(isAdmin?: boolean) {
  const [sp] = useSearchParams();
  const next = sp.get("next");
  // Only allow internal redirects
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return isAdmin ? "/admin" : "/account";
}

export function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const next = useNext(user?.is_admin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const u = await login(email, password);
      toast(`Welcome back, ${u.name.split(" ")[0]}`);
      const wanted = sp.get("next");
      nav(wanted && wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : u.is_admin ? "/admin" : "/account", { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted mb-24">Sign in to track orders, save addresses and check out faster.</p>
        {err && <div className="form-error">{err}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn block lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="center small muted mt-24">
          New to iKart? <Link className="link" to={`/register${sp.get("next") ? `?next=${encodeURIComponent(sp.get("next")!)}` : ""}`}>Create an account</Link>
        </p>
      </form>
    </div>
  );
}

export function Register() {
  const { register, user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const next = useNext();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await register(f);
      toast("Account created. Welcome to iKart!", "success");
      nav(next, { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <h1>Create account</h1>
        <p className="muted mb-24">Join iKart for faster checkout and order tracking.</p>
        {err && <div className="form-error">{err}</div>}
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" className="input" required minLength={2} autoComplete="name" value={f.name} onChange={set("name")} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={f.email} onChange={set("email")} />
        </div>
        <div className="field">
          <label htmlFor="phone">Mobile number</label>
          <input id="phone" className="input" required pattern="[6-9][0-9]{9}" title="10-digit Indian mobile number" inputMode="numeric" maxLength={10} autoComplete="tel-national" value={f.phone} onChange={set("phone")} />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" required minLength={6} autoComplete="new-password" value={f.password} onChange={set("password")} />
          <span className="hint">At least 6 characters</span>
        </div>
        <button className="btn block lg" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        <p className="center small muted mt-24">
          Already have an account? <Link className="link" to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
