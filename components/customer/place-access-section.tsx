import { Compass } from "lucide-react";
import type { PlaceAccess } from "@/backend/core/types";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";

type PlaceAccessSectionProps = {
  accesses: PlaceAccess[];
  title: string;
  freeLabel: string;
  freeToExplore: string;
};

/** Server-rendered so verified public access adds no client-side catalogue work. */
export function PlaceAccessSection({ accesses, title, freeLabel, freeToExplore }: PlaceAccessSectionProps) {
  if (accesses.length === 0) return null;

  return (
    <section className="mt-10" aria-labelledby="place-access-heading">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{freeLabel}</p>
        <h2 id="place-access-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h2>
      </div>

      <div className="mt-6 grid items-stretch gap-6 lg:gap-8 lg:grid-cols-2">
        {accesses.map((access) => (
          <PlaceActivityCard
            key={access.id}
            imageUrl={access.imageUrl}
            imageAlt={access.title}
            imageFallback={<Compass size={24} className="text-primary/30" />}
            badge={<><Compass size={14} aria-hidden="true" />{freeLabel}</>}
            title={access.title}
            supportingText={access.sourceTitle}
            price={<span className="text-xs font-bold text-emerald-700">{freeLabel}</span>}
            description={access.description}
            footer={freeToExplore}
          />
        ))}
      </div>
    </section>
  );
}
