import { Compass } from "lucide-react";
import type { PlaceAccess } from "@/backend/core/types";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";
import { CustomerSectionHeader } from "@/components/customer/customer-page-shell";

type PlaceAccessSectionProps = {
  accesses: PlaceAccess[];
  title: string;
  freeLabel: string;
};

/** Server-rendered so verified public access adds no client-side catalogue work. */
export function PlaceAccessSection({ accesses, title, freeLabel }: PlaceAccessSectionProps) {
  if (accesses.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="place-access-heading">
      <CustomerSectionHeader id="place-access-heading" eyebrow={freeLabel} title={title} />

      <div className="grid items-start gap-6 lg:gap-8 lg:grid-cols-2">
        {accesses.map((access) => (
          <PlaceActivityCard
            key={access.id}
            imageUrl={access.imageUrl}
            imageAlt={access.title}
            imageFallback={<Compass size={24} className="text-primary/30" />}
            tag={freeLabel}
            meta={access.sourceTitle}
            title={access.title}
            description={access.description}
            footer={<span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{freeLabel}</span>}
          />
        ))}
      </div>
    </section>
  );
}
