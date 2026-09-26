"use client";

import { useState } from "react";
import { Info, MapPin, Ticket } from "lucide-react";
import type { PlaceInformationalActivity } from "@/backend/core/types";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PlaceDetail = {
  difficulty?: string;
  duration?: string;
  bestTime?: string;
  gettingThere?: string;
} | null;

type VenueDetails = {
  name: string;
  location: string;
  entry: string;
  detail: PlaceDetail;
};

type DetailsLabels = {
  venue: string;
  location: string;
  entry: string;
  source: string;
  difficulty: string;
  duration: string;
  bestTime: string;
  gettingThere: string;
};

type PlaceInformationalActivitySectionProps = {
  activities: PlaceInformationalActivity[];
  eyebrow: string;
  title: string;
  ticketLabel: string;
  informationLabel: string;
  venueDetailsLabel: string;
  venueDetailsHint: string;
  venue: VenueDetails;
  detailsLabels: DetailsLabels;
};

/** Official venue activities with no invented supplier or checkout flow. */
export function PlaceInformationalActivitySection({
  activities,
  eyebrow,
  title,
  ticketLabel,
  informationLabel,
  venueDetailsLabel,
  venueDetailsHint,
  venue,
  detailsLabels,
}: PlaceInformationalActivitySectionProps) {
  const [selectedActivity, setSelectedActivity] = useState<PlaceInformationalActivity | null>(null);

  if (activities.length === 0) return null;

  const optionalVenueDetails = venue.detail ? [
    [detailsLabels.difficulty, venue.detail.difficulty],
    [detailsLabels.duration, venue.detail.duration],
    [detailsLabels.bestTime, venue.detail.bestTime],
    [detailsLabels.gettingThere, venue.detail.gettingThere],
  ].filter((detail): detail is [string, string] => Boolean(detail[1])) : [];

  return (
    <section className="mt-10" aria-labelledby="place-informational-activities-heading">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 id="place-informational-activities-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h2>
      </div>

      <div className="mt-6 grid items-stretch gap-6 lg:gap-8 lg:grid-cols-2">
        {activities.map((activity) => (
          <PlaceActivityCard
            key={activity.id}
            imageUrl={activity.imageUrl}
            imageAlt={activity.title}
            imageFallback={<Ticket size={24} className="text-primary/30" />}
            badge={<><Ticket size={14} aria-hidden="true" />{activity.activityType === "informational_paid_activity" ? ticketLabel : informationLabel}</>}
            title={activity.title}
            supportingText={activity.sourceTitle}
            price={activity.priceLabel ? <span className="text-xs font-bold text-foreground">{activity.priceLabel}</span> : null}
            description={activity.description}
            footer={venueDetailsHint}
            action={(
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setSelectedActivity(activity)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 px-3 py-2 text-xs font-bold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {venueDetailsLabel}
                <Info size={14} aria-hidden="true" />
              </button>
            )}
          />
        ))}
      </div>

      <Dialog open={selectedActivity !== null} onOpenChange={(open) => { if (!open) setSelectedActivity(null); }}>
        <DialogContent className="max-h-[min(90svh,760px)] overflow-y-auto rounded-3xl p-0 sm:max-w-2xl">
          {selectedActivity && (
            <div>
              {selectedActivity.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedActivity.imageUrl} alt={selectedActivity.title} className="h-48 w-full object-cover sm:h-60" />
              ) : (
                <div className="flex h-28 items-center justify-center bg-secondary text-primary/70" aria-hidden="true">
                  <Ticket size={28} />
                </div>
              )}

              <div className="space-y-5 p-5 sm:p-7">
                <DialogHeader className="space-y-2 pr-8 text-left">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-bold text-primary">
                    <Ticket size={14} aria-hidden="true" />
                    {selectedActivity.activityType === "informational_paid_activity" ? ticketLabel : informationLabel}
                  </span>
                  <DialogTitle className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">
                    {selectedActivity.title}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-6 sm:text-base">
                    {selectedActivity.description}
                  </DialogDescription>
                </DialogHeader>

                <dl className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{detailsLabels.venue}</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">{venue.name}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <MapPin size={13} aria-hidden="true" />{detailsLabels.location}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">{venue.location}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">{detailsLabels.entry}</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">{venue.entry}</dd>
                  </div>
                  {selectedActivity.priceLabel && (
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">{ticketLabel}</dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">{selectedActivity.priceLabel}</dd>
                    </div>
                  )}
                  {optionalVenueDetails.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>

                <p className="border-t border-border pt-4 text-xs text-muted-foreground">
                  {detailsLabels.source}: <span className="font-semibold text-foreground">{selectedActivity.sourceTitle}</span>
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
