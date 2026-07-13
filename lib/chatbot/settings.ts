// P4 — Chatbot platform_settings reads. Mirrors lib/affiliate/settings.ts's
// pattern (per-key default fallback, never a hardcoded threshold in the
// calling code) but kept in this domain since it's chatbot-specific.

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SIMILARITY_THRESHOLD = 0.75;

/** Reads platform_settings['chatbot.similarity_threshold'], defaulting to 0.75 if missing/invalid. */
export async function getSimilarityThreshold(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'chatbot.similarity_threshold')
    .maybeSingle();
  const parsed = data ? parseFloat(data.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_SIMILARITY_THRESHOLD;
}
