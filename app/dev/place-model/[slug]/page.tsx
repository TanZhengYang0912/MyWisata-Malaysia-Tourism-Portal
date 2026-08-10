// DEV ONLY — ONE page component serves all three levels (state / region / poi).
// That is the whole argument for a single self-referencing `places` table: the
// "unified layout" survives, only the sections shown differ by level.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, Compass, MapPin, Mountain, Route, Ticket } from "lucide-react";
import {
  getPlace,
  getChildren,
  getAncestors,
  getPlaceProducts,
  getNearbyOutlets,
  getVendor,
  RELATION_LABEL,
  VENDOR_TYPE_LABEL,
  type DevPlace,
  type DevOutlet,
  type DevVendor,
} from "@/lib/dev/place-fixtures";

interface Props {
  params: Promise<{ slug: string }>;
}

function OutletRow({ outlet, vendor, distance }: { outlet: DevOutlet; vendor: DevVendor; distance: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
        {VENDOR_TYPE_LABEL[vendor.type]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{outlet.name}</p>
        <p className="truncate text-xs text-muted-foreground">{vendor.name}</p>
      </div>
      <p className="shrink-0 text-xs font-bold text-muted-foreground">{distance}</p>
    </div>
  );
}

/** A state centre is arbitrary, so widen the radius as the level gets coarser. */
function nearbyRadiusKm(level: DevPlace["level"]): number {
  if (level === "poi") return 8;
  if (level === "region") return 15;
  return 80;
}

/** Closer than this and an outlet is ON the place, not near it. */
const ON_SITE_KM = 0.4;

function entryLabel(place: DevPlace): { text: string; tone: string } {
  if (place.entryFee === null) return { text: "No gate", tone: "bg-muted text-muted-foreground" };
  if (place.entryFee === 0) return { text: "Free entry", tone: "bg-emerald-100 text-emerald-800" };
  return { text: `RM${place.entryFee} entry`, tone: "bg-amber-100 text-amber-900" };
}

export default async function DevPlacePage({ params }: Props) {
  const { slug } = await params;
  const place = getPlace(slug);
  if (!place) notFound();

  const trail = getAncestors(place.id);
  const children = getChildren(place.id);
  const products = getPlaceProducts(place.id);
  const nearby = getNearbyOutlets(place, nearbyRadiusKm(place.level));
  const operator = place.managedByVendorId ? getVendor(place.managedByVendorId) : undefined;
  const entry = entryLabel(place);

  // A street IS the attraction, and its shops sit on it. Listing them as
  // "0.1 km away" reads wrong, so a POI splits its outlets into what is
  // physically on it and what is merely near it.
  const onSite = place.level === "poi" ? nearby.filter((item) => item.km <= ON_SITE_KM) : [];
  const around = nearby.filter((item) => !onSite.includes(item));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Breadcrumb — the hierarchy made visible */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link href="/dev/place-model" className="font-semibold hover:text-foreground">
          All
        </Link>
        {trail.map((step) => (
          <span key={step.id} className="flex items-center gap-1">
            <ChevronRight size={12} />
            {step.id === place.id ? (
              <span className="font-bold text-foreground">{step.name}</span>
            ) : (
              <Link href={`/dev/place-model/${step.id}`} className="font-semibold hover:text-foreground">
                {step.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Hero — same markup at every level */}
      <header className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {place.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.image} alt={place.name} className="h-44 w-full object-cover sm:h-56" />
        )}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              {place.level}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${entry.tone}`}>
              {entry.text}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {operator ? `Operated by ${operator.name}` : "No operator"}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{place.name}</h1>
          <p className="mt-1 text-sm font-semibold text-primary">{place.tagline}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{place.intro}</p>
        </div>
      </header>

      {/* Level-specific: the next level down */}
      {children.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {place.level === "state" ? `${children.length} regions` : `${children.length} places to visit`}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {children.map((child) => {
              const childEntry = entryLabel(child);
              const childProducts = getPlaceProducts(child.id);
              return (
                <Link
                  key={child.id}
                  href={`/dev/place-model/${child.id}`}
                  className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-foreground">{child.name}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${childEntry.tone}`}>
                      {childEntry.text}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{child.tagline}</p>
                  {child.level === "poi" && (
                    <p className="mt-2 text-[11px] font-semibold text-primary">
                      {childProducts.length === 0
                        ? "No vendor sells here"
                        : `${childProducts.length} vendor ${childProducts.length === 1 ? "option" : "options"}`}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* POI-only: the practical detail a vendor page has no field for */}
      {place.detail && (
        <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Know before you go</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {place.detail.difficulty && (
              <div className="flex gap-2">
                <Mountain size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Difficulty</dt>
                  <dd className="text-sm text-foreground">{place.detail.difficulty}</dd>
                </div>
              </div>
            )}
            {place.detail.duration && (
              <div className="flex gap-2">
                <Clock size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Duration</dt>
                  <dd className="text-sm text-foreground">{place.detail.duration}</dd>
                </div>
              </div>
            )}
            {place.detail.bestTime && (
              <div className="flex gap-2">
                <Compass size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Best time</dt>
                  <dd className="text-sm text-foreground">{place.detail.bestTime}</dd>
                </div>
              </div>
            )}
            {place.detail.gettingThere && (
              <div className="flex gap-2">
                <Route size={15} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Getting there</dt>
                  <dd className="text-sm text-foreground">{place.detail.gettingThere}</dd>
                </div>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* The strong link — vendors selling AT this place */}
      {place.level === "poi" && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {products.length === 0
              ? "Nobody sells anything here"
              : `${products.length} ${products.length === 1 ? "option" : "options"} from ${new Set(products.map((entry) => entry.vendor.id)).size} vendors`}
          </h2>

          {products.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Free, unmanaged and unsold — and it still gets a page, a map pin and a
              spot in someone&apos;s trip. This is the row the current schema cannot store.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {products.map(({ product, vendor, relation }) => (
                <div key={product.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">{product.name}</p>
                      <p className="mt-0.5 text-xs font-semibold text-primary">{vendor.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{vendor.blurb}</p>
                      {product.note && <p className="mt-1 text-xs text-muted-foreground">{product.note}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-foreground">
                        {product.price === 0 ? "Free" : `RM${product.price}`}
                      </p>
                      {product.duration && <p className="text-[11px] text-muted-foreground">{product.duration}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                      <Ticket size={11} />
                      {RELATION_LABEL[relation]}
                    </span>
                    {/* Says only where the VENDOR is. Whether the product is a
                        service is a separate axis (products.product_type) — BOH
                        runs a free factory tour and still has premises. */}
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {vendor.hasOutlets ? "Sold at their own outlet" : "No premises — meets on site"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* On the place itself — a street's own shops */}
      {onSite.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {onSite.length} businesses on {place.name}
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {onSite.map(({ outlet, vendor }) => (
              <OutletRow key={outlet.id} outlet={outlet} vendor={vendor} distance="On site" />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
            The street is the place; these are ordinary outlets standing on it. Both
            rows exist, and neither has to pretend to be the other.
          </p>
        </section>
      )}

      {/* The weak link — whatever happens to be near, computed by distance */}
      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Nearby, within {nearbyRadiusKm(place.level)} km
        </h2>
        {around.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No other outlets in range.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {around.map(({ outlet, vendor, km }) => (
              <OutletRow key={outlet.id} outlet={outlet} vendor={vendor} distance={`${km.toFixed(1)} km`} />
            ))}
          </div>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
          <MapPin size={12} className="mt-0.5 shrink-0" />
          Computed from coordinates, not a foreign key. Nothing to maintain, and it
          crosses district and state boundaries — which a parent/child lookup cannot.
        </p>
      </section>
    </div>
  );
}
