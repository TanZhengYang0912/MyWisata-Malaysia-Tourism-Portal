"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as commerce from "@/backend/domains/commerce";
import { getActivities } from "@/backend/domains/catalogue";
import { cartItemKey, cartTotals } from "@/backend/core/helpers";
import { useAuth } from "@/components/providers/auth";
import { supabase } from "@/backend/supabase";
import type { Activity, CartItem, Voucher } from "@/backend/core/types";

// Single source of truth lives in backend/core/helpers so the client, the cart
// domain and the checkout route cannot drift apart. Re-exported here because
// most callers already import it from this provider.
export { cartItemKey } from "@/backend/core/helpers";

interface CartContextValue {
  items: CartItem[];
  count: number;
  selectedKeys: Set<string>;
  selectedItems: CartItem[];
  toggleSelected: (key: string) => void;
  setAllSelected: (selected: boolean, keys?: string[]) => void;
  setGroupSelected: (keys: string[], selected: boolean) => void;
  setSelectedKeys: (keys: string[]) => void;
  addItem: (item: CartItem) => Promise<void>;
  updateQty: (index: number, qty: number) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  clear: () => Promise<void>;
  totals: (voucher?: Voucher) => ReturnType<typeof cartTotals>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [mounted, setMounted] = useState(false);
  const [selectedKeys, setSelectedKeysState] = useState<Set<string>>(new Set());
  const { currentUser } = useAuth();

  useEffect(() => {
    let active = true;
    setMounted(false);
    getActivities().then((nextActivities) => { if (active) setActivities(nextActivities); });
    if (currentUser) commerce.getCart(currentUser.id).then((nextItems) => {
      if (!active) return;
      setItems(nextItems);
      try {
        const saved = sessionStorage.getItem(`customer-cart-selection-${currentUser.id}`);
        setSelectedKeysState(saved ? new Set(JSON.parse(saved) as string[]) : new Set());
      } catch {
        setSelectedKeysState(new Set());
      }
      setMounted(true);
    });
    else { setItems([]); setMounted(true); }
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !mounted || items.length === 0) return;
    try {
      sessionStorage.setItem(`customer-cart-selection-${currentUser.id}`, JSON.stringify([...selectedKeys]));
    } catch {
      // Selection persistence is best-effort; checkout still works in-memory.
    }
  }, [currentUser, items.length, mounted, selectedKeys]);

  useEffect(() => {
    const validKeys = new Set(items.map(cartItemKey));
    setSelectedKeysState((prev) => {
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeysState((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setAllSelected = useCallback((selected: boolean, keys?: string[]) => {
    setSelectedKeysState(selected ? new Set(keys ?? items.map(cartItemKey)) : new Set());
  }, [items]);

  // Outlet-group selection. Unlike setAllSelected (which replaces the whole
  // selection), this merges or subtracts only the given keys, so ticking one
  // outlet never clears another outlet's selection.
  const setGroupSelected = useCallback((keys: string[], selected: boolean) => {
    setSelectedKeysState((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (selected) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, []);

  const replaceSelectedKeys = useCallback((keys: string[]) => {
    setSelectedKeysState((current) => {
      const available = new Set(items.map(cartItemKey));
      return new Set(keys.filter((key) => available.has(key)));
    });
  }, [items]);

  useEffect(() => {
    const channel = supabase
      .channel("customer-inventory-refresh")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        getActivities().then(setActivities).catch(() => undefined);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const addItem = useCallback(async (item: CartItem) => {
    if (!currentUser) return;
    setItems(await commerce.addToCart(currentUser.id, item));
  }, [currentUser]);

  const updateQty = useCallback(async (index: number, qty: number) => {
    if (!currentUser) return;
    setItems(await commerce.updateCartQty(currentUser.id, index, qty));
  }, [currentUser]);

  const removeItem = useCallback(async (index: number) => {
    if (!currentUser) return;
    setItems(await commerce.removeFromCart(currentUser.id, index));
  }, [currentUser]);

  const clear = useCallback(async () => {
    if (!currentUser) return;
    await commerce.clearCart(currentUser.id);
    setItems([]);
  }, [currentUser]);

  const selectedItems = items.filter((item) => selectedKeys.has(cartItemKey(item)));

  const totals = useCallback(
    (voucher?: Voucher) => cartTotals(selectedItems, activities, voucher),
    [selectedItems, activities],
  );

  const count = mounted ? items.length : 0;

  return (
    <CartContext.Provider
      value={{ items, count, selectedKeys, selectedItems, toggleSelected, setAllSelected, setGroupSelected, setSelectedKeys: replaceSelectedKeys, addItem, updateQty, removeItem, clear, totals }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
