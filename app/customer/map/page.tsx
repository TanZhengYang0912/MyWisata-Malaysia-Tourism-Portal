import { redirect } from "next/navigation";

// /customer/map is now /customer/trip per the restructure plan.
// Keep this redirect for backward compatibility with any existing bookmarks or links.
export default function MapRedirectPage() {
  redirect("/customer/trip");
}
