const DEFAULT_MINIMUM_ACTIVITIES = 3;

function isActiveRow(row) {
  return row?.status === undefined || row.status === "active";
}

function comparePlaces(left, right) {
  return left.state.localeCompare(right.state)
    || left.name.localeCompare(right.name)
    || left.slug.localeCompare(right.slug);
}

/**
 * Produces a source-agnostic POI audit shared by local-manifest and persisted
 * catalogue checks. Keeping the state grouping here prevents a missing
 * migration from being mistaken for a research gap.
 */
export function buildVerifiedPlaceActivityCoverage({
  places,
  accessRows,
  informationalRows,
  minimumActivities = DEFAULT_MINIMUM_ACTIVITIES,
}) {
  const activePois = (places ?? [])
    .filter((place) => place?.status === "active" && place?.level === "poi")
    .map((place) => ({
      id: place.id,
      slug: place.slug,
      name: place.name?.trim() || place.slug,
      state: place.state?.trim() || "Unspecified",
    }));
  const poiById = new Map(activePois.map((place) => [place.id, place]));
  const counts = new Map(activePois.map((place) => [place.id, 0]));

  for (const row of [...(accessRows ?? []), ...(informationalRows ?? [])]) {
    if (!isActiveRow(row) || !poiById.has(row?.place_id)) continue;
    counts.set(row.place_id, (counts.get(row.place_id) ?? 0) + 1);
  }

  const placesWithCounts = activePois
    .map((place) => ({ ...place, count: counts.get(place.id) ?? 0 }))
    .sort(comparePlaces);
  const belowMinimum = placesWithCounts
    .filter((place) => place.count < minimumActivities)
    .map(({ slug, state, count }) => ({ slug, state, count }));
  const byState = new Map();

  for (const place of placesWithCounts) {
    const state = byState.get(place.state) ?? { state: place.state, activePois: 0, completedPois: 0, activityTotal: 0, belowMinimum: [] };
    state.activePois += 1;
    state.activityTotal += place.count;
    if (place.count >= minimumActivities) state.completedPois += 1;
    else state.belowMinimum.push({ slug: place.slug, count: place.count });
    byState.set(place.state, state);
  }

  const stateCoverage = [...byState.values()]
    .sort((left, right) => left.state.localeCompare(right.state))
    .map((state) => ({
      ...state,
      belowMinimumCount: state.belowMinimum.length,
    }));

  return {
    activePois: activePois.length,
    activityTotal: placesWithCounts.reduce((total, place) => total + place.count, 0),
    belowMinimumCount: belowMinimum.length,
    belowMinimum,
    stateCoverage,
  };
}
