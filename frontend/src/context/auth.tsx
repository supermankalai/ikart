import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";
import type { User } from "../lib/types";

interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
}
interface AuthState {
  user: User | null;
  ready: boolean;
  login(email: string, password: string): Promise<User>;
  register(data: RegisterData): Promise<User>;
  logout(): void;
  setUser(u: User): void;
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api<User>("/api/auth/me")
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("ikart:logout", onLogout);
    return () => window.removeEventListener("ikart:logout", onLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ access_token: string; user: User }>("/api/auth/login", { body: { email, password } });
    tokenStore.set(r.access_token);
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const r = await api<{ access_token: string; user: User }>("/api/auth/register", { body: data });
    tokenStore.set(r.access_token);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout, setUser }}>{children}</AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
