import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { SearchClient } from "./search-client";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const db = await createClient();
  const results = await searchActivities({ q: q || undefined }, db);
  return <SearchClient initialQuery={q ?? ""} initialResults={results} />;
}
