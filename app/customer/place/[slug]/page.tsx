// One component, all three levels (state / region / poi) — the same argument
// validated in the /dev/place-model prototype: a single self-referencing
// `places` table means the unified layout survives, only the sections shown
// differ by level. See docs/plans/2026-08-12-2152-penang-place-model-and-data-reset.md §5.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Compass, Mountain, Route, Ticket } from "lucide-react";
import {
  getPlaceBySlug,
  getPlaceChildren,
  getPlaceAncestors,
  getRegionsWithPois,
  getPlaceProducts,
  getNearbyOutlets,
} from "@/backend/domains/places";
import { getVendors } from "@/backend/domains/catalogue";
import { PlaceBreadcrumb } from "@/components/customer/place-breadcrumb";
import { PlaceCard } from "@/components/customer/place-card";
import { PlaceList } from "@/components/customer/place-list";
import { NearbyOutlets } from "@/components/customer/nearby-outlets";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import type { Place, PlaceRelation } from "@/backend/core/types";
import { getServerTranslation } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

const RELATION_LABEL: Record<PlaceRelation, string> = {
  admission: "admission",
  guide_service: "guide_service",
  addon: "addon",
};

/** A state centre is arbitrary, so the radius widens as the level gets coarser. */
function nearbyRadiusKm(level: Place["level"]): number {
  if (level === "poi") return 8;
  if (level === "region") return 15;
  return 80;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlaceBySlug(slug);
  const { t } = await getServerTranslation("customer");
  if (!place) return { title: t("ui.place.notFound") };
  return {
    title: t("ui.place.metaTitle", { name: place.name }),
    description: place.intro ?? place.tagline ?? t("ui.place.metaDescription", { name: place.name, state: place.state }),
    openGraph: {
      title: `${place.name} | MyWisata`,
      description: place.intro ?? undefined,
      images: place.imageUrl ? [{ url: place.imageUrl }] : undefined,
    },
  };
}

export default async function PlacePage({ params }: Props) {
  const { slug } = await params;
  const place = await getPlaceBySlug(slug);
  if (!place) notFound();
  const { t } = await getServerTranslation("customer");

  const [trail, children, regionGroups, products, nearby, vendors] = await Promise.all([
    getPlaceAncestors(slug),
    getPlaceChildren(place.id),
    place.level === "state" ? getRegionsWithPois(place.slug) : Promise.resolve([]),
    place.level === "poi" ? getPlaceProducts(place.id) : Promise.resolve([]),
    getNearbyOutlets({ lat: place.lat, lng: place.lng }, nearbyRadiusKm(place.level)),
    getVendors(),
  ]);

  const operator = place.managedByVendorId ? vendors.find((v) => v.id === place.managedByVendorId) : undefined;
  const entry = place.entryFee === null
    ? { text: t("ui.place.noGate"), tone: "bg-muted text-muted-foreground" }
    : place.entryFee === 0
      ? { text: t("ui.place.freeEntry"), tone: "bg-emerald-100 text-emerald-800" }
      : { text: t("ui.place.entryFee", { price: place.entryFee }), tone: "bg-amber-100 text-amber-900" };

  // Product-option counts for every card this page is about to render — one
  // batch of parallel lookups instead of each PlaceCard fetching its own.
  const poisShown = place.level === "state" ? regionGroups.flatMap((group) => group.pois) : place.level === "region" ? children : [];
  const productCounts = new Map(
    await Promise.all(poisShown.map(async (poi) => [poi.id, (await getPlaceProducts(poi.id)).length] as const)),
  );

  // Flattened for PlaceList — region is a filter now, not a grouping axis.
  const regionByPoi: Record<string, string> = {};
  for (const { region, pois } of regionGroups) {
    for (const poi of pois) regionByPoi[poi.id] = region.id;
  }

  const vendorCount = new Set(products.map((entry) => entry.vendor.id)).size;

  // The operating vendor's outlet IS this place — "Kek Lok Si Temple — Main
  // Entrance · 0.0 km" under Nearby businesses on Kek Lok Si Temple's own page
  // is a tautology, not a recommendation. Plan D2.
  const nearbyBusinesses = place.managedByVendorId
    ? nearby.filter((entry) => entry.outlet.vendorId !== place.managedByVendorId)
    : nearby;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <PlaceBreadcrumb trail={trail} />

      {/* Hero — same markup at every level */}
      <header className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {place.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.imageUrl} alt={place.name} className="h-44 w-full object-cover sm:h-56" />
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              {t(`ui.place.levels.${place.level}`, { defaultValue: place.level })}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${entry.tone}`}>
              {entry.text}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {operator ? t("ui.place.operatedBy", { name: operator.name }) : t("ui.place.noOperator")}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{place.name}</h1>
          {place.tagline && <p className="mt-1 text-sm font-semibold text-primary">{place.tagline}</p>}
          {place.intro && <p className="mt-3 text-sm leading-6 text-muted-foreground">{place.intro}</p>}
        </div>
      </header>

      {/* State: places to visit, flat, filterable by region + bookability. */}
      {place.level === "state" && poisShown.length > 0 && (
        <PlaceList
          pois={poisShown}
          productCounts={Object.fromEntries(productCounts)}
          regions={regionGroups.map(({ region }) => ({ id: region.id, name: region.name }))}
          regionByPoi={regionByPoi}
        />
      )}

      {/* Region: places to visit, flat. */}
      {place.level === "region" && children.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("ui.place.placesToVisit", { count: children.length })}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {children.map((child) => (
              <PlaceCard key={child.id} place={child} productCount={productCounts.get(child.id) ?? 0} />
            ))}
          </div>
        </section>
      )}

      {/* POI: know-before-you-go detail. */}
      {place.detail && (
        <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("ui.place.knowBefore")}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {place.detail.difficulty && (
              <div className="flex gap-2">
                <Mountain size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("ui.place.difficulty")}</dt>
                  <dd className="text-sm text-foreground">{place.detail.difficulty}</dd>
                </div>
              </div>
            )}
            {place.detail.duration && (
              <div className="flex gap-2">
                <Clock size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("ui.place.duration")}</dt>
                  <dd className="text-sm text-foreground">{place.detail.duration}</dd>
                </div>
              </div>
            )}
            {place.detail.bestTime && (
              <div className="flex gap-2">
                <Compass size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("ui.place.bestTime")}</dt>
                  <dd className="text-sm text-foreground">{place.detail.bestTime}</dd>
                </div>
              </div>
            )}
            {place.detail.gettingThere && (
              <div className="flex gap-2">
                <Route size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("ui.place.gettingThere")}</dt>
                  <dd className="text-sm text-foreground">{place.detail.gettingThere}</dd>
                </div>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* POI: vendor options, grouped by relation type via the badge on each row. */}
      {place.level === "poi" && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("ui.place.activitiesHere")}</h2>
          {products.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("ui.place.activityCount", { count: products.length })} {t("ui.place.fromLabel")} {t("ui.place.vendorCount", { count: vendorCount })}
            </p>
          )}

          {products.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("ui.place.freeUnmanaged")}
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {products.map(({ product, vendor, relation }) => (
                <Link
                  key={product.id}
                  href={buildActivityPath(product.id, `/customer/place/${slug}`)}
                  className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">{product.name}</p>
                      <p className="mt-0.5 text-xs font-semibold text-primary">{vendor.name}</p>
                      {product.description && <p className="mt-1 text-xs text-muted-foreground">{product.description}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-foreground">{product.price === 0 ? t("ui.labels.freeToExplore") : `RM${product.price}`}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      <Ticket size={11} />
                      {t(`ui.place.relations.${RELATION_LABEL[relation]}`)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <NearbyOutlets outlets={nearbyBusinesses} maxRadiusKm={nearbyRadiusKm(place.level)} />
    </div>
  );
}
