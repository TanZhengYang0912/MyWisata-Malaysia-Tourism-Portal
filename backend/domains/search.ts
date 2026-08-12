import { SupabaseClient } from "@supabase/supabase-js";

import { getVendors, searchActivities, STATES_MY } from "./catalogue";
import { ComputedActivity, VendorSummary } from "../core/types";

export type GlobalSearchResult = {
  destinations: string[];
  experiences: ComputedActivity[];
  vendors: VendorSummary[];
};

export async function performGlobalSearch(query: string, db: SupabaseClient): Promise<GlobalSearchResult> {
  const normalizedQuery = query.trim().toLowerCase();
  
  if (!normalizedQuery) {
    return { destinations: [], experiences: [], vendors: [] };
  }

  // 1. Destinations (States for now)
  const destinations = STATES_MY.filter(state => 
    state.toLowerCase().includes(normalizedQuery) && state !== "All Malaysia"
  );

  // 2. Experiences
  const experiences = await searchActivities({ q: query }, db);

  // 3. Vendors
  const allVendors = await getVendors(db);
  const vendors = allVendors.filter(vendor => 
    vendor.name.toLowerCase().includes(normalizedQuery) ||
    vendor.outlets.some(outlet => 
      (outlet.city?.toLowerCase() ?? "").includes(normalizedQuery) ||
      (outlet.state?.toLowerCase() ?? "").includes(normalizedQuery)
    )
  ).slice(0, 5); // Limit to top 5 matching vendors for the search dropdown

  return {
    destinations,
    experiences: experiences.slice(0, 5), // Limit to top 5 experiences
    vendors
  };
}
