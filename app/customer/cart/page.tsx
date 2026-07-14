"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { CalendarClock, Check, ChevronDown, Search, ShoppingCart, Tag, Trash2, X } from "lucide-react";
import { cartItemKey, useCart } from "@/components/providers/cart";
import { getActivities, getBookingSlots, getOutlets, getVoucherByCode, getVouchers } from "@/backend/domains/catalogue";
import { unitPrice } from "@/backend/core/helpers";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { Activity, BookingSlot, Outlet, Voucher } from "@/backend/core/types";

type VoucherOption = {
  voucher: Voucher;
  discountAmount: number;
};

function voucherDiscountLabel(voucher: Voucher) {
  if (voucher.type === "percent") return `${voucher.value}% off`;
  if (voucher.type === "fixed") return `RM ${voucher.value.toFixed(2)} off`;
  return "Buy one, get one";
}

function VoucherOptionCard({ option, applied, onApply }: { option: VoucherOption; applied: boolean; onApply: () => void }) {
  const { voucher, discountAmount } = option;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{voucher.name ?? voucher.code}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {voucherDiscountLabel(voucher)}
          {voucher.minSpend > 0 ? ` · Min RM ${voucher.minSpend.toFixed(2)}` : ""}
        </p>
        <p className="mt-0.5 text-[11px] text-primary">
          Save RM {discountAmount.toFixed(2)} · Ends {new Date(voucher.expiresAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onApply} disabled={applied} className="shrink-0 rounded-full px-3 text-xs">
        {applied ? "Applied" : "Apply"}
      </Button>
    </div>
  );
}

export default function CartPage() {
  const { items, selectedKeys, selectedItems, toggleSelected, setAllSelected, updateQty, removeItem, totals } = useCart();
  const { showFeedback } = useActionFeedback();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [outlets, setOutlets] = useState<Map<string, Outlet>>(new Map());
  const [slotsById, setSlotsById] = useState<Map<string, BookingSlot>>(new Map());
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherOptions, setVoucherOptions] = useState<VoucherOption[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [showManualVoucher, setShowManualVoucher] = useState(false);
  const [showAllVouchers, setShowAllVouchers] = useState(false);
  const [voucherSearch, setVoucherSearch] = useState("");
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<"all" | Voucher["type"]>("all");

  useEffect(() => {
    getActivities().then(setActivities);
    getOutlets().then((list) => setOutlets(new Map(list.map((o) => [o.id, o]))));
    getVouchers().then(setVouchers).catch(() => setVouchers([]));
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
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectableKeys = useMemo(
    () => items.flatMap((item) => {
      const activity = activities.find((candidate) => candidate.id === item.activityId);
      if (!activity) return [];
      const stockLimit = !activity.requiresBooking ? activity.availableStock : undefined;
      const slot = item.slotId ? slotsById.get(item.slotId) : undefined;
      const seatsLeft = slot ? slot.capacity - slot.booked : undefined;
      const available = (stockLimit === undefined || (stockLimit > 0 && item.qty <= stockLimit))
        && (seatsLeft === undefined || (seatsLeft > 0 && item.qty <= seatsLeft));
      return available ? [cartItemKey(item)] : [];
    }),
    [activities, items, slotsById],
  );
  const selectedSelectableCount = selectableKeys.filter((key) => selectedKeys.has(key)).length;
  const allSelected = selectableKeys.length > 0 && selectedSelectableCount === selectableKeys.length;
  const partiallySelected = selectedSelectableCount > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  const voucherValidationItems = useMemo(
    () => items
      .filter((item) => selectedKeys.has(cartItemKey(item)))
      .map((item) => {
        const activity = activities.find((candidate) => candidate.id === item.activityId);
        return {
          productId: item.activityId,
          quantity: item.qty,
          unitPrice: activity ? unitPrice(activity, item.variantId, item.qty, new Date(), items.map((cartItem) => cartItem.activityId)) : 0,
        };
      }),
    [activities, items, selectedKeys],
  );

  useEffect(() => {
    let active = true;
    if (vouchers.length === 0 || voucherValidationItems.length === 0) {
      setVoucherOptions([]);
      setLoadingVouchers(false);
      return () => { active = false; };
    }

    setLoadingVouchers(true);
    Promise.all(vouchers.map(async (voucher) => {
      const response = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucher.code, cartSubtotal: subtotal, items: voucherValidationItems }),
      });
      const payload = await response.json() as { data?: { valid?: boolean; discountAmount?: number } };
      return payload.data?.valid ? { voucher, discountAmount: Number(payload.data.discountAmount ?? 0) } : null;
    }))
      .then((options) => {
        if (!active) return;
        setVoucherOptions(
          options
            .filter((option): option is VoucherOption => option !== null)
            .sort((a, b) => {
              const savingsDifference = b.discountAmount - a.discountAmount;
              if (savingsDifference !== 0) return savingsDifference;
              return new Date(a.voucher.expiresAt).getTime() - new Date(b.voucher.expiresAt).getTime();
            }),
        );
      })
      .catch(() => {
        if (active) setVoucherOptions([]);
      })
      .finally(() => {
        if (active) setLoadingVouchers(false);
      });

    return () => { active = false; };
  }, [subtotal, voucherValidationItems, vouchers]);

  const allVoucherOptions = useMemo(() => {
    const needle = voucherSearch.trim().toLowerCase();
    return voucherOptions.filter(({ voucher }) => {
      const matchesType = voucherTypeFilter === "all" || voucher.type === voucherTypeFilter;
      const searchable = `${voucher.name ?? ""} ${voucher.code}`.toLowerCase();
      return matchesType && (!needle || searchable.includes(needle));
    });
  }, [voucherOptions, voucherSearch, voucherTypeFilter]);

  const topVoucherOptions = voucherOptions.slice(0, 3);

  useEffect(() => {
    const selectableSet = new Set(selectableKeys);
    selectedKeys.forEach((key) => {
      if (!selectableSet.has(key)) toggleSelected(key);
    });
  }, [selectableKeys, selectedKeys, toggleSelected]);

  async function applyVoucherCode(rawCode: string, knownVoucher?: Voucher) {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) return;
    setCode(normalizedCode);
    setVoucherError(null);
    const response = await fetch("/api/vouchers/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: normalizedCode,
        cartSubtotal: subtotal,
        items: voucherValidationItems,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.data?.valid) {
      setVoucherError(payload.data?.reason || "Voucher validation failed.");
      setAppliedVoucher(null);
      return;
    }
    const v = knownVoucher ?? await getVoucherByCode(normalizedCode);
    setVoucherError(null);
    setAppliedVoucher(v ?? null);
    setShowManualVoucher(false);
    setShowAllVouchers(false);
    showFeedback("success", `Voucher ${normalizedCode} applied.`);
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
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Your Cart</h1>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            disabled={selectableKeys.length === 0}
            onChange={(event) => setAllSelected(event.target.checked, selectableKeys)}
            className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          Select all available ({selectableKeys.length})
        </label>
        <span className="text-xs text-muted-foreground">{selectedSelectableCount} selected</span>
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
          const slotLoaded = !item.slotId || Boolean(slot);
          const available = slotLoaded
            && (stockLimit === undefined || (stockLimit > 0 && item.qty <= stockLimit))
            && (seatsLeft === undefined || (seatsLeft > 0 && item.qty <= seatsLeft));
          return (
            <div
              key={key}
              className="flex items-start gap-3 p-4 rounded-xl border transition-colors"
              style={{ borderColor: checked ? "var(--primary)" : "var(--border)", backgroundColor: checked ? "color-mix(in srgb, var(--primary) 5%, transparent)" : "var(--card)" }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!available}
                onChange={() => toggleSelected(key)}
                aria-label={available ? `Select ${activity.name}` : `${activity.name} is unavailable`}
                className="mt-1 h-4 w-4 shrink-0 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
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

      <div className="mb-6 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">Available vouchers</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {selectedItems.length === 0 ? "Select items to see eligible offers" : `${voucherOptions.length} available`}
          </span>
        </div>

        {appliedVoucher && !voucherError && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-primary/5 px-3 py-2 text-xs">
            <span className="flex items-center gap-2 font-semibold text-primary"><Check size={14} /> {appliedVoucher.code} applied</span>
            <button type="button" onClick={() => setAppliedVoucher(null)} className="font-semibold text-muted-foreground hover:text-foreground">Remove</button>
          </div>
        )}

        {selectedItems.length > 0 && (
          <div className="mt-3">
            {loadingVouchers ? (
              <p className="rounded-lg bg-secondary px-3 py-3 text-xs text-muted-foreground">Checking eligible vouchers…</p>
            ) : voucherOptions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {topVoucherOptions.map((option) => (
                  <VoucherOptionCard
                    key={option.voucher.id}
                    option={option}
                    applied={appliedVoucher?.id === option.voucher.id}
                    onApply={() => void applyVoucherCode(option.voucher.code, option.voucher)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-secondary px-3 py-3 text-xs text-muted-foreground">No vouchers match the selected items right now.</p>
            )}
            {voucherOptions.length > 3 && (
              <button type="button" onClick={() => setShowAllVouchers(true)} className="mt-3 inline-flex items-center text-xs font-semibold text-primary hover:underline">
                View all {voucherOptions.length} vouchers
              </button>
            )}
          </div>
        )}

        <button type="button" onClick={() => setShowManualVoucher((visible) => !visible)} className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Have a voucher code? <ChevronDown size={14} className={`transition-transform ${showManualVoucher ? "rotate-180" : ""}`} />
        </button>
        {showManualVoucher && (
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="voucher-code">Voucher code</label>
            <input id="voucher-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="e.g. WELCOME10" className="min-w-0 flex-1 rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
            <Button type="button" variant="outline" onClick={() => void applyVoucherCode(code)} disabled={!code.trim()}>Apply</Button>
          </div>
        )}
        {voucherError && <p className="mt-2 text-xs text-destructive">{voucherError}</p>}
      </div>

      {showAllVouchers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="all-vouchers-title">
          <div className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Eligible for your cart</p>
                <h2 id="all-vouchers-title" className="mt-1 text-lg font-bold text-foreground">All available vouchers</h2>
              </div>
              <button type="button" onClick={() => setShowAllVouchers(false)} className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close vouchers">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-2 border-b border-border px-5 py-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <label className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <span className="sr-only">Search vouchers</span>
                <input value={voucherSearch} onChange={(event) => setVoucherSearch(event.target.value)} placeholder="Search voucher name or code" className="h-10 w-full rounded-lg border border-border bg-input-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary" />
              </label>
              <select value={voucherTypeFilter} onChange={(event) => setVoucherTypeFilter(event.target.value as "all" | Voucher["type"])} className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm text-foreground outline-none focus:border-primary" aria-label="Filter voucher type">
                <option value="all">All types</option>
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount</option>
                <option value="bogo">Buy one, get one</option>
              </select>
            </div>
            <div className="min-h-0 space-y-2 overflow-y-auto px-5 py-4">
              {allVoucherOptions.length === 0 ? (
                <p className="rounded-lg bg-secondary px-3 py-6 text-center text-sm text-muted-foreground">No vouchers match your search.</p>
              ) : (
                allVoucherOptions.map((option) => (
                  <VoucherOptionCard
                    key={option.voucher.id}
                    option={option}
                    applied={appliedVoucher?.id === option.voucher.id}
                    onApply={() => void applyVoucherCode(option.voucher.code, option.voucher)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

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
