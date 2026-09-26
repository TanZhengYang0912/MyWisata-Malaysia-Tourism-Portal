"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { CalendarClock, Check, ChevronDown, ImageOff, Search, ShoppingCart, Tag, Trash2, X } from "lucide-react";
import { cartItemKey, useCart } from "@/components/providers/cart";
import { getBookingSlots, getOutlets, getVoucherByCode, getVouchers } from "@/backend/domains/catalogue";
import { unitPrice } from "@/backend/core/helpers";
import { EmptyState } from "@/components/shared/empty-state";
import { ReferencePrice } from "@/components/shared/reference-price";
import { Button } from "@/components/ui/button";
import type { Activity, BookingSlot, Outlet, Voucher } from "@/backend/core/types";
import { formatDate, formatMYRNumber } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

type VoucherOption = {
  voucher: Voucher;
  discountAmount: number;
  scopeLabel?: string;
};

type CustomerTranslator = ReturnType<typeof useTranslation>["t"];

function voucherDiscountLabel(voucher: Voucher, t: CustomerTranslator) {
  if (voucher.type === "percent") return t("ui.cart.discountPercent", { value: voucher.value, ns: "customer" });
  if (voucher.type === "fixed") return t("ui.cart.discountFixed", { value: formatMYRNumber(voucher.value), ns: "customer" });
  return t("ui.cart.buyOneGetOne", { ns: "customer" });
}

function resolveVoucherScopeLabel(voucher: Voucher, outlets: Map<string, Outlet>, activities: Activity[], t: CustomerTranslator) {
  const outletName = voucher.outletId ? outlets.get(voucher.outletId)?.name : undefined;
  const partnerName = voucher.vendorId
    ? [...outlets.values()].find((outlet) => outlet.vendorId === voucher.vendorId)?.vendorName
    : undefined;
  const productName = voucher.productId ? activities.find((activity) => activity.id === voucher.productId)?.name : undefined;

  if (productName && outletName) return t("ui.cart.scopeProductOutlet", { product: productName, outlet: outletName, ns: "customer" });
  if (productName && partnerName) return t("ui.cart.scopeProductPartner", { product: productName, partner: partnerName, ns: "customer" });
  if (productName) return t("ui.cart.scopeProduct", { product: productName, ns: "customer" });
  if (outletName) return t("ui.cart.scopeOutlet", { outlet: outletName, ns: "customer" });
  if (partnerName) return t("ui.cart.scopePartner", { partner: partnerName, ns: "customer" });
  return t("ui.cart.scopeEligible", { ns: "customer" });
}

function VoucherOptionCard({ option, applied, hasAppliedVoucher = false, onApply, hideAction = false }: { option: VoucherOption; applied: boolean; hasAppliedVoucher?: boolean; onApply: () => void; hideAction?: boolean }) {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { voucher, discountAmount } = option;
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3">
      <div className="min-w-0">
        <p className="break-words whitespace-normal text-sm font-semibold text-foreground">{voucher.name ?? voucher.code}</p>
        {option.scopeLabel && <p className="mt-0.5 break-words whitespace-normal text-xs font-medium text-muted-foreground">{option.scopeLabel}</p>}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {voucherDiscountLabel(voucher, tCustomer)}
          {voucher.minSpend > 0 ? ` · ${tCustomer("ui.cart.minimumSpend", { value: formatMYRNumber(voucher.minSpend) })}` : ""}
        </p>
        <p className="mt-1 text-xs font-semibold text-primary">
          {tCustomer("ui.cart.saveEnds", { amount: formatMYRNumber(discountAmount), date: formatDate(voucher.expiresAt, locale, { day: "numeric", month: "short" }) })}
        </p>
      </div>
      {!hideAction && (
        <Button type="button" variant="outline" onClick={onApply} disabled={applied || hasAppliedVoucher} title={hasAppliedVoucher ? tCustomer("ui.cart.removeCurrentBeforeSwitch") : undefined} className="shrink-0 rounded-full px-3 text-xs">
          {applied ? tCustomer("ui.actions.applied") : tCustomer("ui.actions.apply")}
        </Button>
      )}
    </div>
  );
}

export default function CartPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { items, activities = [], selectedKeys, selectedItems, toggleSelected, setAllSelected, setGroupSelected, updateQty, removeItem, totals } = useCart();
  const { showFeedback } = useActionFeedback();
  const [code, setCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<Voucher | null>(null);
  const [appliedClaimId, setAppliedClaimId] = useState<string | null>(null);
  const [deepLinkedVoucher, setDeepLinkedVoucher] = useState<{ code: string; claimId: string | null } | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
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
    getOutlets().then((list) => setOutlets(new Map(list.map((o) => [o.id, o]))));
    getVouchers().then(setVouchers).catch(() => setVouchers([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const voucher = params.get("voucher")?.trim();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (voucher) setDeepLinkedVoucher({ code: voucher, claimId: params.get("claim") });
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
        && (!slot || !slot.status || slot.status === "available")
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

  // Group rows by outlet for a Shopee-style cart. Each row keeps its ORIGINAL
  // index in `items` — updateQty/removeItem address items by that index, so
  // re-numbering per group would edit the wrong line.
  const outletGroups = useMemo(() => {
    const groups = new Map<string, { outletId: string; rows: { item: (typeof items)[number]; index: number }[] }>();
    items.forEach((item, index) => {
      const activity = activities.find((candidate) => candidate.id === item.activityId);
      if (!activity) return;
      // Prefer the outlet stored on the line — a product may be sold at several
      // outlets, so the product's own outlet is only a fallback for old rows.
      const outletId = item.outletId ?? activity.outletId;
      const group = groups.get(outletId) ?? { outletId, rows: [] };
      group.rows.push({ item, index });
      groups.set(outletId, group);
    });
    const selectableSet = new Set(selectableKeys);
    return [...groups.values()].map((group) => {
      const groupSelectableKeys = group.rows.map(({ item }) => cartItemKey(item)).filter((key) => selectableSet.has(key));
      const selectedCount = groupSelectableKeys.filter((key) => selectedKeys.has(key)).length;
      const groupSubtotal = group.rows.reduce((sum, { item }) => {
        if (!selectedKeys.has(cartItemKey(item))) return sum;
        const activity = activities.find((candidate) => candidate.id === item.activityId);
        if (!activity) return sum;
        const price = item.priceOverride ?? unitPrice(activity, item.variantId, item.qty, new Date(), items.map((cartItem) => cartItem.activityId));
        return sum + price * item.qty;
      }, 0);
      return {
        ...group,
        outlet: outlets.get(group.outletId),
        groupSelectableKeys,
        groupSubtotal,
        allSelected: groupSelectableKeys.length > 0 && selectedCount === groupSelectableKeys.length,
        partiallySelected: selectedCount > 0 && selectedCount < groupSelectableKeys.length,
      };
    });
  }, [items, activities, outlets, selectableKeys, selectedKeys]);

  const voucherValidationItems = useMemo(
    () => items
      .filter((item) => selectedKeys.has(cartItemKey(item)))
      .map((item) => {
        const activity = activities.find((candidate) => candidate.id === item.activityId);
        return {
          productId: item.activityId,
          outletId: item.outletId ?? activity?.outletId,
          quantity: item.qty,
          unitPrice: item.priceOverride ?? (activity ? unitPrice(activity, item.variantId, item.qty, new Date(), items.map((cartItem) => cartItem.activityId)) : 0),
        };
      }),
    [activities, items, selectedKeys],
  );

  const selectedVendorIds = useMemo(() => new Set(
    voucherValidationItems
      .map((item) => item.outletId ? outlets.get(item.outletId)?.vendorId : undefined)
      .filter((vendorId): vendorId is string => Boolean(vendorId)),
  ), [outlets, voucherValidationItems]);

  const candidateVouchers = useMemo(() => {
    const selectedProductIds = new Set(voucherValidationItems.map((item) => item.productId));
    const selectedOutletIds = new Set(voucherValidationItems.map((item) => item.outletId).filter((outletId): outletId is string => Boolean(outletId)));
    return vouchers.filter((voucher) =>
      (!voucher.vendorId || selectedVendorIds.has(voucher.vendorId))
      && (!voucher.outletId || selectedOutletIds.has(voucher.outletId))
      && (!voucher.productId || selectedProductIds.has(voucher.productId))
      && subtotal >= voucher.minSpend,
    );
  }, [selectedVendorIds, subtotal, voucherValidationItems, vouchers]);

  useEffect(() => {
    let active = true;
    if (candidateVouchers.length === 0 || voucherValidationItems.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVoucherOptions([]);
      setLoadingVouchers(false);
      return () => { active = false; };
    }

    setLoadingVouchers(true);
    Promise.all(candidateVouchers.map(async (voucher) => {
      const response = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voucher.code, vendorId: selectedVendorIds.size === 1 ? [...selectedVendorIds][0] : undefined, cartSubtotal: subtotal, items: voucherValidationItems, intent: "view" }),
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
  }, [candidateVouchers, selectedVendorIds, subtotal, voucherValidationItems]);

  const appliedVoucherOption = useMemo(() => appliedVoucher ? {
    voucher: appliedVoucher,
    discountAmount: discount,
    scopeLabel: resolveVoucherScopeLabel(appliedVoucher, outlets, activities, tCustomer),
  } : null, [activities, appliedVoucher, discount, outlets, tCustomer]);

  const availableVoucherOptions = useMemo(() => voucherOptions
    .filter((option) => appliedVoucher?.id !== option.voucher.id)
    .map((option) => ({
      ...option,
      scopeLabel: resolveVoucherScopeLabel(option.voucher, outlets, activities, tCustomer),
    })), [activities, appliedVoucher?.id, outlets, tCustomer, voucherOptions]);

  const allVoucherOptions = useMemo(() => {
    const needle = voucherSearch.trim().toLowerCase();
    return availableVoucherOptions.filter(({ voucher }) => {
      const matchesType = voucherTypeFilter === "all" || voucher.type === voucherTypeFilter;
      const searchable = `${voucher.name ?? ""} ${voucher.code}`.toLowerCase();
      return matchesType && (!needle || searchable.includes(needle));
    });
  }, [availableVoucherOptions, voucherSearch, voucherTypeFilter]);

  const topVoucherOptions = availableVoucherOptions.slice(0, 3);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function applyVoucherCode(rawCode: string, knownVoucher?: Voucher, claimId?: string | null) {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) return;
    if (appliedVoucher) return;
    setCode(normalizedCode);
    setVoucherError(null);
    const selectedVendorId = selectedVendorIds.size === 1 ? [...selectedVendorIds][0] : undefined;
    const response = await fetch("/api/vouchers/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: normalizedCode,
        vendorId: selectedVendorId,
        cartSubtotal: subtotal,
        items: voucherValidationItems,
        intent: "apply",
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.data?.valid) {
      setVoucherError(payload.data?.reason || "Voucher validation failed.");
      setAppliedVoucher(null);
      setAppliedClaimId(null);
      return;
    }
    const v = knownVoucher ?? await getVoucherByCode(normalizedCode);
    setVoucherError(null);
    setAppliedVoucher(v ?? null);
    setAppliedClaimId(claimId ?? null);
    setShowManualVoucher(false);
    setShowAllVouchers(false);
    showFeedback("success", `Voucher ${normalizedCode} applied.`);
  }

  useEffect(() => {
    if (!deepLinkedVoucher || appliedVoucher || voucherValidationItems.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeepLinkedVoucher(null);
    void applyVoucherCode(deepLinkedVoucher.code, undefined, deepLinkedVoucher.claimId);
  }, [appliedVoucher, applyVoucherCode, deepLinkedVoucher, voucherValidationItems.length]);

  useEffect(() => {
    const selectableSet = new Set(selectableKeys);
    selectedKeys.forEach((key) => {
      if (!selectableSet.has(key)) toggleSelected(key);
    });
  }, [selectableKeys, selectedKeys, toggleSelected]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart size={40} />}
        title={tCustomer("ui.cart.guestTitle")}
        description={tCustomer("ui.cart.emptyDescription")}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/customer">
              <Button>{tCustomer("ui.cart.explore")}</Button>
            </Link>
            <Link href="/customer" className="text-sm font-semibold text-primary hover:underline">{tCustomer("ui.cart.continueShopping")}</Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">{tCustomer("ui.cart.title")}</h1>
          <Link href="/customer" className="mt-1 inline-flex text-sm font-semibold text-primary hover:underline">{tCustomer("ui.cart.continueShopping")}</Link>
        </div>
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
          {tCustomer("ui.cart.selectAll", { count: selectableKeys.length })}
        </label>
        <span className="text-xs text-muted-foreground">{tCustomer("ui.cart.selected", { count: selectedSelectableCount })}</span>
      </div>

      <div className="space-y-4 mb-6">
        {outletGroups.map((group) => (
          <section key={group.outletId} className="overflow-hidden rounded-xl border border-border">
            <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  ref={(el) => { if (el) el.indeterminate = group.partiallySelected; }}
                  checked={group.allSelected}
                  disabled={group.groupSelectableKeys.length === 0}
                  onChange={(event) => setGroupSelected(group.groupSelectableKeys, event.target.checked)}
                  aria-label={`Select all items from ${group.outlet?.name ?? "this outlet"}`}
                  className="h-4 w-4 shrink-0 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="break-words whitespace-normal text-sm font-semibold text-foreground">{group.outlet?.name ?? "Outlet"}</span>
              </label>
              <Link
                href={`/customer/outlet/${group.outletId}`}
                className="shrink-0 text-xs font-semibold text-primary hover:underline"
              >
                {tCustomer("ui.cart.viewOutlet")}
              </Link>
            </header>
            <div className="space-y-3 p-3">
        {group.rows.map(({ item, index }) => {
          const activity = activities.find((a) => a.id === item.activityId);
          if (!activity) return null;
          const key = cartItemKey(item);
          const checked = selectedKeys.has(key);
          const outlet = outlets.get(item.outletId ?? activity.outletId);
          const variant = activity.variants.find((v) => v.id === item.variantId);
          const slot = item.slotId ? slotsById.get(item.slotId) : undefined;
          const price = item.priceOverride ?? unitPrice(activity, item.variantId, item.qty, new Date(), items.map((cartItem) => cartItem.activityId));
          const lineTotal = price * item.qty;
          const stockLimit = !activity.requiresBooking ? activity.availableStock : undefined;
          const seatsLeft = slot ? slot.capacity - slot.booked : undefined;
          const slotLoaded = !item.slotId || Boolean(slot);
          const available = slotLoaded
            && (!slot || !slot.status || slot.status === "available")
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
              {activity.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activity.image} alt={activity.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <ImageOff size={20} strokeWidth={1.5} aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="break-words whitespace-normal text-sm font-semibold text-foreground">{activity.name}</p>
                <p className="break-words whitespace-normal text-xs text-muted-foreground">{outlet?.name} · {variant?.label}</p>
                {slot && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <CalendarClock size={11} />
                    {new Date(slot.startsAt).toLocaleString("en-MY", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {slot.status && slot.status !== "available"
                      ? ` · ${slot.status === "expired" ? "Slot expired" : "Unavailable"}`
                      : seatsLeft !== undefined && ` · ${seatsLeft} seats left`}
                  </p>
                )}
                <p className="text-sm font-bold text-primary font-[family-name:var(--font-mono)] mt-1"><ReferencePrice amountMYR={price} /> × {item.qty}</p>
                {stockLimit !== undefined && (
                  <p className={`mt-1 text-[11px] font-semibold ${stockLimit === 0 || item.qty > stockLimit ? "text-red-600" : stockLimit <= (activity.lowStockThreshold ?? 5) ? "text-amber-700" : "text-emerald-700"}`}>
                    {stockLimit === 0 ? "Out of stock" : `${stockLimit} in stock${stockLimit <= (activity.lowStockThreshold ?? 5) ? " · Low stock" : ""}`}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <ReferencePrice amountMYR={lineTotal} className="text-sm font-bold text-foreground font-[family-name:var(--font-mono)]" />
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(index, item.qty - 1)} className="w-7 h-7 rounded-lg border border-border text-foreground">−</button>
                  <span className="w-6 text-center text-sm font-semibold text-foreground">{item.qty}</span>
                  <button
                    onClick={() => updateQty(index, item.qty + 1)}
                    disabled={(stockLimit !== undefined && item.qty >= stockLimit) || (seatsLeft !== undefined && item.qty >= seatsLeft)}
                    className="w-7 h-7 rounded-lg border border-border text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <button onClick={() => removeItem(index)} className="text-destructive" title={tCustomer("ui.cart.remove")}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <span className="text-xs text-muted-foreground">{tCustomer("ui.cart.outletSubtotal")}</span>
              <ReferencePrice amountMYR={group.groupSubtotal} className="text-sm font-bold text-foreground font-[family-name:var(--font-mono)]" />
            </footer>
          </section>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">{tCustomer("ui.cart.availableVouchers")}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {selectedItems.length === 0 ? tCustomer("ui.cart.selectItemsOffers") : tCustomer("ui.cart.availableCount", { count: availableVoucherOptions.length })}
          </span>
        </div>

        {appliedVoucher && !voucherError && appliedVoucherOption && (
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 font-semibold text-primary"><Check size={14} className="shrink-0" /> <span className="break-words">{tCustomer("ui.cart.applied", { code: appliedVoucher.code })}</span></span>
              <button type="button" onClick={() => { setAppliedVoucher(null); setAppliedClaimId(null); }} className="shrink-0 font-semibold text-muted-foreground hover:text-foreground">{tCustomer("ui.cart.remove")}</button>
            </div>
            <div className="mt-2">
              <VoucherOptionCard option={appliedVoucherOption} applied onApply={() => {}} hideAction />
            </div>
          </div>
        )}
        {appliedVoucher && <p className="mt-3 text-xs text-muted-foreground">{tCustomer("ui.cart.removeCurrentBeforeSwitch")}</p>}

        {selectedItems.length > 0 && (
          <div className="mt-3">
            {loadingVouchers ? (
              <p className="rounded-lg bg-secondary px-3 py-3 text-xs text-muted-foreground">{tCustomer("ui.cart.checkEligible")}</p>
            ) : availableVoucherOptions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {topVoucherOptions.map((option) => (
                  <VoucherOptionCard
                    key={option.voucher.id}
                    option={option}
                    applied={false}
                    hasAppliedVoucher={Boolean(appliedVoucher)}
                    onApply={() => void applyVoucherCode(option.voucher.code, option.voucher)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-secondary px-3 py-3 text-xs text-muted-foreground">{tCustomer(appliedVoucher ? "ui.cart.noOtherEligible" : "ui.cart.noEligible")}</p>
            )}
            {availableVoucherOptions.length > 3 && (
              <button type="button" onClick={() => setShowAllVouchers(true)} className="mt-3 inline-flex items-center text-xs font-semibold text-primary hover:underline">
                {tCustomer("ui.cart.viewAll", { count: availableVoucherOptions.length })}
              </button>
            )}
          </div>
        )}

        <button type="button" onClick={() => setShowManualVoucher((visible) => !visible)} className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          {tCustomer("ui.cart.haveCode")} <ChevronDown size={14} className={`transition-transform ${showManualVoucher ? "rotate-180" : ""}`} />
        </button>
        {showManualVoucher && (
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="voucher-code">{tCustomer("ui.cart.voucherCode")}</label>
            <input id="voucher-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder={tCustomer("strictMigration.cart.voucherCodePlaceholder")} className="min-w-0 flex-1 rounded-lg border border-border bg-input-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
            <Button type="button" variant="outline" onClick={() => void applyVoucherCode(code)} disabled={!code.trim() || Boolean(appliedVoucher)}>{tCustomer("ui.actions.apply")}</Button>
          </div>
        )}
        {voucherError && <p className="mt-2 text-xs text-destructive">{voucherError}</p>}
      </div>

      {showAllVouchers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="all-vouchers-title">
          <div className="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{tCustomer("ui.cart.availableVouchers")}</p>
                <h2 id="all-vouchers-title" className="mt-1 text-lg font-bold text-foreground">{tCustomer("ui.cart.viewAll", { count: availableVoucherOptions.length })}</h2>
              </div>
              <button type="button" onClick={() => setShowAllVouchers(false)} className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={tCustomer("ui.cart.closeVouchers")}>
                <X size={18} />
              </button>
            </div>
            {appliedVoucher && <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">{tCustomer("ui.cart.removeCurrentBeforeSwitch")}</p>}
            <div className="grid gap-2 border-b border-border px-5 py-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <label className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <span className="sr-only">{tCustomer("ui.voucherHub.searchLabel")}</span>
                <input value={voucherSearch} onChange={(event) => setVoucherSearch(event.target.value)} placeholder={tCustomer("ui.cart.searchVouchers")} className="h-10 w-full rounded-lg border border-border bg-input-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary" />
              </label>
              <select value={voucherTypeFilter} onChange={(event) => setVoucherTypeFilter(event.target.value as "all" | Voucher["type"])} className="h-10 rounded-lg border border-border bg-input-background px-3 text-sm text-foreground outline-none focus:border-primary" aria-label={tCustomer("ui.cart.filterVoucherType")}>
                <option value="all">{tCustomer("ui.cart.allTypes")}</option>
                <option value="percent">{tCustomer("ui.cart.percentageOff")}</option>
                <option value="fixed">{tCustomer("ui.cart.fixedAmount")}</option>
                <option value="bogo">{tCustomer("ui.cart.buyOneGetOne")}</option>
              </select>
            </div>
            <div className="min-h-0 space-y-2 overflow-y-auto px-5 py-4">
              {allVoucherOptions.length === 0 ? (
                <p className="rounded-lg bg-secondary px-3 py-6 text-center text-sm text-muted-foreground">{tCustomer("ui.cart.noMatch")}</p>
              ) : (
                allVoucherOptions.map((option) => (
                  <VoucherOptionCard
                    key={option.voucher.id}
                    option={option}
                    applied={false}
                    hasAppliedVoucher={Boolean(appliedVoucher)}
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
          <span className="text-muted-foreground">{tCustomer("ui.cart.subtotalSelected", { count: selectedKeys.size })}</span>
          <ReferencePrice amountMYR={subtotal} className="font-semibold text-foreground font-[family-name:var(--font-mono)]" />
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{tCustomer("ui.cart.discount")}</span>
            <span className="font-semibold text-primary font-[family-name:var(--font-mono)]">−<ReferencePrice amountMYR={discount} /></span>
          </div>
        )}
        <div className="flex justify-between text-base pt-2 border-t border-border">
          <span className="font-bold text-foreground">{tCustomer("ui.cart.total")}</span>
          <ReferencePrice amountMYR={total} showSettlementMYR className="font-bold text-primary font-[family-name:var(--font-mono)]" />
        </div>
      </div>

      {selectedKeys.size > 0 ? (
        <a
          href={appliedVoucher ? `/customer/checkout?voucher=${encodeURIComponent(appliedVoucher.code)}${appliedClaimId ? `&claim=${encodeURIComponent(appliedClaimId)}` : ""}` : "/customer/checkout"}
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90"
        >
          {tCustomer("strictMigration.cart.proceedSelected", { count: selectedKeys.size })}
        </a>
      ) : (
        <Button type="button" className="h-12 w-full rounded-full text-base" disabled>
          {tCustomer("ui.actions.proceedCheckout")}
        </Button>
      )}
    </div>
  );
}
