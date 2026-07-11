"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle, Clock, Globe, MapPin, MessageCircle, Navigation, Share2, Star, Users } from "lucide-react";
import { getBookingSlots, getComputedActivity } from "@/backend/domains/catalogue";
import { getOrCreateThread } from "@/backend/domains/identity";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { unitPrice } from "@/backend/core/helpers";
import { AiTag } from "@/components/customer/ai-tag";
import { MapView } from "@/components/map/map-view";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { BookingSlot, ComputedActivity } from "@/backend/core/types";

export default function ActivityDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { addItem } = useCart();

  const [activity, setActivity] = useState<ComputedActivity | null | undefined>(undefined);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [variantId, setVariantId] = useState<string>("");
  const [slotId, setSlotId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    const a = getComputedActivity(params.id);
    setActivity(a);
    if (a) {
      setVariantId(a.variants[0]?.id ?? "");
      if (a.requiresBooking) setSlots(getBookingSlots(a.id));
    }
  }, [params.id]);

  const price = useMemo(() => (activity ? unitPrice(activity, variantId) : 0), [activity, variantId]);

  if (activity === undefined) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
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
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${activity!.outlet.lat},${activity!.outlet.lng}`, "_blank");
  }

  async function handleChat() {
    if (!currentUser) return;
    const thread = getOrCreateThread(currentUser.id, activity!.outletId);
    router.push(`/chat/${thread.id}`);
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: activity!.name, url });
      } catch {
        // user cancelled — no-op
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareMsg("Link copied!");
      setTimeout(() => setShareMsg(null), 2000);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <div className="relative rounded-2xl overflow-hidden mb-6" style={{ height: 280 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activity.image} alt={activity.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.65) 0%, transparent 50%)" }} />
        {activity.outlet.verified && (
          <div className="absolute bottom-4 left-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-white bg-primary">
            <CheckCircle size={13} /> Verified Vendor
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2 text-foreground font-[family-name:var(--font-display)]">{activity.name}</h1>
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin size={13} /> {activity.outlet.city}, {activity.outlet.state}
            </div>
            <div className="flex items-center gap-1.5">
              <Star size={13} fill="#F2B84B" stroke="none" />
              <span className="font-bold text-foreground">{activity.rating}</span>
              <span className="text-muted-foreground">({activity.reviews} reviews)</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: activity.outlet.open ? "var(--primary)" : "#aaa" }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activity.outlet.open ? "var(--primary)" : "#aaa" }} />
              {activity.outlet.open ? "Open Now" : "Currently Closed"}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-bold text-primary font-[family-name:var(--font-mono)]">RM {price}</p>
          <p className="text-xs text-muted-foreground">per person</p>
        </div>
      </div>

      {activity.aiTag && <div className="mb-4"><AiTag text={activity.aiTag} /></div>}

      <p className="text-sm leading-relaxed mb-6 text-foreground/80">{activity.description}</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Duration", value: activity.duration, icon: <Clock size={15} /> },
          { label: "Group Size", value: "2–12 pax", icon: <Users size={15} /> },
          { label: "Language", value: "EN / BM", icon: <Globe size={15} /> },
        ].map((d) => (
          <div key={d.label} className="rounded-xl p-3 text-center bg-muted">
            <div className="flex justify-center mb-1 text-teal">{d.icon}</div>
            <p className="text-[10px] uppercase tracking-wide mb-0.5 text-muted-foreground">{d.label}</p>
            <p className="text-sm font-bold text-foreground">{d.value}</p>
          </div>
        ))}
      </div>

      {/* Booking selection */}
      <div className="rounded-xl p-4 mb-6 border border-border">
        <p className="text-xs font-bold uppercase tracking-wider mb-3 text-primary">
          {activity.requiresBooking ? "Select Date & Package" : "Choose Options"}
        </p>

        {activity.variants.length > 1 && (
          <div className="mb-3">
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Package</label>
            <div className="flex gap-2 flex-wrap">
              {activity.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold border"
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
          <div className="mb-3">
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Time Slot</label>
            {slots.length === 0 ? (
              <p className="text-xs text-muted-foreground">No slots available yet.</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {slots.map((s) => {
                  const full = s.booked >= s.capacity;
                  return (
                    <button
                      key={s.id}
                      disabled={full}
                      onClick={() => setSlotId(s.id)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold border disabled:opacity-40 disabled:cursor-not-allowed"
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

        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-muted-foreground">Quantity</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-7 h-7 rounded-lg border border-border text-foreground">−</button>
            <span className="w-6 text-center text-sm font-semibold text-foreground">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="w-7 h-7 rounded-lg border border-border text-foreground">+</button>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mb-8 flex-wrap">
        <Button
          onClick={handleAddToCart}
          disabled={adding || (activity.requiresBooking && !slotId)}
          className="flex-1 min-w-[140px] h-12 rounded-full text-base"
        >
          {added ? "Added to Cart ✓" : activity.requiresBooking ? "Add Booking to Cart" : "Add to Cart"}
        </Button>
        <Button variant="outline" size="icon" className="w-12 h-12 rounded-full border-2" onClick={handleChat} title="Chat with vendor">
          <MessageCircle size={18} />
        </Button>
        <Button variant="outline" size="icon" className="w-12 h-12 rounded-full border-2" onClick={handleDirections} title="Get directions">
          <Navigation size={18} />
        </Button>
        <Button variant="outline" size="icon" className="w-12 h-12 rounded-full border-2" onClick={handleShare} title="Share">
          <Share2 size={18} />
        </Button>
      </div>
      {shareMsg && <p className="text-xs text-primary -mt-6 mb-6">{shareMsg}</p>}
      {activity.requiresBooking && !slotId && (
        <p className="text-xs text-destructive -mt-6 mb-6">Select a time slot to continue.</p>
      )}

      <div>
        <p className="text-sm font-bold text-foreground mb-2">Location</p>
        <MapView
          pins={[{ id: activity.outlet.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.outlet.name, sublabel: activity.outlet.address }]}
          center={[activity.outlet.lat, activity.outlet.lng]}
          zoom={14}
          height={260}
        />
      </div>
    </div>
  );
}
