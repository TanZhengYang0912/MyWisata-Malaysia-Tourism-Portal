export interface PublicOutletEmptyState {
  title: string;
  body: string;
}

export function selectPublicOutletProductIds(featuredIds: string[], sellableIds: string[]) {
  const sellable = new Set(sellableIds);
  const selected = featuredIds.filter((id) => sellable.has(id));
  return selected.length > 0 ? selected : sellableIds;
}

export function getPublicOutletEmptyState(kind: 'products' | 'gallery'): PublicOutletEmptyState {
  if (kind === 'gallery') {
    return {
      title: 'Photos coming soon',
      body: 'The outlet team is preparing a closer look at this place.',
    };
  }

  return {
    title: 'Experiences coming soon',
    body: 'This outlet is preparing its bookable experiences. Check back soon for local favourites.',
  };
}
