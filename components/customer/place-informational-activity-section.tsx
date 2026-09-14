import { Ticket } from "lucide-react";
import type { PlaceInformationalActivity } from "@/backend/core/types";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";

type PlaceInformationalActivitySectionProps = {
  activities: PlaceInformationalActivity[];
  eyebrow: string;
  title: string;
  ticketLabel: string;
  informationLabel: string;
  venueDetailsLabel: string;
};

/** Official venue activities with no invented MyWisata supplier or checkout. */
export function PlaceInformationalActivitySection({
  activities,
  eyebrow,
  title,
  ticketLabel,
  informationLabel,
  venueDetailsLabel,
}: PlaceInformationalActivitySectionProps) {
  if (activities.length === 0) return null;

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
            price={<span className="text-xs font-bold text-foreground">{activity.priceLabel ?? informationLabel}</span>}
            description={activity.description}
            footer={venueDetailsLabel}
          />
        ))}
      </div>
    </section>
  );
}
