"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/providers/auth";
import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

type WishlistContextValue = {
  savedIds: ReadonlySet<string>;
  loading: boolean;
  hydrated: boolean;
  denied: boolean;
  revision: number;
  toggleSaved: (productId: string) => Promise<boolean>;
  /** Saved hotels (whole outlets), separate from saved products. */
  savedOutletIds: ReadonlySet<string>;
  outletHydrated: boolean;
  outletDenied: boolean;
  toggleSavedOutlet: (outletId: string) => Promise<boolean>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);
type Owner = ReturnType<typeof useAuth>["currentUser"];
type WishlistResource = { endpoint: "/api/wishlist" | "/api/saved-outlets"; responseKey: "productIds" | "outletIds"; inputKey: "productId" | "outletId" };

/** Both wishlist resources use identical ownership and optimistic-write rules. */
function useWishlistResource(resource: WishlistResource, user: Owner, authLoading: boolean) {
  const { endpoint, responseKey, inputKey } = resource;
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [denied, setDenied] = useState(false);
  const [revision, setRevision] = useState(0);
  const ids = useRef<ReadonlySet<string>>(new Set());
  const alive = useRef(true);
  const access = useRef({ denied: false, generation: 0 });
  const operations = useRef({ epoch: 0, pending: new Map<string, Promise<boolean>>(), dirty: false });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async (signal: AbortSignal) => {
    const state = operations.current;
    if (state.pending.size) { state.dirty = true; return; }
    const epoch = state.epoch;
    const response = await fetch(endpoint, { cache: "no-store", signal });
    if (!alive.current || signal.aborted) return;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        access.current.denied = true; access.current.generation += 1; state.epoch += 1;
        ids.current = new Set(); setSavedIds(ids.current); setDenied(true);
      }
      throw Object.assign(new Error("Saved items unavailable"), { status: response.status });
    }
    const body = await response.json() as { data?: Partial<Record<"productIds" | "outletIds", string[]>> };
    if (!alive.current || signal.aborted) return;
    if (state.epoch !== epoch || state.pending.size) { state.dirty = true; return; }
    ids.current = new Set(body.data?.[responseKey] ?? []);
    setSavedIds(ids.current); setHydrated(true); setDenied(false); access.current.denied = false; setRevision(value => value + 1);
  }, [endpoint, responseKey]);
  const { refresh, hasRefreshError } = useVisibleReviewRefresh({
    enabled: !authLoading && Boolean(user), onRefresh: load, intervalMs: null,
    identityKey: user?.id, refreshKey: user, initialRefresh: true, coalesceMs: 250,
  });

  const toggleSaved = useCallback((itemId: string): Promise<boolean> => {
    if (!alive.current || !user || authLoading || denied || access.current.denied) return Promise.resolve(false);
    const state = operations.current;
    const pending = state.pending.get(itemId);
    if (pending) return pending;
    const accessGeneration = access.current.generation;
    const wasSaved = ids.current.has(itemId);
    const nextSaved = !wasSaved;
    const apply = (saved: boolean) => {
      const next = new Set(ids.current);
      if (saved) next.add(itemId); else next.delete(itemId);
      ids.current = next; setSavedIds(next);
    };
    state.epoch += 1;
    apply(nextSaved);
    const mutation = (async () => {
      try {
        const response = await fetch(endpoint, {
          method: nextSaved ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [inputKey]: itemId }),
        });
        if (!alive.current || access.current.generation !== accessGeneration) return false;
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            access.current.denied = true; access.current.generation += 1; state.epoch += 1;
            ids.current = new Set(); setSavedIds(ids.current); setDenied(true);
            return false;
          }
          throw new Error("Saved item update failed");
        }
        return nextSaved;
      } catch {
        if (alive.current && access.current.generation === accessGeneration) apply(wasSaved);
        return wasSaved;
      } finally {
        if (alive.current) {
          state.pending.delete(itemId);
          // A failed response may follow a committed write; always reconcile.
          state.dirty = true;
          if (!state.pending.size && state.dirty && !access.current.denied) { state.dirty = false; refresh(); }
        }
      }
    })();
    state.pending.set(itemId, mutation);
    return mutation;
  }, [authLoading, denied, endpoint, inputKey, refresh, user]);

  return {
    savedIds, toggleSaved, hydrated: !user || hydrated, denied, revision,
    loading: authLoading || Boolean(user && !hydrated && !denied && !hasRefreshError),
  };
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  // Replacing an identity replaces all private state, including in-flight writes.
  return <WishlistOwnerProvider key={currentUser?.id ?? "guest"} user={currentUser} authLoading={loading}>{children}</WishlistOwnerProvider>;
}

function WishlistOwnerProvider({ children, user, authLoading }: { children: ReactNode; user: Owner; authLoading: boolean }) {
  const products = useWishlistResource({ endpoint: "/api/wishlist", responseKey: "productIds", inputKey: "productId" }, user, authLoading);
  const outlets = useWishlistResource({ endpoint: "/api/saved-outlets", responseKey: "outletIds", inputKey: "outletId" }, user, authLoading);
  const value = useMemo(() => ({
    savedIds: products.savedIds, loading: products.loading || outlets.loading, hydrated: products.hydrated,
    denied: products.denied, revision: products.revision + outlets.revision,
    toggleSaved: products.toggleSaved, savedOutletIds: outlets.savedIds, outletHydrated: outlets.hydrated,
    outletDenied: outlets.denied, toggleSavedOutlet: outlets.toggleSaved,
  }), [products, outlets]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within WishlistProvider");
  return context;
}
