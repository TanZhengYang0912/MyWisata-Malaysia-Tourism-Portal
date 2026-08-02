"use client";

import { useMemo, useState } from "react";
import { MalaysiaDistrictMap, type DistrictCounts } from "@/components/demo-map/malaysia-district-map";

/** One listing, flattened on the server — the demo only needs these fields. */
export interface DemoListing {
  id: string;
  name: string;
  category: string;
  city: string;
  stateId: string;
  districtId: string | null;
  districtName: string | null;
  price: number;
  rating: number;
  reviews: number;
  vendorName: string;
}

export function DemoExploreClient({ listings }: { listings: DemoListing[] }) {
  const [stateId, setStateId] = useState<string | null>(null);
  const [districtId, setDistrictId] = useState<string | null>(null);

  const counts = useMemo<DistrictCounts>(() => {
    const next: DistrictCounts = {};
    for (const listing of listings) {
      const state = (next[listing.stateId] ??= { "": 0 });
      state[""] += 1;
      if (listing.districtId) state[listing.districtId] = (state[listing.districtId] ?? 0) + 1;
    }
    return next;
  }, [listings]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Prototype · not linked from the app</p>
      <h1 className="mt-1 text-3xl font-bold text-foreground font-[family-name:var(--font-display)]">
        State → District → Listing
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Tap a state to drill into its districts (Daerah), then tap a district to narrow in.
        Counts are live from the database; district is derived from each outlet&apos;s city until
        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">outlets.district</code>
        exists.
      </p>

      <div className="mt-6">
        <MalaysiaDistrictMap
          counts={counts}
          stateId={stateId}
          districtId={districtId}
          onSelectState={(next) => { setStateId(next); setDistrictId(null); }}
          onSelectDistrict={setDistrictId}
        />
      </div>
    </main>
  );
}
