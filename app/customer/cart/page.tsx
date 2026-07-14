"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ShoppingCart, Tag, Trash2 } from "lucide-react";
import { cartItemKey, useCart } from "@/components/providers/cart";
import { getActivities, getBookingSlots, getOutlets, getVoucherByCode } from "@/backend/domains/catalogue";
import { unitPrice } from "@/backend/core/helpers";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { Activity, BookingSlot, Outlet, Voucher } from "@/backend/core/types";

export default function CartPage() {
  const { items, selectedKeys, selectedItems, toggleSelected, setAllSelected, updateQty, removeItem, totals } = useCart();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [outlets, setOutlets] = useState<Map<string, Outlet>>(new Map());
  const [slotsById, setSlotsById] = useState<Map<string, BookingSlot>>(new Map());

  useEffect(() => {
    getActivities().then(setActivities);
    getOutlets().then((list) => setOutlets(new Map(list.map((o) => [o.id, o]))));
  }, []);

  const bookingActivityIds = useMemo(
    () => [...new Set(items.filter((item) => item.slotId).map((item) => item.activityId))],
    [items],
  );
  const bookingActivityKey = bookingActivityIds.join(",");

  useEffect(() => {
    if (bookingActivityIds.length === 0) return;
    Promise.all(bookingActivityIds.map((id) => getBookingSlots(id))).then((lists) => {
      setSlotsById(new Map(lists.flat().map((slot) => [slot.id, slot])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingActivityKey]);

  const { subtotal, discount, total } = totals(appliedVoucher ?? undefined);
  const allSelected = items.length > 0 && selectedKeys.size === items.length;

  async function applyVoucher() {
    const response = await fetch("/api/vouchers/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        cartSubtotal: subtotal,
        items: selectedItems.map((item) => {
          const activity = activities.find((candidate) => candidate.id === item.activityId);
          return { productId: item.activityId, quantity: item.qty, unitPrice: activity ? unitPrice(activity, item.variantId, item.qty, new Date(), selectedItems.map((cartItem) => cartItem.activityId)) : 0 };
        }),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.data?.valid) {
      setVoucherError(payload.data?.reason || "Voucher validation failed.");
      setAppliedVoucher(null);
      return;
    }
    const v = await getVoucherByCode(code);
    setVoucherError(null);
    setAppliedVoucher(v ?? null);
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart size={40} />}
        title="Your cart is empty"
        description="Browse experiences and add a booking or product to get started."
        action={
          <Link href="/customer/explore">
            <Button>Explore Experiences</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Your Cart</h1>
        <label className="flex items-center gap-2 text-sm font-semibold text-foreground cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={(e) => setAllSelected(e.target.checked)} className="w-4 h-4 accent-primary" />
          Select all ({items.length})
        </label>
      </div>

      <div className="space-y-3 mb-6">
        {items.map((item, i) => {
          const activity = activities.find((a) => a.id === item.activityId);
          if (!activity) return null;
          const key = cartItemKey(item);
          const checked = selectedKeys.has(key);
          const outlet = outlets.get(activity.outletId);
          const variant = activity.variants.find((v) => v.id === item.variantId);
          const slot = item.slotId ? slotsById.get(item.slotId) : undefined;
          const price = item.priceOverride ?? unitPrice(activity, item.variantId, item.qty, new Date(), items.map((cartItem) => cartItem.activityId));
          const lineTotal = price * item.qty;
          const stockLimit = !activity.requiresBooking ? activity.availableStock : undefined;
          const seatsLeft = slot ? slot.capacity - slot.booked : undefined;
          return (
            <div
              key={key}
              className="flex items-start gap-3 p-4 rounded-xl border transition-colors"
              style={{ borderColor: checked ? "var(--primary)" : "var(--border)", backgroundColor: checked ? "color-mix(in srgb, var(--primary) 5%, transparent)" : "var(--card)" }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggleSelected(key)} className="w-4 h-4 mt-1 accent-primary shrink-0" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activity.image} alt={activity.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{activity.name}</p>
                <p className="text-xs text-muted-foreground">{outlet?.name} · {variant?.label}</p>
                {slot && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <CalendarClock size={11} />
                    {new Date(slot.startsAt).toLocaleString("en-MY", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {seatsLeft !== undefined && ` · ${seatsLeft} seats left`}
                  </p>
                )}
                <p className="text-sm font-bold text-primary font-[family-name:var(--font-mono)] mt-1">RM {price.toFixed(2)} × {item.qty}</p>
                {stockLimit !== undefined && (
                  <p className={`mt-1 text-[11px] font-semibold ${stockLimit === 0 || item.qty > stockLimit ? "text-red-600" : stockLimit <= (activity.lowStockThreshold ?? 5) ? "text-amber-700" : "text-emerald-700"}`}>
                    {stockLimit === 0 ? "Out of stock" : `${stockLimit} in stock${stockLimit <= (activity.lowStockThreshold ?? 5) ? " · Low stock" : ""}`}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <p className="text-sm font-bold text-foreground font-[family-name:var(--font-mono)]">RM {lineTotal.toFixed(2)}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(i, item.qty - 1)} className="w-7 h-7 rounded-lg border border-border text-foreground">−</button>
                  <span className="w-6 text-center text-sm font-semibold text-foreground">{item.qty}</span>
                  <button
                    onClick={() => updateQty(i, item.qty + 1)}
                    disabled={(stockLimit !== undefined && item.qty >= stockLimit) || (seatsLeft !== undefined && item.qty >= seatsLeft)}
                    className="w-7 h-7 rounded-lg border border-border text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <button onClick={() => removeItem(i)} className="text-destructive" title="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Tag size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Voucher code</span>
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. WELCOME10"
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-input-background outline-none text-foreground"
          />
          <Button variant="outline" onClick={applyVoucher} disabled={!code}>Apply</Button>
        </div>
        {voucherError && <p className="text-xs text-destructive mt-2">{voucherError}</p>}
        {appliedVoucher && !voucherError && <p className="text-xs text-primary mt-2">Voucher {appliedVoucher.code} applied!</p>}
      </div>

      <div className="rounded-xl border border-border p-4 mb-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal ({selectedKeys.size} selected)</span>
          <span className="font-semibold text-foreground font-[family-name:var(--font-mono)]">RM {subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-semibold text-primary font-[family-name:var(--font-mono)]">− RM {discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-base pt-2 border-t border-border">
          <span className="font-bold text-foreground">Total</span>
          <span className="font-bold text-primary font-[family-name:var(--font-mono)]">RM {total.toFixed(2)}</span>
        </div>
      </div>

      <Button
        className="w-full h-12 rounded-full text-base"
        disabled={selectedKeys.size === 0}
        onClick={() => router.push(appliedVoucher ? `/customer/checkout?voucher=${appliedVoucher.code}` : "/customer/checkout")}
      >
        Proceed to Checkout {selectedKeys.size > 0 && `(${selectedKeys.size})`}
      </Button>
    </div>
  );
}
