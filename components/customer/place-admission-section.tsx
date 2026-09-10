import Link from "next/link";
import { Ticket } from "lucide-react";
import type { PlaceProduct } from "@/backend/core/types";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import { formatMYRNumber } from "@/lib/i18n/format";
import { getServerTranslation } from "@/lib/i18n/server";

/**
 * Entry tickets are deliberately separate from the activity grid: admission is
 * a precondition for a visit, whereas tours and add-ons are optional choices.
 */
export async function PlaceAdmissionSection({
  tickets,
  returnTo,
}: {
  tickets: PlaceProduct[];
  returnTo: string;
}) {
  const { t } = await getServerTranslation("customer");

  return (
    <section className="mt-10" aria-labelledby="place-admission-heading">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
        {t("ui.placeAdmission.tiers")}
      </p>
      <h2
        id="place-admission-heading"
        className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
      >
        {t("ui.placeAdmission.title")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("ui.placeAdmission.summary")}</p>

      <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
        {tickets.map(({ product, vendor }) => (
          <article
            key={product.id}
            className="flex flex-col rounded-2xl border border-primary/25 bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                  <Ticket size={14} aria-hidden="true" />
                  {t("ui.place.relations.admission")}
                </span>
                <h3 className="mt-2 text-lg font-bold leading-tight text-foreground">{product.name}</h3>
                <p className="mt-1 text-xs font-semibold text-primary">
                  {t("ui.placeAdmission.soldBy", { name: vendor.name })}
                </p>
              </div>
              <p className="shrink-0 text-right text-sm font-bold text-foreground">
                {product.price === 0
                  ? t("ui.placeAdmission.free")
                  : t("ui.placeAdmission.price", { value: formatMYRNumber(product.price) })}
              </p>
            </div>

            {product.variants.length > 1 && (
              <dl className="mt-4 grid gap-1.5 border-t border-border pt-4 text-xs">
                {product.variants.map((variant) => (
                  <div key={variant.id} className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{variant.label}</dt>
                    <dd className="font-bold text-foreground">
                      {product.price + variant.priceDelta === 0
                        ? t("ui.placeAdmission.free")
                        : t("ui.placeAdmission.price", {
                            value: formatMYRNumber(product.price + variant.priceDelta),
                          })}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <Link
              href={buildActivityPath(product.id, returnTo)}
              className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t(product.requiresBooking ? "ui.place.reserveSpot" : "ui.place.availablePurchase")}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
