import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CitySuggestion } from "@/lib/location/city-types";
import { isCountryCode } from "@/lib/location/countries";

type SearchCityRow = {
  id: string;
  name: string;
  admin1_code: string | null;
  country_code: string;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const countryCode = url.searchParams.get("country")?.trim().toUpperCase() ?? "";
  if (query.length < 2 || query.length > 100 || !isCountryCode(countryCode) || /[%_]/.test(query)) {
    return NextResponse.json({ error: "Invalid city search" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("search_location_cities", {
    p_country_code: countryCode,
    p_query: query,
    p_limit: 5,
  });
  if (error) {
    return NextResponse.json({ error: "City suggestions are unavailable" }, { status: 503 });
  }

  const suggestions: CitySuggestion[] = ((data ?? []) as SearchCityRow[]).slice(0, 5).map((row) => ({
    id: row.id,
    name: row.name,
    admin1Code: row.admin1_code,
    countryCode: row.country_code,
  }));
  return NextResponse.json({ data: suggestions });
}
