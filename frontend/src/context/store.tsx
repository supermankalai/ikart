import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { Category, StoreSettings } from "../lib/types";
import { useAuth } from "./auth";

const DEFAULTS: StoreSettings = {
  store_name: "iKart",
  tagline: "Premium everyday wear",
  announcement: "",
  support_phone: "",
  support_email: "",
  instagram_url: "",
  free_shipping_above: 999,
  shipping_fee: 79,
  cod_enabled: true,
  cod_max_order: 5000,
  shipping_partner_name: "",
  tracking_url_template: "",
  return_days: 7,
  hero_rail_photos: true,
  parcel_weight_per_item_kg: 0.3,
  parcel_min_weight_kg: 0.5,
  parcel_length_cm: 30,
  parcel_breadth_cm: 25,
  parcel_height_cm: 4,
};

interface StoreState {
  settings: StoreSettings;
  categories: Category[];
  reloadCatalog(): void;
  wishlist: Set<number>;
  toggleWishlist(productId: number): Promise<boolean>;
}

const StoreCtx = createContext<StoreState>(null as unknown as StoreState);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULTS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wishlist, setWishlist] = useState<Set<number>>(new Set());

  const reloadCatalog = useCallback(() => {
    api<StoreSettings>("/api/settings/public").then(setSettings).catch(() => {});
    api<Category[]>("/api/categories").then(setCategories).catch(() => {});
  }, []);

  useEffect(reloadCatalog, [reloadCatalog]);

  useEffect(() => {
    if (!user) {
      setWishlist(new Set());
      return;
    }
    api<number[]>("/api/me/wishlist/ids")
      .then((ids) => setWishlist(new Set(ids)))
      .catch(() => {});
  }, [user]);

  const toggleWishlist = useCallback(
    async (productId: number) => {
      const has = wishlist.has(productId);
      await api(`/api/me/wishlist/${productId}`, { method: has ? "DELETE" : "POST" });
      setWishlist((prev) => {
        const next = new Set(prev);
        if (has) next.delete(productId);
        else next.add(productId);
        return next;
      });
      return !has;
    },
    [wishlist],
  );

  return (
    <StoreCtx.Provider value={{ settings, categories, reloadCatalog, wishlist, toggleWishlist }}>
      {children}
    </StoreCtx.Provider>
  );
}

export const useStore = () => useContext(StoreCtx);
