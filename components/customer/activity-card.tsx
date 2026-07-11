"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle, Clock, Heart, MapPin, Star } from "lucide-react";
import { AiTag } from "./ai-tag";
import type { ComputedActivity } from "@/backend/core/types";

export function ActivityCard({ activity }: { activity: ComputedActivity }) {
  const [saved, setSaved] = useState(false);

  return (
    <Link
      href={`/activity/${activity.id}`}
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
          onClick={(e) => {
            e.preventDefault();
            setSaved((v) => !v);
          }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-white/90"
        >
          <Heart size={14} fill={saved ? "#C7363D" : "none"} stroke={saved ? "#C7363D" : "#555"} />
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
            <Star size={11} fill="#F2B84B" stroke="none" />
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
          <span className="px-3 py-1.5 rounded-full text-xs font-bold text-white bg-primary">
            {activity.requiresBooking ? "Book Now" : "Buy Now"}
          </span>
        </div>
      </div>
    </Link>
  );
}
