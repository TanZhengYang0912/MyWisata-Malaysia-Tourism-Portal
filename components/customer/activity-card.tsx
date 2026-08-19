"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Accessibility, CheckCircle, Clock, Heart, ImageOff, MapPin, Star, Store } from "lucide-react";
import { useWishlist } from "@/components/providers/wishlist";
import { AiTag } from "./ai-tag";
import { ShareButton } from "@/components/shared/share-button";
import type { ComputedActivity } from "@/backend/core/types";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { buildActivityPath } from "@/lib/customer/navigation-context";

export function ActivityCard({ activity, recommendationReason, returnTo }: { activity: ComputedActivity; recommendationReason?: string; returnTo?: string }) {
  const [saving, setSaving] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { savedIds, toggleSaved } = useWishlist();
  const saved = savedIds.has(activity.id);
  const imageSrc = activity.image?.trim();
  const activityHref = buildActivityPath(activity.id, returnTo);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageFailed(false);
  }, [imageSrc]);

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
      className="mw-card group transition-all duration-200 hover:-translate-y-1"
    >
      <div className="mw-card-media">
        <Link href={activityHref} className="block h-full" aria-label={`View ${activity.name}`}>
          {!imageSrc || imageFailed ? (
            <div
              role="img"
              aria-label={`${activity.name} image unavailable`}
              className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-amber-50 text-primary"
            >
              <ImageOff size={30} strokeWidth={1.5} aria-hidden="true" />
              <span className="mt-2 text-xs font-bold">{activity.category || "Experience"}</span>
              <span className="mt-0.5 text-[10px] text-slate-500">Image unavailable</span>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageSrc}
              alt={activity.name}
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              style={{ backgroundColor: "#EEF2FF" }}
            />
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(36,49,58,0.5) 0%, transparent 55%)" }} />
          {activity.hot && <div className="absolute left-3 top-3 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">🔥 Trending</div>}
          {activity.outlet.verified && <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white"><CheckCircle size={9} /> Verified</div>}
          {activity.outlet.wheelchairAccessible === true && <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white" title="Wheelchair accessible"><Accessibility size={9} /> Accessible</div>}
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
        <div className="absolute right-3 top-12">
          <ShareButton compact shareType="product" contentId={activity.id} title={activity.name} />
        </div>
      </div>
      <div className="mw-card-body space-y-2 p-4">
        <Link href={activityHref} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
          <h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={activity.name}>{activity.name}</h3>
          <div className="mw-card-meta mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={11} /> {activity.outlet.city}, {activity.outlet.state}</div>
        </Link>
        <Link href={getOutletShopHref(activity.outlet.id)} className="mw-card-meta flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-primary" title={`Visit shop · ${activity.outlet.vendorName ?? "Local vendor"}`}>
          <Store size={11} /> <span className="truncate">Visit shop · {activity.outlet.vendorName ?? "Local vendor"}</span>
        </Link>
        <div className="flex min-h-5 items-center gap-3">
          <div className="flex items-center gap-1 text-xs"><Star size={11} fill="var(--highlight-yellow)" stroke="none" /><span className="font-semibold text-foreground">{activity.rating}</span><span className="text-muted-foreground">({activity.reviews})</span></div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={10} /> {activity.duration}</div>
          {activity.distanceKm !== undefined && <div className="text-xs text-muted-foreground">{activity.distanceKm} km</div>}
        </div>
        {(activity.aiTag || recommendationReason) && <AiTag text={recommendationReason ?? activity.aiTag ?? ""} />}
        <div className="mw-card-footer pt-1">
          <div><span className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary">RM {activity.price}</span><span className="ml-1 text-xs text-muted-foreground">/ person</span></div>
          <Link href={activityHref} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white">{activity.requiresBooking ? "Book Now" : "Buy Now"}</Link>
        </div>
      </div>
    </article>
  );
}
