"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as commerce from "@/backend/domains/commerce";
import { getActivities } from "@/backend/domains/catalogue";
import { cartTotals } from "@/backend/core/helpers";
import type { Activity, CartItem, Voucher } from "@/backend/core/types";

interface CartContextValue {
  items: CartItem[];
  count: number;
  addItem: (item: CartItem) => void;
  updateQty: (index: number, qty: number) => void;
  removeItem: (index: number) => void;
  clear: () => void;
  totals: (voucher?: Voucher) => ReturnType<typeof cartTotals>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setItems(commerce.getCart());
    getActivities().then(setActivities);
    setMounted(true);
  }, []);

  const addItem = useCallback((item: CartItem) => {
    setItems(commerce.addToCart(item));
  }, []);

  const updateQty = useCallback((index: number, qty: number) => {
    setItems(commerce.updateCartQty(index, qty));
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems(commerce.removeFromCart(index));
  }, []);

  const clear = useCallback(() => {
    commerce.clearCart();
    setItems([]);
  }, []);

  const totals = useCallback(
    (voucher?: Voucher) => cartTotals(items, activities, voucher),
    [items, activities],
  );

  const count = mounted ? items.reduce((sum, i) => sum + i.qty, 0) : 0;

  return (
    <CartContext.Provider value={{ items, count, addItem, updateQty, removeItem, clear, totals }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
