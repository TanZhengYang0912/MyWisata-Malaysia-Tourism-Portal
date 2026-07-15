"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Clock, Heart, MapPin, Star, Store } from "lucide-react";
import { useWishlist } from "@/components/providers/wishlist";
import { AiTag } from "./ai-tag";
import type { ComputedActivity } from "@/backend/core/types";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";

export function ActivityCard({ activity }: { activity: ComputedActivity }) {
  const [saving, setSaving] = useState(false);
  const { savedIds, toggleSaved } = useWishlist();
  const saved = savedIds.has(activity.id);

  async function handleSave(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (saving) return;
    setSaving(true);
    await toggleSaved(activity.id);
    setSaving(false);
  }

  return (
    <article
      className="group overflow-hidden rounded-2xl bg-card transition-all duration-200 hover:-translate-y-1"
      style={{ boxShadow: "0 2px 16px rgba(36,49,58,0.08)" }}
    >
      <div className="relative overflow-hidden" style={{ height: 200 }}>
        <Link href={`/customer/activity/${activity.id}`} className="block h-full" aria-label={`View ${activity.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activity.image}
            alt={activity.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            style={{ backgroundColor: "#EEF2FF" }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.5) 0%, transparent 55%)" }} />
          {activity.hot && <div className="absolute left-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">🔥 Trending</div>}
          {activity.outlet.verified && <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white"><CheckCircle size={9} /> Verified</div>}
          {!activity.outlet.open && <div className="absolute bottom-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: "rgba(36,49,58,0.8)" }}>Closed</div>}
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          aria-label={saved ? `Remove ${activity.name} from saved experiences` : `Save ${activity.name}`}
          title={saved ? "Remove from saved experiences" : "Save to wishlist"}
          className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full transition ${saved ? "bg-amber-100" : "bg-white/90"} disabled:cursor-wait disabled:opacity-70`}
        >
          <Heart size={15} fill={saved ? "#010066" : "none"} stroke={saved ? "#010066" : "#334155"} />
        </button>
      </div>
      <div className="space-y-2 p-4">
        <Link href={`/customer/activity/${activity.id}`} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{activity.name}</h3>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={11} /> {activity.outlet.city}, {activity.outlet.state}</div>
        </Link>
        <Link href={getOutletShopHref(activity.outlet.id)} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground transition hover:text-primary">
          <Store size={11} /> <span className="truncate">Visit shop · {activity.outlet.vendorName ?? "Local vendor"}</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs"><Star size={11} fill="var(--highlight-yellow)" stroke="none" /><span className="font-semibold text-foreground">{activity.rating}</span><span className="text-muted-foreground">({activity.reviews})</span></div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={10} /> {activity.duration}</div>
          {activity.distanceKm !== undefined && <div className="text-xs text-muted-foreground">{activity.distanceKm} km</div>}
        </div>
        {activity.aiTag && <AiTag text={activity.aiTag} />}
        <div className="flex items-center justify-between pt-1">
          <div><span className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary">RM {activity.price}</span><span className="ml-1 text-xs text-muted-foreground">/ person</span></div>
          <Link href={`/customer/activity/${activity.id}`} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white">{activity.requiresBooking ? "Book Now" : "Buy Now"}</Link>
        </div>
      </div>
    </article>
  );
}
