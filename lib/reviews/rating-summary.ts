// Shared rounded-average-rating helper. Originally private to
// app/api/share-image/[type]/[id]/route.tsx; extracted so OG/share-preview
// metadata (lib/affiliate/activity-metadata.ts, the vendor/outlet page
// generateMetadata()s, lib/affiliate/redirect.ts's crawler preview) can show
// the same real rating the share-image card already does — never a
// fabricated number, null when there are zero visible reviews.

export async function ratingFromRows(rows: Array<{ rating: number }>): Promise<{ rating: number | null; reviewCount: number }> {
  if (rows.length === 0) return { rating: null, reviewCount: 0 };
  const rating = Math.round((rows.reduce((sum, r) => sum + Number(r.rating), 0) / rows.length) * 10) / 10;
  return { rating, reviewCount: rows.length };
}
