import { redirect } from "next/navigation";

// /customer/search is now /customer/partners per the restructure plan.
// Preserve any existing bookmarks or inbound links by redirecting permanently.
export default function SearchRedirectPage() {
  redirect("/customer/partners");
}

