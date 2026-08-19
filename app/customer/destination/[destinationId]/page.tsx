import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, Search, ShieldCheck, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { getPlaceBySlug } from "@/backend/domains/places";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ destinationId: string }>;
}

function slugToState(slug: string): string {
  // "kuala-lumpur" → "Kuala Lumpur", "penang" → "Penang"
  return decodeURIComponent(slug)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stateToSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, "-");
}

const PLACE_FIRST_DESTINATION_SLUGS = new Set(["kuala-lumpur", "putrajaya", "labuan"]);

async function getDestinationData(destinationId: string) {
  const stateName = slugToState(destinationId);
  const destination = MALAYSIA_DESTINATIONS.find(
    (d) => stateToSlug(d.state) === destinationId || d.state === stateName
  );
  if (!destination) return null;

  const db = await createClient();

  // Outlets in this state (via outlet.state field)
  const [{ data: outletRows }, { data: productRows }] = await Promise.all([
    db
      .from("outlets")
      .select(
        "id,name,address,city,state,vendors(id,name,logo_url,status)"
      )
      .eq("state", destination.state)
      .eq("status", "active")
      .limit(8),
    db
      .from("products")
      .select(
        "id,name,base_price,cover_url,product_type,requires_booking,categories(name),outlets(city,state)"
      )
      .eq("status", "active")
      .eq("review_status", "approved")
      // Filter by joining on outlets in this state
      .limit(80),
  ]);

  // Client-side filter for products whose outlet is in this state
  const stateProducts = (productRows ?? []).filter((product) => {
    const outlet = Array.isArray(product.outlets) ? product.outlets[0] : product.outlets;
    return outlet?.state === destination.state;
  }).slice(0, 8);

  return { destination, outlets: outletRows ?? [], products: stateProducts };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { destinationId } = await params;
  const result = await getDestinationData(destinationId);
  if (!result) return { title: "Destination not found" };
  const { destination } = result;
  return {
    title: `${destination.state} — Explore Malaysia on MyWisata`,
    description:
      destination.intro ||
      `Discover experiences, outlets and attractions in ${destination.state}, Malaysia.`,
    openGraph: {
      title: `Explore ${destination.state} | MyWisata`,
      description: destination.intro,
      images: destination.image ? [{ url: destination.image }] : undefined,
    },
  };
}

export default async function DestinationPage({ params }: Props) {
  const { destinationId } = await params;
  const result = await getDestinationData(destinationId);
  if (!result) notFound();

  const { destination, outlets, products } = result;

  // D7: a state renders the new place-first page only once it has places rows;
  // every other state falls through to this page unchanged. No flag day.
  const stateSlug = stateToSlug(destination.state);
  if (PLACE_FIRST_DESTINATION_SLUGS.has(stateSlug) || (await getPlaceBySlug(stateSlug))) {
    redirect(`/customer/place/${stateSlug}`);
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-primary/10">
        {destination.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={destination.image}
            alt={destination.state}
            className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
          <Link
            href="/customer/explore"
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white"
          >
            <ArrowLeft size={15} />
            Back to Explore
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/60">
            {destination.zone}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black text-white sm:text-6xl">
            {destination.state}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">{destination.intro}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {destination.highlights.map((highlight) => (
              <span
                key={highlight}
                className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm"
              >
                {highlight}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/customer/explore`}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-primary shadow-sm transition hover:bg-white/90"
            >
              <MapPin size={15} />
              View on Map
            </Link>
            <Link
              href={`/customer/partners?state=${encodeURIComponent(destination.state)}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/40 bg-white/10 px-5 py-3 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <Search size={15} />
              Find Partners
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 space-y-14">
        {/* Popular Experiences */}
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Things to Do
              </p>
              <h2 className="mt-1 text-2xl font-bold text-foreground">
                Popular Experiences in {destination.state}
              </h2>
            </div>
            <Link
              href={`/customer/explore`}
              className="flex items-center gap-1 text-sm font-semibold text-primary shrink-0"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No experiences listed yet in {destination.state}.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
              {products.map((product) => {
                const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
                const price = Number(product.base_price);
                return (
                  <Link
                    key={product.id}
                href={`/customer/activity/${product.id}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-primary/10">
                      {product.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.cover_url}
                          alt={product.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Star size={24} className="text-primary/30" />
                        </div>
                      )}
                      {category?.name && (
                        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {category.name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="text-sm font-bold text-foreground line-clamp-2">{product.name}</h3>
                      <p className="mt-auto pt-2 text-sm font-bold text-primary">RM {price.toFixed(2)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Local Outlets & Partners */}
        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Local Partners
              </p>
              <h2 className="mt-1 text-2xl font-bold text-foreground">
                Outlets in {destination.state}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Vendors with active outlets in this destination.
              </p>
            </div>
            <Link
              href={`/customer/partners?state=${encodeURIComponent(destination.state)}`}
              className="flex items-center gap-1 text-sm font-semibold text-primary shrink-0"
            >
              All partners <ArrowRight size={14} />
            </Link>
          </div>
          {outlets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No verified outlets in {destination.state} yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {outlets.map((outlet) => {
                const vendor = Array.isArray(outlet.vendors) ? outlet.vendors[0] : outlet.vendors;
                return (
                  <Link
                    key={outlet.id}
                    href={vendor ? `/customer/vendor/${vendor.id}` : `/customer/outlet/${outlet.id}`}
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    {vendor?.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={vendor.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover shrink-0" />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-black text-primary">
                        {(vendor?.name ?? outlet.name).charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{outlet.name}</p>
                      {vendor && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{vendor.name}</p>
                      )}
                      {vendor?.status === "approved" && (
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-primary">
                          <ShieldCheck size={10} />
                          Verified
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Other destinations */}
        <section>
          <h2 className="mb-5 text-xl font-bold text-foreground">Explore More Destinations</h2>
          <div className="flex flex-wrap gap-2">
            {MALAYSIA_DESTINATIONS.filter((d) => d.state !== destination.state)
              .slice(0, 8)
              .map((dest) => (
                <Link
                  key={dest.state}
                  href={`/customer/destination/${stateToSlug(dest.state)}`}
                  className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  {dest.state}
                </Link>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}
