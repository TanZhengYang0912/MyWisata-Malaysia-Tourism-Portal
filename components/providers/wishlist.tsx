"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/providers/auth";

type WishlistContextValue = {
  savedIds: ReadonlySet<string>;
  loading: boolean;
  hydrated: boolean;
  toggleSaved: (productId: string) => Promise<boolean>;
  /** Saved hotels (whole outlets), separate from saved products. */
  savedOutletIds: ReadonlySet<string>;
  toggleSavedOutlet: (outletId: string) => Promise<boolean>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { currentUser, loading: authLoading } = useAuth();
  const currentUserId = currentUser?.id;
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [savedOutletIds, setSavedOutletIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return () => { cancelled = true; };
    if (!currentUserId) {
      // Reset private client state as the auth identity transitions to guest.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSavedIds(new Set());
      setSavedOutletIds(new Set());
      setLoading(false);
      setHydrated(true);
      return () => { cancelled = true; };
    }

    // Reset the previous identity's data before hydrating the active customer.
    setSavedIds(new Set());
    setSavedOutletIds(new Set());
    setLoading(true);
    setHydrated(false);
    const hydrateProducts = fetch("/api/wishlist")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { data?: { productIds?: string[] } };
        if (!cancelled) {
          setSavedIds(new Set(body.data?.productIds ?? []));
          setHydrated(true);
        }
      })
      .catch(() => {
        // Wishlist is an enhancement; browsing must remain available if it fails.
      });
    const hydrateOutlets = fetch("/api/saved-outlets")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { data?: { outletIds?: string[] } };
        if (!cancelled) setSavedOutletIds(new Set(body.data?.outletIds ?? []));
      })
      .catch(() => {
        // Saved hotels are an enhancement, like saved products.
      });
    Promise.all([hydrateProducts, hydrateOutlets]).finally(() => {
      if (!cancelled) {
        setHydrated(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUserId]);

  const toggleSaved = useCallback(async (productId: string) => {
    const wasSaved = savedIds.has(productId);
    const nextSaved = !wasSaved;
    setSavedIds((current) => {
      const next = new Set(current);
      if (nextSaved) next.add(productId);
      else next.delete(productId);
      return next;
    });

    try {
      const response = await fetch("/api/wishlist", {
        method: nextSaved ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!response.ok) throw new Error("Wishlist update failed");
      return nextSaved;
    } catch {
      setSavedIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(productId);
        else next.delete(productId);
        return next;
      });
      return wasSaved;
    }
  }, [savedIds]);

  const toggleSavedOutlet = useCallback(async (outletId: string) => {
    const wasSaved = savedOutletIds.has(outletId);
    const nextSaved = !wasSaved;
    const apply = (saved: boolean) => setSavedOutletIds((current) => {
      const next = new Set(current);
      if (saved) next.add(outletId);
      else next.delete(outletId);
      return next;
    });
    apply(nextSaved);

    try {
      const response = await fetch("/api/saved-outlets", {
        method: nextSaved ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outletId }),
      });
      if (!response.ok) throw new Error("Saved hotel update failed");
      return nextSaved;
    } catch {
      apply(wasSaved);
      return wasSaved;
    }
  }, [savedOutletIds]);

  const value = useMemo(
    () => ({ savedIds, loading, hydrated, toggleSaved, savedOutletIds, toggleSavedOutlet }),
    [savedIds, loading, hydrated, toggleSaved, savedOutletIds, toggleSavedOutlet],
  );
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within WishlistProvider");
  return context;
}

/** Null outside WishlistProvider, e.g. the vendor shop preview, which reuses customer product cards. */
export function useOptionalWishlist() {
  return useContext(WishlistContext);
}
