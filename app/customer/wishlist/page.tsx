import { redirect } from "next/navigation";

// /customer/wishlist is now /customer/saved per the restructure plan.
// Keep this redirect for backward compatibility with existing bookmarks/links.
export default function WishlistRedirectPage() {
  redirect("/customer/saved");
}
