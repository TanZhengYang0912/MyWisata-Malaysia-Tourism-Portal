// One component, all three levels (state / region / poi) — the same argument
// validated in the /dev/place-model prototype: a single self-referencing
// `places` table means the unified layout survives, only the sections shown
// differ by level. See docs/plans/2026-08-12-2152-penang-place-model-and-data-reset.md §5.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowUpRight, Clock, Compass, MapPin, Mountain, Route } from "lucide-react";
import {
  getPlaceBySlug,
  getPlaceChildren,
  getPlaceAncestors,
  getPlaceAccesses,
  getPlaceInformationalActivities,
  getRegionsWithPois,
  getPlaceProducts,
  getNearbyOutlets,
} from "@/backend/domains/places";
import { getVendors } from "@/backend/domains/catalogue";
import { PlaceBreadcrumb } from "@/components/customer/place-breadcrumb";
import { PlaceCard } from "@/components/customer/place-card";
import { PlaceList } from "@/components/customer/place-list";
import { PlaceActivitySection } from "@/components/customer/place-activity-section";
import { PlaceAccessSection } from "@/components/customer/place-access-section";
import { PlaceInformationalActivitySection } from "@/components/customer/place-informational-activity-section";
import { PlaceCommunitySection } from "@/components/customer/place-community-section";
import { NearbyOutlets } from "@/components/customer/nearby-outlets";
import type { Place } from "@/backend/core/types";
import { getPlaceHeroImage } from "@/lib/customer/place-hero-image";
import { getMalaysiaStateTranslationKey } from "@/lib/i18n/malaysia-states";
import { getServerTranslation } from "@/lib/i18n/server";
import { formatMYRNumber } from "@/lib/i18n/format";
import { BRAND_NAME, MYR_CODE } from "@/lib/i18n/invariant-tokens";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

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
  const stateKey = getMalaysiaStateTranslationKey(place.state);
  const stateLabel = stateKey ? t(stateKey) : place.state;
  const heroImage = getPlaceHeroImage(place);
  return {
    title: t("ui.place.metaTitle", { name: place.name }),
    description: place.intro ?? place.tagline ?? t("ui.place.metaDescription", { name: place.name, state: stateLabel }),
    openGraph: {
      title: `${place.name} | ${BRAND_NAME}`,
      description: place.intro ?? undefined,
      images: heroImage ? [{ url: heroImage }] : undefined,
    },
  };
}

export default async function PlacePage({ params }: Props) {
  const { slug } = await params;
  const place = await getPlaceBySlug(slug);
  if (!place) notFound();
  const { t } = await getServerTranslation("customer");
  const stateKey = getMalaysiaStateTranslationKey(place.state);
  const stateLabel = stateKey ? t(stateKey) : place.state;
  const heroImage = getPlaceHeroImage(place);

  const [trail, children, regionGroups, accesses, informationalActivities, products, nearby, vendors] = await Promise.all([
    getPlaceAncestors(slug),
    getPlaceChildren(place.id),
    place.level === "state" ? getRegionsWithPois(place.slug) : Promise.resolve([]),
    place.level === "poi" ? getPlaceAccesses(place.id) : Promise.resolve([]),
    place.level === "poi" ? getPlaceInformationalActivities(place.id) : Promise.resolve([]),
    place.level === "poi" ? getPlaceProducts(place.id) : Promise.resolve([]),
    getNearbyOutlets({ lat: place.lat, lng: place.lng }, nearbyRadiusKm(place.level)),
    getVendors(),
  ]);

  const operator = place.managedByVendorId ? vendors.find((v) => v.id === place.managedByVendorId) : undefined;
  const entry = place.entryFee === null
    ? { text: t("ui.place.noGate"), tone: "bg-muted text-muted-foreground" }
    : place.entryFee === 0
      ? { text: t("ui.place.freeEntry"), tone: "bg-emerald-100 text-emerald-800" }
      : { text: t("ui.place.entryFee", { price: formatMYRNumber(place.entryFee) }), tone: "bg-amber-100 text-amber-900" };

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

  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;

  // The operating vendor's outlet IS this place — "Kek Lok Si Temple — Main
  // Entrance · 0.0 km" under Nearby businesses on Kek Lok Si Temple's own page
  // is a tautology, not a recommendation. Plan D2.
  const nearbyBusinesses = place.managedByVendorId
    ? nearby.filter((entry) => entry.outlet.vendorId !== place.managedByVendorId)
    : nearby;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PlaceBreadcrumb trail={trail} />

      {/* Hero — keep the place identity and first decision in one visual frame. */}
      <header className="relative mt-3 min-h-[330px] overflow-hidden rounded-[1.75rem] border border-border bg-primary shadow-lg sm:min-h-[390px]">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImage} alt={place.name} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-slate-700" aria-hidden="true" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-slate-950/5" aria-hidden="true" />
        <div className="relative flex min-h-[330px] flex-col justify-end p-5 sm:min-h-[390px] sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              {t(`ui.place.levels.${place.level}`)}
            </span>
            <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${entry.tone}`}>
              {entry.text}
            </span>
            {operator && <span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
              {t("ui.place.operatedBy", { name: operator.name })}
            </span>}
          </div>
          <h1 className="mt-4 max-w-4xl font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-white sm:text-6xl">{place.name}</h1>
          {place.tagline && <p className="mt-2 max-w-2xl text-base font-semibold text-white/90 sm:text-lg">{place.tagline}</p>}
          {place.intro && <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75 sm:text-base">{place.intro}</p>}
        </div>
      </header>

      <section className="-mt-5 relative mx-3 rounded-2xl border border-border bg-card p-4 shadow-md sm:mx-6 sm:p-5" aria-label={`${place.name} visitor information`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className={`grid gap-4 text-sm sm:gap-8 ${operator ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <div className="flex items-start gap-2.5">
              <MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("ui.labels.location")}</p>
                <p className="mt-1 font-semibold text-foreground">{place.district ? `${place.district}, ${stateLabel}` : stateLabel}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 text-base font-bold text-primary" aria-hidden="true">{MYR_CODE}</span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("strictMigration.place.entry")}</p>
                <p className="mt-1 font-semibold text-foreground">{entry.text}</p>
              </div>
            </div>
            {operator && <div className="flex items-start gap-2.5">
              <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("ui.search.localPartner")}</p>
                <p className="mt-1 font-semibold text-foreground">{operator.name}</p>
              </div>
            </div>}
          </div>
          <a href={directionsHref} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-primary/20 px-4 py-2.5 text-sm font-bold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            {t("ui.actions.getDirections")} <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

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

      {/* POI: vendor options, grouped by relation type through the filterable section. */}
      {place.level === "poi" && (
        accesses.length > 0 || informationalActivities.length > 0 || products.length > 0 ? (
          <>
            <PlaceAccessSection
              accesses={accesses}
              title={t("ui.place.activitiesHere")}
              freeLabel={t("ui.place.freeEntry")}
              freeToExplore={t("ui.labels.freeToExplore")}
            />
            <PlaceInformationalActivitySection
              activities={informationalActivities}
              eyebrow={t("ui.outlet.planVisit")}
              title={t("ui.placeActivity.title")}
              ticketLabel={t("ui.placeActivity.ticketRequired")}
              informationLabel={t("ui.placeActivity.venueInformation")}
              venueDetailsLabel={t("ui.placeActivity.venueDetails")}
            />
            {products.length > 0 && <PlaceActivitySection products={products} returnTo={`/customer/place/${slug}`} />}
          </>
        ) : (
          <section className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">{t("ui.place.activitiesHere")}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("ui.place.freeUnmanaged")}</p>
          </section>
        )
      )}

      <PlaceCommunitySection placeId={place.id} placeName={place.name} />

      <NearbyOutlets outlets={nearbyBusinesses} maxRadiusKm={nearbyRadiusKm(place.level)} />
    </div>
  );
}
