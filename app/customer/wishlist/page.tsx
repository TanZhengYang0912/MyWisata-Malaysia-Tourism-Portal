import Link from "next/link";
import { Heart } from "lucide-react";
import { getComputedActivity } from "@/backend/domains/catalogue";
import { ActivityCard } from "@/components/customer/activity-card";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/server";

export default async function WishlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState title="Sign in to view saved experiences" description="Save your favourite Malaysia experiences and find them here later." />;
  }

  const { data: rows, error } = await supabase
    .from("customer_wishlists")
    .select("product_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return <EmptyState title="Saved experiences unavailable" description="Please try again in a moment." />;
  }

  const activities = (await Promise.all((rows ?? []).map((row) => getComputedActivity(row.product_id, undefined, supabase))))
    .filter((activity): activity is NonNullable<typeof activity> => activity !== null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Heart size={17} fill="currentColor" />
            <span className="text-xs font-bold uppercase tracking-[0.16em]">Your shortlist</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground sm:text-3xl">Saved Experiences</h1>
          <p className="mt-1 text-sm text-muted-foreground">Keep the places you want to remember for your next Malaysia trip.</p>
        </div>
        <Link href="/customer" className="hidden rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-primary transition hover:bg-secondary sm:inline-flex">
          Explore more
        </Link>
      </div>

      {activities.length === 0 ? (
        <EmptyState title="No saved experiences yet" description="Tap the heart on any experience to build your travel shortlist." action={<Link href="/customer" className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Explore Malaysia</Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
          {activities.map((activity) => <ActivityCard key={activity.id} activity={activity} returnTo="/customer/saved" />)}
        </div>
      )}
    </div>
  );
}
