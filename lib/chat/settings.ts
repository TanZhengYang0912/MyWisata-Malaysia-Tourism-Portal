import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_ARCHIVE_DAYS = 90;

/** Reads platform_settings['chat.archive_days'], defaulting to 90 if missing/invalid. */
export async function getChatArchiveDays(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'chat.archive_days')
    .maybeSingle();
  const parsed = data ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ARCHIVE_DAYS;
}
