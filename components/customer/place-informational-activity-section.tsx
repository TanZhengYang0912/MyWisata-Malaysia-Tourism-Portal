import { Ticket } from "lucide-react";
import type { PlaceInformationalActivity } from "@/backend/core/types";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";
import { CustomerSectionHeader } from "@/components/customer/customer-page-shell";

type PlaceInformationalActivitySectionProps = {
  activities: PlaceInformationalActivity[];
  eyebrow: string;
  title: string;
  ticketLabel: string;
  informationLabel: string;
  officialInformationLabel: string;
};

/** Official venue activities with no invented supplier or checkout flow: never looks purchasable. */
export function PlaceInformationalActivitySection({
  activities,
  eyebrow,
  title,
  ticketLabel,
  informationLabel,
  officialInformationLabel,
}: PlaceInformationalActivitySectionProps) {
  if (activities.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="place-informational-activities-heading">
      <CustomerSectionHeader id="place-informational-activities-heading" eyebrow={eyebrow} title={title} />

      <div className="grid items-start gap-6 lg:gap-8 lg:grid-cols-2">
        {activities.map((activity) => (
          <PlaceActivityCard
            key={activity.id}
            imageUrl={activity.imageUrl}
            imageAlt={activity.title}
            imageFallback={<Ticket size={24} className="text-primary/30" />}
            tag={activity.activityType === "informational_paid_activity" ? ticketLabel : informationLabel}
            meta={activity.sourceTitle}
            title={activity.title}
            description={activity.description}
            translation={{ entityType: "place_informational_activity", entityId: activity.id, titleField: "title" }}
            footer={<span className="text-xs font-semibold text-muted-foreground">{[officialInformationLabel, activity.priceLabel].filter(Boolean).join(" · ")}</span>}
          />
        ))}
      </div>
    </section>
  );
}
