import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getComputedActivity, getBookingSlots, getProductReviews } from "@/backend/domains/catalogue";
import { ActivityReviews } from "@/components/customer/activity-reviews";
import { ExperienceBookingSidebar } from "./experience-booking-sidebar";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ experienceId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { experienceId } = await params;
  const db = await createClient();
  const experience = await getComputedActivity(experienceId, undefined, db);
  if (!experience) return { title: "Experience not found" };
  const vendorName = experience.outlet?.vendorName;
  return {
    title: `${experience.name}${vendorName ? ` by ${vendorName}` : ""} — MyWisata`,
    description:
      experience.description ||
      `Book ${experience.name} on MyWisata — discover local experiences across Malaysia.`,
  };
}

export default async function ExperiencePage({ params }: Props) {
  const { experienceId } = await params;
  const db = await createClient();
  const experience = await getComputedActivity(experienceId, undefined, db);
  
  if (!experience) notFound();

  const [slots, reviews] = await Promise.all([
    experience.requiresBooking ? getBookingSlots(experience.id, db) : Promise.resolve([]),
    getProductReviews(experience.id, db, { outletId: experience.outletId }),
  ]);

  const vendor = {
    id: experience.outlet.vendorId,
    name: experience.outlet.vendorName,
    verified: experience.outlet.verified,
  };
  
  const location = [experience.outlet.city, experience.outlet.state].filter(Boolean).join(", ") || "Malaysia";

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link
          href="/customer/explore"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft size={15} />
          Back to Explore
        </Link>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Main content */}
          <div>
            {/* Cover */}
            <div className="relative aspect-[2] overflow-hidden rounded-3xl bg-primary/10">
              {experience.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={experience.image}
                  alt={experience.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                  <span className="text-4xl font-black text-primary/30">
                    {experience.name.charAt(0)}
                  </span>
                </div>
              )}
            </div>

            {/* Title block */}
            <div className="mt-6">
              {experience.category && (
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  {experience.category}
                </p>
              )}
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
                {experience.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={14} className="text-primary" />
                  {location}
                </span>
                {experience.requiresBooking && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    <Clock size={12} />
                    Bookable experience
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {experience.description && (
              <section className="mt-8">
                <h2 className="text-base font-bold text-foreground">
                  About this experience
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground whitespace-pre-wrap">
                  {experience.description}
                </p>
              </section>
            )}

            {/* Things to Know / Cancellation Policy */}
            <section className="mt-8">
              <h2 className="text-base font-bold text-foreground">Things to Know</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold text-foreground">Cancellation Policy</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Free cancellation up to 24 hours before the experience starts.
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold text-foreground">What to Bring</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Comfortable clothing and a valid ID or booking confirmation.
                  </p>
                </div>
              </div>
            </section>

            {/* Vendor */}
            {vendor.id && (
              <section className="mt-8 rounded-2xl border border-border p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Provided by
                </p>
                <Link
                  href={`/customer/vendor/${vendor.id}`}
                  className="mt-3 flex items-center gap-3 hover:opacity-80"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                    {vendor.name?.charAt(0) || "V"}
                  </span>
                  <div>
                    <p className="font-bold text-foreground">{vendor.name || "Verified Vendor"}</p>
                    {vendor.verified && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-primary">
                        <ShieldCheck size={12} />
                        Verified vendor
                      </p>
                    )}
                  </div>
                </Link>
              </section>
            )}

            {/* Outlet */}
            <section className="mt-4 rounded-2xl border border-border p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Location
              </p>
              <Link
                href={`/customer/outlet/${experience.outletId}`}
                className="mt-2 block hover:opacity-80"
              >
                <p className="font-semibold text-foreground">{experience.outlet.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[experience.outlet.city, experience.outlet.state].filter(Boolean).join(", ")}
                </p>
              </Link>
            </section>
            
            {/* Reviews Section */}
            <section className="mt-10 pt-10 border-t border-border">
              <h2 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)] mb-6">Guest Reviews</h2>
              <ActivityReviews 
                productId={experience.id} 
                rating={experience.rating} 
                totalReviews={experience.reviews} 
                initialReviews={reviews} 
              />
            </section>
          </div>

          <ExperienceBookingSidebar 
            experience={experience} 
            slots={slots} 
            outletId={experience.outletId} 
          />
        </div>
      </div>
    </main>
  );
}
