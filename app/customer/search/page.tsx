import { createClient } from "@/lib/supabase/server";
import { getVendors, searchActivities } from "@/backend/domains/catalogue";
import { SearchClient } from "./search-client";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const db = await createClient();
  const [results, vendors] = await Promise.all([
    searchActivities({ q: q || undefined }, db),
    getVendors(db),
  ]);
  return <SearchClient initialQuery={q ?? ""} initialResults={results} initialVendors={vendors.filter((vendor) => vendor.status === "approved")} />;
}
