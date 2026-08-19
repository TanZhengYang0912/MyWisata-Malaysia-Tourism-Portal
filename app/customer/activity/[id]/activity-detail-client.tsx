"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle, MapPin, MessageCircle, Sparkles, Star, Store } from "lucide-react";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { getOrCreateThread, sendMessage } from "@/backend/domains/identity";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { unitPrice } from "@/backend/core/helpers";
import { AiTag } from "@/components/customer/ai-tag";
import { EmptyState } from "@/components/shared/empty-state";
import { ShareButton } from "@/components/shared/share-button";
import { ResilientImage } from "@/components/shared/resilient-image";
import { Button } from "@/components/ui/button";
import { ActivityReviews } from "@/components/customer/activity-reviews";
import type { BookingSlot, ComputedActivity, ProductReview } from "@/backend/core/types";
import type { OutletChoice } from "@/backend/domains/catalogue";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { getActivityCommerceMode, getCategoryChips, getPriceUnit, isPlaceBound } from "@/lib/customer/category-details";
import { outletShortName } from "@/lib/outlet-display";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { getCustomerReturnPath } from "@/lib/customer/navigation-context";
import { getDetailBody } from "./bodies";

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
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const { t } = useTranslation("customer");
  const { addItem } = useCart();
  const guard = useCustomerCapabilityGate();
  const vendorDiscovery = searchParams.get("source") === "vendor";
  const requestedOutletId = searchParams.get("outletId");
  const initialOutletId = requestedOutletId && outletChoices.some((choice) => choice.outletId === requestedOutletId)
    ? requestedOutletId
    : initialActivity?.outletId ?? "";

  const [activity] = useState<ComputedActivity | null>(initialActivity);
  const [slots] = useState<BookingSlot[]>(initialSlots);
  const [reviews] = useState<ProductReview[]>(initialReviews);
  const [variantId, setVariantId] = useState<string>(initialActivity?.variants[0]?.id ?? "");
  const [slotId, setSlotId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Which outlet the customer is buying from. Price and stock are per-outlet,
  // so this is required before the item can go in the cart.
  const [outletId, setOutletId] = useState<string>(initialOutletId);

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
  // Every outlet-scoped display (city, rating, verified badge, reviews…) reads
  // from this, not from activity.outlet — activity.outlet is frozen to
  // whichever outlet toComputed() picked (nearest, or cheapest), not the one
  // the customer has selected on this page. Falls back to activity.outlet for
  // the common single-outlet product, where outletChoices is empty.
  const selectedOutlet = useMemo<OutletChoice | null>(() => {
    if (selectedChoice) return selectedChoice;
    if (!activity) return null;
    return {
      outletId: activity.outlet.id,
      outletName: activity.outlet.name,
      city: activity.outlet.city,
      state: activity.outlet.state,
      price: activity.price,
      open: activity.outlet.open,
      verified: activity.outlet.verified,
      vendorId: activity.outlet.vendorId,
      vendorName: activity.outlet.vendorName,
      rating: activity.rating,
      reviews: activity.reviews,
    };
  }, [activity, selectedChoice]);
  // A trail can be a public place or a paid guide-led experience. Never expose
  // commerce controls when the provider relationship is missing.
  const placeBound = activity ? isPlaceBound(activity) : false;
  const vendorBacked = activity ? getActivityCommerceMode(activity) === "vendor" : false;
  const publicPlace = placeBound && !vendorBacked;
  // Variant deltas are shared across outlets; only the base price differs.
  const price = useMemo(() => {
    if (!activity || publicPlace) return 0;
    const base = unitPrice(activity, variantId);
    return selectedChoice ? base - activity.price + selectedChoice.price : base;
  }, [activity, publicPlace, variantId, selectedChoice]);
  const selectedSlot = slots.find((s) => s.id === slotId);
  const seatsLeft = selectedSlot ? selectedSlot.capacity - selectedSlot.booked : undefined;

  // A slot switch can leave qty above the new slot's remaining seats — clamp down.
  useEffect(() => {
    if (selectedSlot) setQty((q) => Math.min(q, Math.max(1, selectedSlot.capacity - selectedSlot.booked)));
  }, [slotId]);

  const chips = useMemo(() => (activity ? getCategoryChips(activity) : []), [activity]);
  // What varies by category lives in the body; everything around it is shared.
  const body = getDetailBody(activity?.categorySlug);
  const namesOutlet = activity ? !placeBound : true;
  const returnTo = getCustomerReturnPath(searchParams.get("returnTo"));

  if (activity === null) {
    return <EmptyState title="Experience not found" description="This listing may have been removed." />;
  }

  async function handleAddToCart() {
    if (adding) return; // double-submit guard
    if (publicPlace) {
      setAddError(t("ui.activity.noVendorBooking"));
      return;
    }
    if (!guard(CUSTOMER_CAPABILITY.CART_MUTATION)) return;
    if (activity!.requiresBooking && !slotId) return;
    // Sold at several outlets → the customer must pick one; price and stock
    // belong to the outlet, not to the shared product.
    if (outletChoices.length > 0 && !outletId) return;
    if (!variantId && !slotId) {
      setAddError("This listing is not available to add to cart yet. Please try another listing.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await addItem({ activityId: activity!.id, variantId, slotId: slotId || undefined, outletId: outletId || activity!.outletId, qty });
      setAdded(true);
    } catch (error) {
      setAdded(false);
      setAddError(error instanceof Error && error.message === "cart_item_requires_variant_or_slot"
        ? "This listing is not available to add to cart yet. Please try another listing."
        : "Unable to add this item to your cart. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleChat() {
    if (!guard(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;
    if (!currentUser) return;
    const thread = await getOrCreateThread(currentUser.id, selectedOutlet!.outletId);
    await sendMessage(thread.id, currentUser.id, "customer", `Re: ${activity!.name}`, undefined, activity!.id);
    router.push(`/customer/chat/${thread.id}`);
  }

  return (
    // lg:h-[...] + overflow-hidden bounds the page to the viewport at desktop so
    // only the reviews list scrolls internally; mobile keeps normal page scroll.
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7 lg:h-[calc(100dvh-6rem)]">
      <div className="mb-4">
        <Link href={returnTo} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30">
          <ArrowLeft size={16} aria-hidden="true" /> Back to results
        </Link>
      </div>

      <div className="grid items-start gap-6 lg:h-full lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <div className="min-w-0 lg:flex lg:h-full lg:flex-col lg:overflow-hidden">
      <div className="relative mb-4 h-44 shrink-0 overflow-hidden rounded-2xl sm:h-52 lg:h-64">
        <ResilientImage
          src={placeBound ? getPlaceActivityImage(activity) : activity.image}
          alt={activity.name}
          className="h-full w-full object-cover"
          fallbackClassName="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-amber-50 text-primary"
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.65) 0%, transparent 50%)" }} />
        {activity.isHiddenGem && (
          <div className="absolute top-4 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: "var(--highlight-yellow, #D97706)" }}>
            <Sparkles size={13} /> Hidden Gem
          </div>
        )}
        {!placeBound && selectedOutlet!.verified && (
          <div className="absolute bottom-4 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white bg-primary">
            <CheckCircle size={13} /> Verified Vendor
          </div>
        )}
        {placeBound && (
          <div className="absolute bottom-4 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white bg-[#163d69]">
            <MapPin size={13} /> {publicPlace ? "Public place" : "Place-based experience"}
          </div>
        )}
      </div>

      <section className="min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap shrink-0">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2 text-foreground font-[family-name:var(--font-display)]">{activity.name}</h1>
              {placeBound ? (
                <p className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold text-primary">
                  <MapPin size={14} /> {publicPlace ? "Public place" : "Place-based experience"} · {[selectedOutlet!.city, selectedOutlet!.state].filter(Boolean).join(", ") || "Malaysia"}
                  {vendorBacked && selectedOutlet!.vendorName ? <span className="font-normal text-muted-foreground">Guided by {selectedOutlet!.vendorName}</span> : null}
                </p>
              ) : vendorDiscovery ? (
                <p className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold text-primary">
                  <Store size={14} /> Offered through {selectedOutlet!.vendorName ?? "a local vendor"}
                </p>
              ) : (
                <p className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold text-primary">
                  <Store size={14} /> Provided by {selectedOutlet!.vendorName ?? "Local vendor"}
                  {namesOutlet && (
                    <>
                      {" — "}{outletShortName(selectedOutlet!.outletName, selectedOutlet!.vendorName)} Outlet
                      <Link href={getOutletShopHref(selectedOutlet!.outletId)} className="underline underline-offset-2 hover:no-underline">
                        Visit outlet
                      </Link>
                    </>
                  )}
                </p>
              )}
              <div className="flex items-center gap-4 flex-wrap text-sm">
                {vendorDiscovery ? <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin size={13} /> Available at {outletChoices.length} outlet{outletChoices.length === 1 ? "" : "s"}</div> : <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin size={13} /> {selectedOutlet!.city}, {selectedOutlet!.state}</div>}
                {publicPlace ? <div className="font-semibold text-primary">Public access</div> : <>
                  <div className="flex items-center gap-1.5">
                    <Star size={13} fill="var(--highlight-yellow)" stroke="none" />
                    <span className="font-bold text-foreground">{selectedOutlet!.rating}</span>
                    <span className="text-muted-foreground">({selectedOutlet!.reviews} reviews)</span>
                  </div>
                  <div className="flex items-center gap-1.5" style={{ color: selectedOutlet!.open ? "var(--nature-green-ink)" : "#64748b" }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedOutlet!.open ? "var(--nature-green)" : "#94a3b8" }} />
                    {selectedOutlet!.open ? "Open Now" : "Currently Closed"}
                  </div>
                </>}
              </div>
        </div>
      </div>

      <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <div className="shrink-0">
          {activity.aiTag && <div className="mb-4"><AiTag text={activity.aiTag} /></div>}

          <p className="text-sm leading-relaxed mb-6 text-foreground/80">{activity.description}</p>
        </div>

        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <ActivityReviews productId={activity.id} outletId={selectedOutlet!.outletId} rating={selectedOutlet!.rating} totalReviews={selectedOutlet!.reviews} initialReviews={reviews} />
        </div>
      </div>

      </section>
      </div>

      <aside className="lg:h-full lg:overflow-y-auto">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_12px_35px_rgba(1,0,102,0.08)]">
          <div className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{body.panelKicker}</p>
              <h2 className="mt-1 text-lg font-bold text-foreground">{body.panelTitle(activity)}</h2>
            </div>
            <div className="text-right">
              {publicPlace ? <><p className="text-lg font-bold text-primary">Free to explore</p><p className="text-[11px] text-muted-foreground">Public access</p></> : vendorDiscovery ? <><p className="text-sm font-bold text-primary">Choose an outlet</p><p className="text-[11px] text-muted-foreground">Price and availability vary by outlet</p></> : <><p className="font-[family-name:var(--font-mono)] text-2xl font-bold text-primary">RM {price}</p><p className="text-[11px] text-muted-foreground">{getPriceUnit(activity.categorySlug)}</p></>}
            </div>
          </div>

           <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-4 text-xs">
             <span className="min-w-0 truncate text-muted-foreground">
               {placeBound ? <MapPin size={12} className="mr-1 inline align-[-1px]" /> : <Store size={12} className="mr-1 inline align-[-1px]" />}
               {publicPlace ? "No vendor required" : placeBound ? "Place details" : (selectedOutlet!.vendorName ?? "Local vendor")}
             </span>
             {!placeBound && <Link href={`/customer/vendor/${selectedOutlet!.vendorId}`} className="shrink-0 font-semibold text-primary hover:underline">Visit vendor</Link>}
           </div>

          {publicPlace ? <div className="rounded-2xl border border-[#cbd7f2] bg-[#f3f5ff] p-4 text-sm text-muted-foreground">No vendor booking is listed for this public place. Check the access details before you visit.</div> : vendorDiscovery ? <div className="rounded-2xl border border-primary/15 bg-secondary/35 p-4">
            <p className="text-sm font-bold text-foreground">Choose an outlet to continue</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Each outlet sets its own price, availability and booking times. Open an outlet menu to buy or book this experience.</p>
            <div className="mt-4 flex flex-col gap-2">
              {outletChoices.length > 0 ? outletChoices.map((choice) => (
                <Link key={choice.outletId} href={`${getOutletShopHref(choice.outletId)}#full-menu`} className="flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">View outlet · {outletShortName(choice.outletName, choice.vendorName)}</span><span className="text-xs text-muted-foreground">{choice.city}{!choice.open && " · Currently closed"}</span></span>
                  <span className="shrink-0 text-primary" aria-hidden="true">→</span>
                </Link>
              )) : <Link href={`${getOutletShopHref(activity.outletId)}#full-menu`} className="inline-flex items-center justify-between rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">View outlet <span aria-hidden="true">→</span></Link>}
            </div>
          </div> : <>
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
                      type="button"
                      onClick={() => { setOutletId(choice.outletId); setAdded(false); }}
                      aria-pressed={selected}
                      className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: selected ? "var(--primary)" : "var(--border)",
                        backgroundColor: selected ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{outletShortName(choice.outletName, choice.vendorName)}</span>
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
                    type="button"
                    onClick={() => { setVariantId(v.id); setAdded(false); }}
                    aria-pressed={variantId === v.id}
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

          {body.Options && <body.Options activity={activity} slots={slots} slotId={slotId} onSlotChange={(nextSlotId) => { setSlotId(nextSlotId); setAdded(false); }} />}

          <div className="mb-5 flex items-center justify-between rounded-2xl bg-muted px-3 py-2.5">
            <label className="text-xs font-semibold text-muted-foreground">Quantity</label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="h-8 w-8 rounded-lg border border-border bg-card text-foreground">−</button>
              <span className="w-6 text-center text-sm font-bold text-foreground">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => (seatsLeft !== undefined ? Math.min(seatsLeft, q + 1) : q + 1))}
                aria-label="Increase quantity"
                disabled={seatsLeft !== undefined && qty >= seatsLeft}
                className="h-8 w-8 rounded-lg border border-border bg-card text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          {seatsLeft !== undefined && <p className="-mt-3 mb-4 text-right text-[11px] text-muted-foreground">{seatsLeft} seats left</p>}
           <Button
            type="button"
            onClick={handleAddToCart}
            disabled={adding || (activity.requiresBooking && !slotId)}
            className="h-12 w-full rounded-full text-base"
           >
             {added ? "Added to Cart ✓" : activity.requiresBooking ? "Add Booking to Cart" : "Add to Cart"}
           </Button>

           {addError && <p role="alert" className="mt-3 rounded-2xl bg-destructive/10 p-3 text-center text-xs font-semibold text-destructive">{addError}</p>}

           {added && (
            <div role="status" aria-live="polite" className="mt-3 rounded-2xl bg-primary/5 p-3 text-center">
              <p className="text-sm font-semibold text-primary">Added to cart. What would you like to do next?</p>
              <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs font-bold">
                <Link href="/customer/cart" className="rounded-full bg-primary px-3 py-2 text-white">View cart</Link>
                <Link href={returnTo} className="rounded-full border border-primary/20 px-3 py-2 text-primary">Continue exploring</Link>
              </div>
            </div>
          )}

          </>}
          {!publicPlace && <div className="mt-3 flex items-center justify-center gap-3">
            {vendorBacked && <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-full border-2" onClick={handleChat} title="Chat with vendor" aria-label="Chat with vendor">
              <MessageCircle size={17} />
            </Button>}
            <ShareButton shareType="product" contentId={activity.id} title={activity.name} />
          </div>}
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

       {!publicPlace && !vendorDiscovery && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 shadow-[0_-8px_24px_rgba(1,0,102,0.12)] backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{body.quantityLabel(qty)}</p>
            <p className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary">RM {price * qty}</p>
          </div>
          {added ? (
            <Link href="/customer/cart" className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-white">View Cart</Link>
          ) : (
            <Button type="button" onClick={handleAddToCart} disabled={adding || (activity.requiresBooking && !slotId)} className="h-11 flex-1 rounded-full">
              {activity.requiresBooking ? "Add Booking" : "Add to Cart"}
            </Button>
          )}
        </div>
      </div>}
    </div>
  );
}
