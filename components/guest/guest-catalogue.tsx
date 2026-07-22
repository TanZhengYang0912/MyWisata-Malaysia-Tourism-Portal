import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import { guestVendorHref } from "@/lib/auth/guest-mode";
import type { ComputedActivity } from "@/backend/core/types";

type GuestCatalogueProps = {
  activities: ComputedActivity[];
  error?: string;
};

export function GuestCatalogue({ activities, error }: GuestCatalogueProps) {
  if (error) {
    return <main className="mx-auto max-w-3xl px-6 py-20 text-center"><h1 className="text-2xl font-bold">Unable to load listings</h1><p className="mt-2 text-muted-foreground">{error}</p><Link href="/guest/explore" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Try again</Link></main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Discover Malaysia</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold">Browse vendors and listings</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">You are browsing as a guest. Sign in when you are ready to book or purchase.</p>

      {activities.length === 0 ? <section className="mt-10 rounded-2xl border border-border bg-card p-10 text-center"><h2 className="text-xl font-bold">No listings available</h2><p className="mt-2 text-muted-foreground">Please check back later.</p></section> : (
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((activity) => <article key={activity.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="h-44 bg-secondary">
              {activity.image ? <>
                {/* Guest catalogue supports vendor-uploaded storage URLs, which are not statically enumerable for next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activity.image} alt="" className="h-full w-full object-cover" />
              </> : null}
            </div>
            <div className="space-y-3 p-5">
              <div><p className="text-xs font-semibold text-primary">{activity.category || "Experience"}</p><h2 className="mt-1 line-clamp-2 text-lg font-bold">{activity.name}</h2></div>
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} />{activity.outlet.city}, {activity.outlet.state}</p>
              <p className="font-[family-name:var(--font-mono)] text-lg font-bold text-primary">RM {activity.price}</p>
              <div className="flex flex-wrap gap-3 text-sm font-semibold"><Link href={`/guest/activity/${activity.id}`} className="text-primary underline underline-offset-4">View listing</Link><Link href={guestVendorHref(activity.outlet.vendorId)} className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-4"><Store size={14} />View vendor</Link></div>
            </div>
          </article>)}
        </section>
      )}
    </main>
  );
}
