import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingSlots, getComputedActivity, getProductReviews } from "@/backend/domains/catalogue";
import { guestLoginHref, guestVendorHref } from "@/lib/auth/guest-mode";
import { createClient } from "@/lib/supabase/server";

type GuestActivityPageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function GuestActivityPage({ params }: GuestActivityPageProps) {
  const { id } = await params;
  const db = await createClient();
  const activity = await getComputedActivity(id, undefined, db);
  if (!activity) notFound();

  const [slots, reviews] = await Promise.all([
    activity.requiresBooking ? getBookingSlots(activity.id, db) : Promise.resolve([]),
    getProductReviews(activity.id, db),
  ]);
  const actionLabel = activity.requiresBooking ? "Sign in to book" : "Sign in to purchase";

  return <main className="mx-auto max-w-4xl px-6 py-10">
    <Link href="/guest/explore" className="text-sm font-semibold text-primary underline underline-offset-4">← Back to listings</Link>
    <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {activity.image ? <>
        {/* Guest listings support vendor-uploaded storage URLs, which are not statically enumerable for next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={activity.image} alt="" className="h-72 w-full object-cover" />
      </> : null}
      <div className="p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{activity.category || "Experience"}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">{activity.name}</h1>
        <p className="mt-3 text-muted-foreground">{activity.description || "Discover this Malaysian experience."}</p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3"><div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</dt><dd className="mt-1 font-semibold">{activity.outlet.city}, {activity.outlet.state}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</dt><dd className="mt-1 font-[family-name:var(--font-mono)] text-lg font-bold text-primary">RM {activity.price}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</dt><dd className="mt-1"><Link href={guestVendorHref(activity.outlet.vendorId)} className="font-semibold text-primary underline underline-offset-4">{activity.outlet.vendorName || "View vendor"}</Link></dd></div></dl>
        <Link href={guestLoginHref(`/customer/activity/${activity.id}`)} className="mt-7 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{actionLabel}</Link>
      </div>
    </div>
    {slots.length > 0 ? <section className="mt-8 rounded-2xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Upcoming availability</h2><p className="mt-2 text-sm text-muted-foreground">{slots.length} available session{slots.length === 1 ? "" : "s"}. Sign in to choose a time.</p></section> : null}
    <section className="mt-8 rounded-2xl border border-border bg-card p-6"><h2 className="text-xl font-bold">Guest reviews</h2>{reviews.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No public reviews yet.</p> : <div className="mt-4 space-y-4">{reviews.map((review) => <article key={review.id} className="border-t border-border pt-4 first:border-t-0 first:pt-0"><p className="font-semibold">{review.title || "Guest review"}</p><p className="mt-1 text-sm text-muted-foreground">{review.body}</p></article>)}</div>}</section>
  </main>;
}
