import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Place } from "@/backend/core/types";
import { getServerTranslation } from "@/lib/i18n/server";

/** Root-first trail from getPlaceAncestors(): [state, region, poi]. */
export async function PlaceBreadcrumb({ trail }: { trail: Place[] }) {
  const { t } = await getServerTranslation("customer");
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Link href="/customer/explore" className="font-semibold hover:text-foreground">
        {t("ui.place.all")}
      </Link>
      {trail.map((step, index) => (
        <span key={step.id} className="flex items-center gap-1">
          <ChevronRight size={12} />
          {index === trail.length - 1 ? (
            <span className="font-bold text-foreground">{step.name}</span>
          ) : (
            <Link href={`/customer/place/${step.slug}`} className="font-semibold hover:text-foreground">
              {step.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
