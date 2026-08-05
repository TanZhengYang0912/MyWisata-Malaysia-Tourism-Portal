import { getComputedActivity } from "@/backend/domains/catalogue";
import { SavedHubClient } from "./wishlist-client";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/server";

export default async function WishlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState title="Sign in to view saved experiences" description="Save your favourite Malaysia experiences and find them here later." />;
  }

  const [{ data: rows, error }, { data: destinationRows, error: destinationError }] = await Promise.all([
    supabase
    .from("customer_wishlists")
    .select("product_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }),
    supabase
      .from("customer_saved_destinations")
      .select("destination_state,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (error) {
    return <EmptyState title="Saved experiences unavailable" description="Please try again in a moment." />;
  }

  const activities = (await Promise.all((rows ?? []).map((row) => getComputedActivity(row.product_id, undefined, supabase))))
    .filter((activity): activity is NonNullable<typeof activity> => activity !== null);

  const destinations = destinationError ? [] : (destinationRows ?? []).map((row) => ({ state: row.destination_state, savedAt: row.created_at }));

  return (
    <SavedHubClient activities={activities} destinations={destinations} />
  );
}
