// Vendor Side-Event Promotion — public customer-facing read.
// See Docs/plans/2026-09-28-0237-vendor-side-event-promotion.md.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMalaysiaDateInputValue } from '@/lib/datetime/date-input';

export interface FeaturedEventPromotion {
  id: string;
  vendorId: string;
  vendorName: string;
  title: string;
  details: string;
  startDate: string;
  endDate: string;
  posterUrl: string;
}

type FeaturedEventPromotionRow = {
  id: string;
  vendor_id: string;
  title: string;
  details: string;
  starts_on: string;
  ends_on: string;
  poster_url: string;
  vendors: { name: string } | { name: string }[] | null;
};

function vendorName(vendors: FeaturedEventPromotionRow['vendors']): string {
  const row = Array.isArray(vendors) ? vendors[0] : vendors;
  return row?.name ?? '';
}

/**
 * Paid, not-yet-ended event promotions only. The base table is not publicly
 * readable (it holds amount and Stripe fields), so pass the service client; only
 * the listing columns below are ever selected. Promotions whose date range has
 * already ended are excluded — the "featured" surface shouldn't show what's
 * already over.
 */
export async function getFeaturedEventPromotions(db: SupabaseClient, limit = 8): Promise<FeaturedEventPromotion[]> {
  // ends_on is a Malaysia calendar date; a UTC "today" kept ended promotions listed until 08:00 MYT.
  const today = getMalaysiaDateInputValue();
  const { data, error } = await db
    .from('vendor_event_promotions')
    .select('id,vendor_id,title,details,starts_on,ends_on,poster_url,vendors(name)')
    .eq('status', 'paid')
    .gte('ends_on', today)
    .order('starts_on', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load featured event promotions: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as unknown as FeaturedEventPromotionRow;
    return {
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: vendorName(r.vendors),
      title: r.title,
      details: r.details,
      startDate: r.starts_on,
      endDate: r.ends_on,
      posterUrl: r.poster_url,
    };
  });
}
