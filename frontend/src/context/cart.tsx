import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CartItem } from "../lib/types";

const KEY = "ekart_cart";

interface CartState {
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen(v: boolean): void;
  add(item: CartItem): void;
  setQty(variantId: number, qty: number): void;
  remove(variantId: number): void;
  clear(): void;
}

const CartCtx = createContext<CartState>(null as unknown as CartState);

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* storage unavailable */
    }
  }, [items]);

  // Keep multiple tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => {
      const ex = prev.find((i) => i.variant_id === item.variant_id);
      if (ex) {
        return prev.map((i) =>
          i.variant_id === item.variant_id ? { ...i, quantity: Math.min(20, i.quantity + item.quantity) } : i,
        );
      }
      return [...prev, item];
    });
  }, []);

  const setQty = useCallback((variantId: number, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.variant_id !== variantId)
        : prev.map((i) => (i.variant_id === variantId ? { ...i, quantity: Math.min(20, qty) } : i)),
    );
  }, []);

  const remove = useCallback((variantId: number) => setItems((p) => p.filter((i) => i.variant_id !== variantId)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      count: items.reduce((s, i) => s + i.quantity, 0),
      subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
      open,
      setOpen,
      add,
      setQty,
      remove,
      clear,
    }),
    [items, open, add, setQty, remove, clear],
  );
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);
