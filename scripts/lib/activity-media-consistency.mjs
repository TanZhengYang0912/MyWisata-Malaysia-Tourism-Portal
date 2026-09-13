export const ACTIVITY_MEDIA_SCOPE = Object.freeze({
  categories: Object.freeze(["activity", "experience"]),
  statuses: Object.freeze(["active", "approved"]),
});

export const ACTIVITY_NAME_CORRECTIONS = Object.freeze({
  "istanajahar-entry-ticket": "Istana Jahar Museum Entry",
  "istanalama-entry-ticket": "Istana Lama Seri Menanti Museum Entry",
  "lostworld-entry-ticket": "Lost World of Tambun Day Pass",
  "penang-hill-sunrise-ticket": "Penang Hill Sunrise Return Ticket",
  "tamadun-islam-entry-ticket": "Taman Tamadun Islam Entry",
  "taman-ular-entry-ticket": "Taman Ular dan Reptilia Entry",
  "upsidedown-entry-ticket": "Upside Down House Kuching Entry",
});

export const ACTIVITY_MEDIA_CORRECTIONS = Object.freeze({
  "bukit-nanas-canopy-walk-guided-trek": "bukit-nanas-canopy-walk-guided-trek.jpg",
  "central-market-craft-culture-walk": "central-market-craft-culture-walk.jpg",
  "escape-day-pass": "escape-day-pass-corrected.jpg",
  "istanajahar-entry-ticket": "istanajahar-entry-ticket-corrected.jpg",
  "istanalama-entry-ticket": "istanalama-entry-ticket-corrected.jpg",
  "jalan-alor-heritage-food-walk": "jalan-alor-heritage-food-walk.jpg",
  "jalan-alor-street-food-crawl": "jalan-alor-street-food-crawl.jpg",
  "late-night-hawker-tour": "late-night-hawker-tour.jpg",
  "lostworld-entry-ticket": "lostworld-entry-ticket-corrected.jpg",
  "old-kl-market-heritage-walk": "old-kl-market-heritage-walk.jpg",
  "op-river-cruise-day-ticket": "op-river-cruise-day-ticket-corrected.jpg",
  "penang-hill-sunrise-ticket": "penang-hill-sunrise-ticket-corrected.jpg",
  "skybridge-observation-deck": "skybridge-observation-deck.jpg",
  "taman-ular-entry-ticket": "taman-ular-entry-ticket-corrected.jpg",
  "tamadun-islam-entry-ticket": "tamadun-islam-entry-ticket-corrected.jpg",
  "twin-towers-city-centre-walking-tour": "twin-towers-city-centre-walking-tour.jpg",
  "upsidedown-entry-ticket": "upsidedown-entry-ticket-corrected.jpg",
});

const GENERIC_ACTIVITY_NAMES = new Set(["entry ticket", "sunrise ticket"]);

export function validateActivityMediaRows(rows) {
  const errors = [];

  for (const row of rows) {
    if (!ACTIVITY_MEDIA_SCOPE.categories.includes(row.category_slug)) continue;
    if (!String(row.cover_url ?? "").trim()) errors.push(`${row.slug}: missing cover_url`);
    if (GENERIC_ACTIVITY_NAMES.has(String(row.name ?? "").trim().toLowerCase())) {
      errors.push(`${row.slug}: generic activity name`);
    }
  }

  return errors;
}
