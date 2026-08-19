import { redirect } from "next/navigation";
import { getServerTranslation } from "@/lib/i18n/server";

// /customer/wishlist is now /customer/saved per the restructure plan.
// Keep this redirect for backward compatibility with existing bookmarks/links.
export default async function WishlistRedirectPage() {
  const { t } = await getServerTranslation("customer");
  void t("ui.wishlist.title");
  redirect("/customer/saved");
}
