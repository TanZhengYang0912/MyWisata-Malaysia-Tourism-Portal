"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LocateFixed, Star } from "lucide-react";
import { MapView } from "@/components/map/map-view";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { ComputedActivity } from "@/backend/core/types";

const KL_CENTER: [number, number] = [3.139, 101.6869];
const RADIUS_OPTIONS_KM = [2, 5, 10];

export function MapClient({ initialActivities }: { initialActivities: ComputedActivity[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [radiusKm, setRadiusKm] = useState(5);
  const [activities, setActivities] = useState<ComputedActivity[] | null>(initialActivities);

  // Skip the very first run: the default (no category, no location) listing
  // is already server-rendered via initialActivities. Only refetch once the
  // user changes category or triggers Near Me.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    searchActivities({ category, near: userLoc ?? undefined, sort: userLoc ? "distance_asc" : "recommended" }).then(setActivities);
  }, [category, userLoc]);

  function handleNearMe() {
    if (!navigator.geolocation) {
      setUserLoc(KL_CENTER[0] === 0 ? null : { lat: KL_CENTER[0], lng: KL_CENTER[1] });
      setLocStatus("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("granted");
      },
      () => {
        setUserLoc({ lat: KL_CENTER[0], lng: KL_CENTER[1] });
        setLocStatus("denied");
      },
      { timeout: 5000 },
    );
  }

  const center: [number, number] = userLoc ? [userLoc.lat, userLoc.lng] : KL_CENTER;
  // Radius filter only applies once we actually have the user's location; distanceKm
  // is populated by searchActivities whenever `near` is passed.
  const visibleActivities = userLoc ? (activities ?? []).filter((a) => (a.distanceKm ?? Infinity) <= radiusKm) : activities;
  const pins = (visibleActivities ?? []).map((a) => ({
    id: a.id,
    lat: a.outlet.lat,
    lng: a.outlet.lng,
    label: a.name,
    sublabel: `RM ${a.price} · ${a.outlet.city}`,
    href: `/customer/activity/${a.id}`,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Explore the Map</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-border overflow-hidden text-xs font-semibold">
            {RADIUS_OPTIONS_KM.map((km) => (
              <button
                key={km}
                onClick={() => setRadiusKm(km)}
                className="px-2.5 py-1.5"
                style={{
                  backgroundColor: radiusKm === km ? "var(--primary)" : "transparent",
                  color: radiusKm === km ? "white" : "var(--foreground)",
                }}
              >
                {km}km
              </button>
            ))}
          </div>
          <button
            onClick={handleNearMe}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold text-white bg-primary"
          >
            <LocateFixed size={13} /> Near Me
          </button>
        </div>
      </div>

      {locStatus === "denied" && (
        <p className="text-xs text-muted-foreground mb-3">Location unavailable — showing distance from Kuala Lumpur instead.</p>
      )}

      <div className="relative mb-6">
        <div className="absolute top-3 left-3 right-3 z-10 flex gap-2 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setCategory(null)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm"
            style={{
              borderColor: category === null ? "var(--primary)" : "var(--border)",
              backgroundColor: category === null ? "var(--primary)" : "var(--card)",
              color: category === null ? "white" : "var(--foreground)",
            }}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(category === c.id ? null : c.id)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border shadow-sm whitespace-nowrap"
              style={{
                borderColor: category === c.id ? "var(--primary)" : "var(--border)",
                backgroundColor: category === c.id ? "var(--primary)" : "var(--card)",
                color: category === c.id ? "white" : "var(--foreground)",
              }}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <MapView
          pins={pins}
          center={center}
          zoom={userLoc ? 12 : 7}
          height={420}
          cluster
          radiusCenter={userLoc ? [userLoc.lat, userLoc.lng] : undefined}
          radiusKm={userLoc ? radiusKm : undefined}
        />
      </div>

      {visibleActivities === null ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : visibleActivities.length === 0 ? (
        <EmptyState title="No nearby results" description="Try a different category, a wider radius, or reset your filters." />
      ) : (
        <div className="space-y-2">
          {visibleActivities.map((a) => (
            <Link
              key={a.id}
              href={`/customer/activity/${a.id}`}
              className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt={a.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.outlet.city}, {a.outlet.state}
                  {a.distanceKm !== undefined && ` · ${a.distanceKm} km away`}
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs shrink-0">
                <Star size={11} fill="#F2B84B" stroke="none" />
                <span className="font-semibold text-foreground">{a.rating}</span>
              </div>
              <p className="text-sm font-bold text-primary font-[family-name:var(--font-mono)] shrink-0">RM {a.price}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
