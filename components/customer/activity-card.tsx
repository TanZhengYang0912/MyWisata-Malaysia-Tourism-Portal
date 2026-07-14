"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Clock, Heart, MapPin, Star } from "lucide-react";
import { useWishlist } from "@/components/providers/wishlist";
import { AiTag } from "./ai-tag";
import type { ComputedActivity } from "@/backend/core/types";

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
    <Link
      href={`/customer/activity/${activity.id}`}
      className="rounded-2xl overflow-hidden cursor-pointer group transition-all duration-200 hover:-translate-y-1 bg-card block"
      style={{ boxShadow: "0 2px 16px rgba(36,49,58,0.08)" }}
    >
      <div className="relative overflow-hidden" style={{ height: 200 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activity.image}
          alt={activity.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundColor: "#C8D8D0" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.5) 0%, transparent 55%)" }} />
        {activity.hot && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-destructive">
            🔥 Trending
          </div>
        )}
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
        {activity.outlet.verified && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-primary">
            <CheckCircle size={9} /> Verified
          </div>
        )}
        {!activity.outlet.open && (
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: "rgba(36,49,58,0.8)" }}>
            Closed
          </div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-bold text-sm leading-snug line-clamp-2 text-foreground">{activity.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin size={11} /> {activity.outlet.city}, {activity.outlet.state}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs">
            <Star size={11} fill="var(--highlight-yellow)" stroke="none" />
            <span className="font-semibold text-foreground">{activity.rating}</span>
            <span className="text-muted-foreground">({activity.reviews})</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={10} /> {activity.duration}
          </div>
          {activity.distanceKm !== undefined && (
            <div className="text-xs text-muted-foreground">{activity.distanceKm} km</div>
          )}
        </div>
        {activity.aiTag && <AiTag text={activity.aiTag} />}
        <div className="flex items-center justify-between pt-1">
          <div>
            <span className="text-lg font-bold text-primary font-[family-name:var(--font-mono)]">RM {activity.price}</span>
            <span className="text-xs ml-1 text-muted-foreground">/ person</span>
          </div>
          <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white">
            {activity.requiresBooking ? "Book Now" : "Buy Now"}
          </span>
        </div>
      </div>
    </Link>
  );
}
