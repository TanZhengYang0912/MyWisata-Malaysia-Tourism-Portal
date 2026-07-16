"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle, Clock, Globe, MapPin, MessageCircle, Navigation, Phone, Plus, Star, Tag, Users } from "lucide-react";
import { getOrCreateThread } from "@/backend/domains/identity";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { useTrip } from "@/components/providers/trip";
import { unitPrice } from "@/backend/core/helpers";
import { AiTag } from "@/components/customer/ai-tag";
import { MapView } from "@/components/map/map-view";
import { EmptyState } from "@/components/shared/empty-state";
import { ShareButton } from "@/components/shared/share-button";
import { Button } from "@/components/ui/button";
import { TRAVEL_MODES, type TravelModeId } from "@/lib/travel-modes";
import type { BookingSlot, ComputedActivity } from "@/backend/core/types";

type DetailChip = { label: string; value: string; icon: typeof Clock; href?: string };

// Food & Dining gets real, category-relevant chips; every other category keeps
// the original generic set until they get their own pass.
function getDetailChips(activity: ComputedActivity): DetailChip[] {
  if (activity.category !== "Food & Dining") {
    return [
      { label: "Duration", value: activity.duration, icon: Clock },
      { label: "Group Size", value: "2–12 pax", icon: Users },
      { label: "Language", value: "EN / BM", icon: Globe },
    ];
  }
  const chips: DetailChip[] = [];
  if (activity.outlet.hours) chips.push({ label: "Hours", value: activity.outlet.hours, icon: Clock });
  if (activity.tags && activity.tags.length > 0) chips.push({ label: "Tags", value: activity.tags.join(" · "), icon: Tag });
  if (activity.outlet.phone) chips.push({ label: "Contact", value: activity.outlet.phone, icon: Phone, href: `tel:${activity.outlet.phone}` });
  return chips;
}

export function ActivityDetailClient({
  initialActivity,
  initialSlots,
}: {
  initialActivity: ComputedActivity | null;
  initialSlots: BookingSlot[];
}) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { addItem } = useCart();
  const trip = useTrip();

  const [activity] = useState<ComputedActivity | null>(initialActivity);
  const [slots] = useState<BookingSlot[]>(initialSlots);
  const [variantId, setVariantId] = useState<string>(initialActivity?.variants[0]?.id ?? "");
  const [slotId, setSlotId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelModeId>("DRIVING");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [eta, setEta] = useState<{ durationText: string; distanceText: string } | null>(null);
  const [etaStatus, setEtaStatus] = useState<"idle" | "loading" | "denied" | "error">("idle");
  const [view, setView] = useState<"details" | "map">("details");

  const price = useMemo(() => (activity ? unitPrice(activity, variantId) : 0), [activity, variantId]);
  const selectedSlot = slots.find((s) => s.id === slotId);
  const seatsLeft = selectedSlot ? selectedSlot.capacity - selectedSlot.booked : undefined;

  // A slot switch can leave qty above the new slot's remaining seats — clamp down.
  useEffect(() => {
    if (selectedSlot) setQty((q) => Math.min(q, Math.max(1, selectedSlot.capacity - selectedSlot.booked)));
  }, [slotId]);

  // Retries the ETA calc once the Maps script finishes loading, covering the
  // race where the user picks a travel mode before google.maps is ready.
  useEffect(() => {
    if (mapsReady && userLoc && activity) computeEta(userLoc, travelMode);
  }, [mapsReady]);

  function computeEta(origin: { lat: number; lng: number }, mode: TravelModeId) {
    if (!mapsReady || !activity) return;
    setEtaStatus("loading");
    new google.maps.DirectionsService()
      .route({
        origin,
        destination: { lat: activity.outlet.lat, lng: activity.outlet.lng },
        travelMode: google.maps.TravelMode[mode],
      })
      .then((result) => {
        const leg = result.routes[0]?.legs[0];
        if (!leg?.duration || !leg.distance) throw new Error("no route");
        setEta({ durationText: leg.duration.text, distanceText: leg.distance.text });
        setEtaStatus("idle");
      })
      .catch(() => {
        setEta(null);
        setEtaStatus("error");
      });
  }

  function handleTravelModeChange(mode: TravelModeId) {
    setTravelMode(mode);
    setEta(null);
    if (userLoc) {
      computeEta(userLoc, mode);
      return;
    }
    if (!navigator.geolocation) {
      setEtaStatus("denied");
      return;
    }
    setEtaStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        computeEta(loc, mode);
      },
      () => setEtaStatus("denied"),
      { timeout: 5000 },
    );
  }

  if (activity === null) {
    return <EmptyState title="Experience not found" description="This listing may have been removed." />;
  }

  function handleAddToCart() {
    if (adding) return; // double-submit guard
    if (activity!.requiresBooking && !slotId) return;
    setAdding(true);
    addItem({ activityId: activity!.id, variantId, slotId: slotId || undefined, qty });
    setAdded(true);
    setTimeout(() => {
      setAdding(false);
    }, 400);
  }

  function handleDirections() {
    const params = new URLSearchParams({
      api: "1",
      destination: `${activity!.outlet.lat},${activity!.outlet.lng}`,
      travelmode: TRAVEL_MODES.find((m) => m.id === travelMode)!.urlParam,
    });
    if (userLoc) params.set("origin", `${userLoc.lat},${userLoc.lng}`);
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, "_blank");
  }

  function handleAddToTrip() {
    if (!activity) return;
    if (trip.has(activity.id)) trip.remove(activity.id);
    else trip.add({ id: activity.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.name, sublabel: activity.outlet.city });
  }

  async function handleChat() {
    if (!currentUser) return;
    const thread = await getOrCreateThread(currentUser.id, activity!.outletId);
    router.push(`/customer/chat/${thread.id}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="relative mb-4 h-52 overflow-hidden rounded-2xl sm:h-64 lg:h-72">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activity.image} alt={activity.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.65) 0%, transparent 50%)" }} />
        {activity.outlet.verified && (
          <div className="absolute bottom-4 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white bg-primary">
            <CheckCircle size={13} /> Verified Vendor
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
      <section className="min-w-0">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2 text-foreground font-[family-name:var(--font-display)]">{activity.name}</h1>
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

      <div className="mb-4 flex w-fit items-center gap-1 rounded-full border border-border p-1">
        {(["details", "map"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold capitalize"
            style={{ backgroundColor: view === v ? "var(--primary)" : "transparent", color: view === v ? "white" : "var(--foreground)" }}
          >
            {v}
          </button>
        ))}
      </div>

      {view === "details" && (
        <>
          {activity.aiTag && <div className="mb-4"><AiTag text={activity.aiTag} /></div>}

          <p className="text-sm leading-relaxed mb-6 text-foreground/80">{activity.description}</p>

          {getDetailChips(activity).length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {getDetailChips(activity).map((d) => {
                const content = (
                  <>
                    <div className="flex justify-center mb-1 text-teal"><d.icon size={15} /></div>
                    <p className="text-[10px] uppercase tracking-wide mb-0.5 text-muted-foreground">{d.label}</p>
                    <p className="text-sm font-bold text-foreground truncate">{d.value}</p>
                  </>
                );
                return d.href ? (
                  <a key={d.label} href={d.href} className="rounded-xl p-3 text-center bg-muted block">{content}</a>
                ) : (
                  <div key={d.label} className="rounded-xl p-3 text-center bg-muted">{content}</div>
                );
              })}
            </div>
          )}

        </>
      )}

      {view === "map" && (
        <>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Directions:</span>
            {TRAVEL_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => handleTravelModeChange(m.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border"
                style={{
                  borderColor: travelMode === m.id ? "var(--travel-blue)" : "var(--border)",
                  backgroundColor: travelMode === m.id ? "var(--travel-blue)" : "transparent",
                  color: travelMode === m.id ? "white" : "var(--foreground)",
                }}
              >
                <m.icon size={13} /> {m.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              {etaStatus === "loading" && "Calculating…"}
              {etaStatus === "denied" && "Enable location for ETA"}
              {etaStatus === "error" && "ETA unavailable"}
              {etaStatus === "idle" && eta && `${eta.durationText} · ${eta.distanceText}`}
            </span>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="default" onClick={handleDirections} className="rounded-full bg-primary text-white hover:bg-primary/90">
              <Navigation size={16} className="mr-1.5" /> Get Directions
            </Button>
            <Button
              variant="outline"
              onClick={handleAddToTrip}
              className="rounded-full border-2"
              style={trip.has(activity.id) ? { borderColor: "var(--nature-green, #16A34A)", color: "var(--nature-green, #16A34A)" } : undefined}
            >
              {trip.has(activity.id) ? <Check size={16} className="mr-1.5" /> : <Plus size={16} className="mr-1.5" />}
              {trip.has(activity.id) ? "In trip" : "Add to trip"}
            </Button>
          </div>

          <div>
            <p className="text-sm font-bold text-foreground mb-2">Location</p>
            <MapView
              pins={[{ id: activity.outlet.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.outlet.name, sublabel: activity.outlet.address }]}
              center={[activity.outlet.lat, activity.outlet.lng]}
              zoom={14}
              height={420}
              onApiLoaded={() => setMapsReady(true)}
            />
          </div>
        </>
      )}

      </section>

      <aside className="lg:sticky lg:top-24">
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
              <label className="mb-2 block text-xs font-semibold text-muted-foreground">Time Slot</label>
              {slots.length === 0 ? (
                <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">No slots available yet.</p>
              ) : (
                <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                  {slots.map((s) => {
                    const full = s.booked >= s.capacity;
                    return (
                      <button
                        key={s.id}
                        disabled={full}
                        onClick={() => setSlotId(s.id)}
                        className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                        style={{
                          borderColor: slotId === s.id ? "var(--primary)" : "var(--border)",
                          backgroundColor: slotId === s.id ? "var(--primary)" : "transparent",
                          color: slotId === s.id ? "white" : "var(--foreground)",
                        }}
                      >
                        {new Date(s.startsAt).toLocaleString("en-MY", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        {full ? " · Full" : ` · ${s.capacity - s.booked} left`}
                      </button>
                    );
                  })}
                </div>
              )}
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
          {activity.requiresBooking && !slotId && <p className="mb-3 text-xs text-destructive">Select a time slot to continue.</p>}

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
            <ShareButton productId={activity.id} productName={activity.name} />
          </div>
        </div>
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
