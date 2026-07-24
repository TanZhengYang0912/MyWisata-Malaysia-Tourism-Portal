"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle, MapPin, MessageCircle, Sparkles, Star, Store } from "lucide-react";
import { getOrCreateThread, sendMessage } from "@/backend/domains/identity";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { unitPrice } from "@/backend/core/helpers";
import { AiTag } from "@/components/customer/ai-tag";
import { EmptyState } from "@/components/shared/empty-state";
import { ShareButton } from "@/components/shared/share-button";
import { Button } from "@/components/ui/button";
import { ActivityReviews } from "@/components/customer/activity-reviews";
import type { BookingSlot, ComputedActivity, ProductReview } from "@/backend/core/types";
import type { OutletChoice } from "@/backend/domains/catalogue";
import { formatBookingSlotTime, getBookingDatePreview, groupBookingSlotsByDate } from "@/lib/customer/booking-slot-presenter";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { getCategoryChips } from "@/lib/customer/category-details";

export function ActivityDetailClient({
  initialActivity,
  initialSlots,
  initialReviews,
  outletChoices = [],
}: {
  initialActivity: ComputedActivity | null;
  initialSlots: BookingSlot[];
  initialReviews: ProductReview[];
  /** Empty for a single-outlet product; otherwise every outlet selling it. */
  outletChoices?: OutletChoice[];
}) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { addItem } = useCart();

  const [activity] = useState<ComputedActivity | null>(initialActivity);
  const [slots] = useState<BookingSlot[]>(initialSlots);
  const [reviews] = useState<ProductReview[]>(initialReviews);
  const [variantId, setVariantId] = useState<string>(initialActivity?.variants[0]?.id ?? "");
  const [slotId, setSlotId] = useState<string>("");
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => groupBookingSlotsByDate(initialSlots)[0]?.key ?? "");
  const calendarInputRef = useRef<HTMLInputElement>(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  // Which outlet the customer is buying from. Price and stock are per-outlet,
  // so this is required before the item can go in the cart.
  const [outletId, setOutletId] = useState<string>(initialActivity?.outletId ?? "");

  // §11.2.7 view signal: beacon dwell time on unmount (best-effort, ignored for guests).
  useEffect(() => {
    if (!activity || !currentUser) return;
    const enteredAt = Date.now();
    const productId = activity.id;
    return () => {
      const dwellMs = Date.now() - enteredAt;
      const body = JSON.stringify({ event: "view", entityType: "product", entityId: productId, dwellMs });
      // sendBeacon survives navigation; Blob keeps the JSON content-type.
      navigator.sendBeacon?.("/api/interactions", new Blob([body], { type: "application/json" }));
    };
  }, [activity, currentUser]);

  const selectedChoice = outletChoices.find((choice) => choice.outletId === outletId);
  // Variant deltas are shared across outlets; only the base price differs.
  const price = useMemo(() => {
    if (!activity) return 0;
    const base = unitPrice(activity, variantId);
    return selectedChoice ? base - activity.price + selectedChoice.price : base;
  }, [activity, variantId, selectedChoice]);
  const slotDateGroups = useMemo(() => groupBookingSlotsByDate(slots), [slots]);
  const activeDateKey = slotDateGroups.some((group) => group.key === selectedDateKey) ? selectedDateKey : slotDateGroups[0]?.key ?? "";
  const activeDateGroup = slotDateGroups.find((group) => group.key === activeDateKey);
  const previewDateGroups = useMemo(() => getBookingDatePreview(slotDateGroups, activeDateKey), [slotDateGroups, activeDateKey]);
  const selectedSlot = slots.find((s) => s.id === slotId);
  const seatsLeft = selectedSlot ? selectedSlot.capacity - selectedSlot.booked : undefined;

  // A slot switch can leave qty above the new slot's remaining seats — clamp down.
  useEffect(() => {
    if (selectedSlot) setQty((q) => Math.min(q, Math.max(1, selectedSlot.capacity - selectedSlot.booked)));
  }, [slotId]);

  if (activity === null) {
    return <EmptyState title="Experience not found" description="This listing may have been removed." />;
  }

  function handleAddToCart() {
    if (adding) return; // double-submit guard
    if (activity!.requiresBooking && !slotId) return;
    // Sold at several outlets → the customer must pick one; price and stock
    // belong to the outlet, not to the shared product.
    if (outletChoices.length > 0 && !outletId) return;
    setAdding(true);
    addItem({ activityId: activity!.id, variantId, slotId: slotId || undefined, outletId: outletId || activity!.outletId, qty });
    setAdded(true);
    setTimeout(() => {
      setAdding(false);
    }, 400);
  }

  async function handleChat() {
    if (!currentUser) return;
    const thread = await getOrCreateThread(currentUser.id, activity!.outletId);
    await sendMessage(thread.id, currentUser.id, "customer", `Re: ${activity!.name}`, undefined, activity!.id);
    router.push(`/customer/chat/${thread.id}`);
  }

  const chips = useMemo(() => getCategoryChips(activity), [activity]);

  return (
    // lg:h-[...] + overflow-hidden bounds the page to the viewport at desktop so
    // only the reviews list scrolls internally; mobile keeps normal page scroll.
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7 lg:h-[calc(100dvh-6rem)]">
      <div className="grid items-start gap-6 lg:h-full lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <div className="min-w-0 lg:flex lg:h-full lg:flex-col lg:overflow-hidden">
      <div className="relative mb-4 h-44 shrink-0 overflow-hidden rounded-2xl sm:h-52 lg:h-64">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activity.image} alt={activity.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.65) 0%, transparent 50%)" }} />
        {activity.isHiddenGem && (
          <div className="absolute top-4 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: "var(--highlight-yellow, #D97706)" }}>
            <Sparkles size={13} /> Hidden Gem
          </div>
        )}
        {activity.outlet.verified && (
          <div className="absolute bottom-4 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white bg-primary">
            <CheckCircle size={13} /> Verified Vendor
          </div>
        )}
      </div>

      <section className="min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap shrink-0">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2 text-foreground font-[family-name:var(--font-display)]">{activity.name}</h1>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary"><Store size={14} /> Provided by {activity.outlet.vendorName ?? "Local vendor"}</p>
              <div className="flex items-center gap-4 flex-wrap text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin size={13} /> {activity.outlet.city}, {activity.outlet.state}
            </div>
            <div className="flex items-center gap-1.5">
              <Star size={13} fill="var(--highlight-yellow)" stroke="none" />
              <span className="font-bold text-foreground">{activity.rating}</span>
              <span className="text-muted-foreground">({activity.reviews} reviews)</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: activity.outlet.open ? "var(--nature-green-ink)" : "#64748b" }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activity.outlet.open ? "var(--nature-green)" : "#94a3b8" }} />
              {activity.outlet.open ? "Open Now" : "Currently Closed"}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="shrink-0">
          {activity.aiTag && <div className="mb-4"><AiTag text={activity.aiTag} /></div>}

          <p className="text-sm leading-relaxed mb-6 text-foreground/80">{activity.description}</p>
        </div>

        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <ActivityReviews productId={activity.id} rating={activity.rating} totalReviews={activity.reviews} initialReviews={reviews} />
        </div>
      </div>

      </section>
      </div>

      <aside className="lg:h-full lg:overflow-y-auto">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_12px_35px_rgba(1,0,102,0.08)]">
          <div className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Ready to book</p>
              <h2 className="mt-1 text-lg font-bold text-foreground">{activity.requiresBooking ? "Select your visit" : "Choose your options"}</h2>
            </div>
            <div className="text-right">
              <p className="font-[family-name:var(--font-mono)] text-2xl font-bold text-primary">RM {price}</p>
              <p className="text-[11px] text-muted-foreground">per person</p>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-4 text-xs">
            <span className="min-w-0 truncate text-muted-foreground">
              <Store size={12} className="mr-1 inline align-[-1px]" />
              {activity.outlet.vendorName ?? "Local vendor"} · {activity.outlet.city}
            </span>
            <Link href={getOutletShopHref(activity.outlet.id)} className="shrink-0 font-semibold text-primary hover:underline">
              Visit shop
            </Link>
          </div>

          {outletChoices.length > 0 && (
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">
                Available at {outletChoices.length} outlet{outletChoices.length > 1 ? "s" : ""} — choose one
              </label>
              <div className="flex flex-col gap-2">
                {outletChoices.map((choice) => {
                  const selected = choice.outletId === outletId;
                  return (
                    <button
                      key={choice.outletId}
                      onClick={() => setOutletId(choice.outletId)}
                      className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: selected ? "var(--primary)" : "var(--border)",
                        backgroundColor: selected ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{choice.outletName}</span>
                        <span className="text-xs text-muted-foreground">
                          {choice.city}
                          {!choice.open && " · Currently closed"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-primary font-[family-name:var(--font-mono)]">
                        RM {choice.price.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activity.variants.length > 1 && (
            <div className="mb-4">
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">Package</label>
              <div className="flex flex-wrap gap-2">
                {activity.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVariantId(v.id)}
                    className="rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: variantId === v.id ? "var(--primary)" : "var(--border)",
                      backgroundColor: variantId === v.id ? "var(--primary)" : "transparent",
                      color: variantId === v.id ? "white" : "var(--foreground)",
                    }}
                  >
                    {v.label} {v.priceDelta !== 0 && `(${v.priceDelta > 0 ? "+" : ""}RM ${v.priceDelta})`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activity.requiresBooking && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-xs font-semibold text-muted-foreground">Choose a date and time</label>
                {slotDateGroups.length > 3 && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const input = calendarInputRef.current;
                        if (!input) return;
                        try {
                          if (typeof input.showPicker === "function") input.showPicker();
                          else input.click();
                        } catch {
                          input.click();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-secondary"
                    >
                      <CalendarDays size={13} /> Calendar
                    </button>
                    <input
                      ref={calendarInputRef}
                      type="date"
                      value={activeDateKey}
                      onChange={(event) => {
                        const group = slotDateGroups.find((item) => item.key === event.target.value);
                        if (!group) return;
                        setSelectedDateKey(group.key);
                        setSlotId("");
                      }}
                      aria-label="Choose another available date"
                      className="pointer-events-none absolute h-px w-px opacity-0"
                      tabIndex={-1}
                    />
                  </div>
                )}
              </div>
              {slots.length === 0 ? (
                <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">No slots available yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {previewDateGroups.map((group) => (
                      <button
                        key={group.key}
                        type="button"
                        aria-pressed={activeDateKey === group.key}
                        onClick={() => {
                          setSelectedDateKey(group.key);
                          setSlotId("");
                        }}
                        className="min-w-0 rounded-xl border px-2 py-2 text-left text-xs font-semibold transition-colors"
                        style={{
                          borderColor: activeDateKey === group.key ? "var(--primary)" : "var(--border)",
                          backgroundColor: activeDateKey === group.key ? "var(--primary)" : "transparent",
                          color: activeDateKey === group.key ? "white" : "var(--foreground)",
                        }}
                      >
                        {group.label}
                        <span className="mt-0.5 block text-[10px] font-medium opacity-75">{group.slots.length} {group.slots.length === 1 ? "time" : "times"}</span>
                      </button>
                    ))}
                  </div>

                  <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Available times</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(activeDateGroup?.slots ?? []).map((s) => {
                      const unavailable = s.status ? s.status !== "available" : s.booked >= s.capacity;
                      const full = unavailable || s.booked >= s.capacity;
                      const selected = slotId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={unavailable}
                          aria-pressed={selected}
                          onClick={() => setSlotId(s.id)}
                          className="min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed"
                          style={{
                            borderColor: selected ? "var(--primary)" : "var(--border)",
                            backgroundColor: selected ? "var(--primary)" : full ? "var(--muted)" : "transparent",
                            color: selected ? "white" : full ? "var(--muted-foreground)" : "var(--foreground)",
                          }}
                        >
                          <span className="block truncate text-sm font-semibold">{formatBookingSlotTime(s.startsAt)}</span>
                          <span className="mt-0.5 block text-[11px] font-medium opacity-75">{full ? "Fully booked" : `${s.capacity - s.booked} left`}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {activity.requiresBooking && !slotId && slots.length > 0 && <p className="mt-2 text-xs text-destructive">Select a time slot to continue.</p>}
            </div>
          )}

          <div className="mb-5 flex items-center justify-between rounded-2xl bg-muted px-3 py-2.5">
            <label className="text-xs font-semibold text-muted-foreground">Quantity</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-8 w-8 rounded-lg border border-border bg-card text-foreground">−</button>
              <span className="w-6 text-center text-sm font-bold text-foreground">{qty}</span>
              <button
                onClick={() => setQty((q) => (seatsLeft !== undefined ? Math.min(seatsLeft, q + 1) : q + 1))}
                disabled={seatsLeft !== undefined && qty >= seatsLeft}
                className="h-8 w-8 rounded-lg border border-border bg-card text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          {seatsLeft !== undefined && <p className="-mt-3 mb-4 text-right text-[11px] text-muted-foreground">{seatsLeft} seats left</p>}
          <Button
            onClick={handleAddToCart}
            disabled={adding || (activity.requiresBooking && !slotId)}
            className="h-12 w-full rounded-full text-base"
          >
            {added ? "Added to Cart ✓" : activity.requiresBooking ? "Add Booking to Cart" : "Add to Cart"}
          </Button>

          <div className="mt-3 flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-full border-2" onClick={handleChat} title="Chat with vendor">
              <MessageCircle size={17} />
            </Button>
            <ShareButton shareType="product" contentId={activity.id} title={activity.name} />
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-[0_12px_35px_rgba(1,0,102,0.08)]">
            <h2 className="mb-4 text-sm font-bold text-foreground">Details</h2>
            <div className="space-y-3">
              {chips.map((d) => {
                const content = (
                  <>
                    <d.icon size={15} className="mt-0.5 shrink-0 text-teal" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.label}</p>
                      <p className="text-sm font-semibold text-foreground">{d.value}</p>
                    </div>
                  </>
                );
                return d.href ? (
                  <a key={d.label} href={d.href} className="flex items-start gap-2.5">{content}</a>
                ) : (
                  <div key={d.label} className="flex items-start gap-2.5">{content}</div>
                );
              })}
            </div>
          </div>
        )}
      </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 shadow-[0_-8px_24px_rgba(1,0,102,0.12)] backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{qty} person{qty > 1 ? "s" : ""}</p>
            <p className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary">RM {price * qty}</p>
          </div>
          <Button onClick={handleAddToCart} disabled={adding || (activity.requiresBooking && !slotId)} className="h-11 flex-1 rounded-full">
            {added ? "Added ✓" : activity.requiresBooking ? "Add Booking" : "Add to Cart"}
          </Button>
        </div>
      </div>
    </div>
  );
}
