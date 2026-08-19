import type { Metadata } from "next";
import { getServerTranslation } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { getComputedActivity } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import { SavedHubClient } from "../wishlist/wishlist-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return { title: t("ui.saved.metadataTitle"), description: t("ui.saved.metadataDescription") };
}

export default async function SavedPage() {
  const { t } = await getServerTranslation("customer");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <EmptyState title={t("ui.saved.signInTitle")} description={t("ui.saved.signInDescription")} />;
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
    return <EmptyState title={t("ui.wishlist.unavailable")} description={t("ui.wishlist.tryAgain")} />;
  }

  const activities = (await Promise.all((rows ?? []).map((row) => getComputedActivity(row.product_id, undefined, supabase))))
    .filter((activity): activity is NonNullable<typeof activity> => activity !== null);

  const destinations = destinationError ? [] : (destinationRows ?? []).map((row) => ({ state: row.destination_state, savedAt: row.created_at }));

  return <SavedHubClient activities={activities} destinations={destinations} />;
}
