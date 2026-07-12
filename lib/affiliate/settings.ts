// P4 — Shared platform_settings reads.

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_COOKIE_DAYS = 30;

/** Reads platform_settings['affiliate.cookie_days'], defaulting to 30 if missing/invalid. */
export async function getAttributionCookieDays(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'affiliate.cookie_days')
    .maybeSingle();
  const parsed = data ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COOKIE_DAYS;
}
