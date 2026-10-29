"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import * as guestCart from "@/lib/customer/guest-cart";
import * as commerce from "@/backend/domains/commerce";
import { getActivitiesByIds } from "@/backend/domains/catalogue";
import { canMergeCartItemLines, cartItemKey, cartTotals } from "@/backend/core/helpers";
import { useAuth } from "@/components/providers/auth";
import type { Activity, CartItem, StayBookingDetails, Voucher } from "@/backend/core/types";

// Single source of truth lives in backend/core/helpers so the client, the cart
// domain and the checkout route cannot drift apart. Re-exported here because
// most callers already import it from this provider.
export { cartItemKey } from "@/backend/core/helpers";

interface CartContextValue {
  items: CartItem[];
  itemsLoading: boolean;
  itemsLoadError: boolean;
  reloadItems: () => void;
  count: number;
  activities: Activity[];
  activitiesReady: boolean;
  activitiesFailed: boolean;
  reloadActivities: () => void;
  selectedKeys: Set<string>;
  selectedItems: CartItem[];
  toggleSelected: (key: string) => void;
  setAllSelected: (selected: boolean, keys?: string[]) => void;
  setGroupSelected: (keys: string[], selected: boolean) => void;
  setSelectedKeys: (keys: string[]) => void;
  addItem: (item: CartItem) => Promise<string>;
  updateQty: (index: number, qty: number) => Promise<void>;
  removeItem: (index: number) => Promise<void>;
  updateStayDetails: (index: number, details: StayBookingDetails) => Promise<void>;
  clear: () => Promise<void>;
  totals: (voucher?: Voucher, slotPrices?: Map<string, number>) => ReturnType<typeof cartTotals>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [activityData, setActivityData] = useState<{ key: string; activities: Activity[]; failed: boolean }>({ key: "[]", activities: [], failed: false });
  const [activityReloadVersion, setActivityReloadVersion] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsLoadError, setItemsLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [selectedKeys, setSelectedKeysState] = useState<Set<string>>(new Set());
  const { currentUser } = useAuth();
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const ownerKey = currentUser?.id ?? "guest";
  const activeOwner = useRef(ownerKey);
  const loadedOwner = useRef(ownerKey);
  const cartHasLoaded = useRef(false);
  useEffect(() => { activeOwner.current = ownerKey; }, [ownerKey]);
  const activityIdsKey = JSON.stringify([...new Set(items.map((item) => item.activityId))].sort());
  const activities = useMemo(
    () => activityData.key === activityIdsKey ? activityData.activities : [],
    [activityData, activityIdsKey],
  );
  const activitiesReady = activityData.key === activityIdsKey;
  const activitiesFailed = activitiesReady && activityData.failed;

  useEffect(() => {
    let active = true;
    const ownerChanged = loadedOwner.current !== ownerKey;
    loadedOwner.current = ownerKey;
    if (ownerChanged || !cartHasLoaded.current) {
      cartHasLoaded.current = false;
      // A switch of owner must not leave the previous cart visible.
      setMounted(false);
      setItems([]);
      setSelectedKeysState(new Set());
    }
    // This is async loading status for the request initiated by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItemsLoading(true);
    setItemsLoadError(false);
    const userId=ownerKey === "guest" ? null : ownerKey;
    if (userId) {
      commerce.getCart(userId)
        .then((nextItems) => {
          if (!active) return;
          setItems(nextItems);
          try {
            const saved = sessionStorage.getItem(`customer-cart-selection-${userId}`);
            setSelectedKeysState(saved ? new Set((JSON.parse(saved) as string[]).filter((key) => nextItems.some((item) => cartItemKey(item) === key))) : new Set(nextItems.map(cartItemKey)));
          } catch {
            setSelectedKeysState(new Set(nextItems.map(cartItemKey)));
          }
          setMounted(true);
          setItemsLoading(false);
          cartHasLoaded.current = true;
        })
        .catch(() => {
          if (!active) return;
          setItemsLoadError(true);
          setMounted(true);
          setItemsLoading(false);
          cartHasLoaded.current = true;
        });
    }
    else {
      guestCart.getGuestCart().then((nextItems) => {
        if (!active) return;
        setItems(nextItems);
        try {
          const saved = sessionStorage.getItem("customer-cart-selection-guest");
          setSelectedKeysState(saved ? new Set((JSON.parse(saved) as string[]).filter((key) => nextItems.some((item) => cartItemKey(item) === key))) : new Set(nextItems.map(cartItemKey)));
        } catch {
          setSelectedKeysState(new Set(nextItems.map(cartItemKey)));
        }
        setMounted(true);
        setItemsLoading(false);
        cartHasLoaded.current = true;
      }).catch(() => { if (active) { setItemsLoadError(true); setMounted(true); setItemsLoading(false); cartHasLoaded.current = true; } });
    }
    return () => { active = false; };
  }, [ownerKey, reloadVersion]);

  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;
    const leftCheckoutForOrders =
      (previous === "/customer/checkout" || previous.startsWith("/customer/checkout/"))
      && (pathname === "/customer/orders" || pathname.startsWith("/customer/orders/"));
    if (!currentUser || !mounted || !leftCheckoutForOrders) return;

    // Checkout removes purchased lines on the server. Re-read the cart when the
    // paid order opens so the persistent customer header cannot keep showing
    // the pre-payment badge (and partial checkout keeps any unpurchased lines).
    void commerce.getCart(currentUser.id).then(setItems).catch(() => undefined);
  }, [currentUser, mounted, pathname]);

  useEffect(() => {
    const activityIds = JSON.parse(activityIdsKey) as string[];
    if (activityIds.length === 0) return;

    let active = true;
    getActivitiesByIds(activityIds)
      .then((nextActivities) => {
        if (active) setActivityData({ key: activityIdsKey, activities: nextActivities, failed: false });
      })
      .catch(() => {
        if (active) setActivityData({ key: activityIdsKey, activities: [], failed: true });
      });

    return () => { active = false; };
  }, [activityIdsKey, activityReloadVersion]);

  useEffect(() => {
    if (!mounted) return;
    try {
      sessionStorage.setItem(`customer-cart-selection-${currentUser?.id ?? "guest"}`, JSON.stringify([...selectedKeys]));
    } catch {
      // Selection persistence is best-effort; checkout still works in-memory.
    }
  }, [currentUser?.id, mounted, selectedKeys]);

  useEffect(() => {
    const validKeys = new Set(items.map(cartItemKey));
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    setSelectedKeysState(new Set(keys));
    try {
      sessionStorage.setItem(`customer-cart-selection-${currentUser?.id ?? "guest"}`, JSON.stringify(keys));
    } catch {
      // Selection persistence is best-effort; checkout still works in-memory.
    }
  }, [currentUser]);

  const addItem = useCallback(async (item: CartItem) => {
    const result = currentUser
      ? await commerce.addToCart(currentUser.id, item)
      : { items: await guestCart.addGuestCartItem(item) };
    const nextItems = result.items;
    const savedLine = nextItems.find((candidate) => canMergeCartItemLines(candidate, item));
    if (!savedLine?.cartItemId) throw new Error("cart_line_not_saved");
    const key = cartItemKey(savedLine);
    if (activeOwner.current === ownerKey) {
      setItems(nextItems);
      setSelectedKeysState((previous) => new Set([...previous, key]));
    }
    return key;
  }, [currentUser, ownerKey]);

  const updateQty = useCallback(async (index: number, qty: number) => {
    if (!items[index]) return;
    const item = items[index];
    if (!item.cartItemId) throw new Error("cart_line_not_saved");
    const nextItems = currentUser ? await commerce.updateCartQty(currentUser.id, item.cartItemId, qty) : await guestCart.updateGuestCartQty(cartItemKey(item), qty);
    if (activeOwner.current === ownerKey) setItems(nextItems);
  }, [currentUser, items, ownerKey]);

  const removeItem = useCallback(async (index: number) => {
    if (!items[index]) return;
    const item = items[index];
    if (!item.cartItemId) throw new Error("cart_line_not_saved");
    const nextItems = currentUser ? await commerce.removeFromCart(currentUser.id, item.cartItemId) : await guestCart.removeGuestCartItem(cartItemKey(item));
    if (activeOwner.current === ownerKey) setItems(nextItems);
  }, [currentUser, items, ownerKey]);

  const updateStayDetails = useCallback(async (index: number, details: StayBookingDetails) => {
    const item = items[index];
    if (!item?.cartItemId) throw new Error("cart_line_not_saved");
    const nextItems = currentUser
      ? await commerce.updateCartStayDetails(currentUser.id, item.cartItemId, details)
      : await guestCart.updateGuestCartStayDetails(item.cartItemId, details);
    if (activeOwner.current === ownerKey) setItems(nextItems);
  }, [currentUser, items, ownerKey]);

  const clear = useCallback(async () => {
    if (currentUser) await commerce.clearCart(currentUser.id);
    else await guestCart.clearGuestCart();
    if (activeOwner.current === ownerKey) setItems([]);
  }, [currentUser, ownerKey]);

  const reloadItems = useCallback(() => setReloadVersion((version) => version + 1), []);
  const reloadActivities = useCallback(() => setActivityReloadVersion((version) => version + 1), []);

  const selectedItems = items.filter((item) => selectedKeys.has(cartItemKey(item)));

  const totals = useCallback(
    (voucher?: Voucher, slotPrices?: Map<string, number>) => cartTotals(selectedItems.map(item => ({...item, priceOverride:item.priceOverride ?? (item.slotId ? slotPrices?.get(item.slotId) : undefined)})), activities, voucher),
    [selectedItems, activities],
  );

  const count = mounted ? items.length : 0;

  return (
    <CartContext.Provider
      value={{ items, itemsLoading, itemsLoadError, reloadItems, count, activities, activitiesReady, activitiesFailed, reloadActivities, selectedKeys, selectedItems, toggleSelected, setAllSelected, setGroupSelected, setSelectedKeys: replaceSelectedKeys, addItem, updateQty, removeItem, updateStayDetails, clear, totals }}
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
