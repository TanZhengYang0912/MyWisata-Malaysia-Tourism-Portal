import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const BATCH_LIMIT = 50;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return apiFail('UNAUTHORIZED', 'Unauthorized', 401);
  const service = createServiceClient();
  const { data, error } = await service.rpc('claim_profile_avatar_cleanup', { p_limit: BATCH_LIMIT });
  if (error || !Array.isArray(data)) return apiFail('CLEANUP_UNAVAILABLE', 'Avatar cleanup could not start', 503);
  let deleted = 0;
  let failed = 0;
  for (const row of data as Array<{ asset_id: string; storage_path: string; claim_token: string }>) {
    const result = await service.storage.from('avatars').remove([row.storage_path]).catch(() => ({ error: { message: 'storage_remove_failed' } }));
    const { data: finished, error: finishError } = await service.rpc('finish_profile_avatar_cleanup', {
      p_asset_id: row.asset_id, p_claim_token: row.claim_token, p_succeeded: !result.error,
    });
    if (!result.error && !finishError && finished === true) deleted++;
    else failed++;
  }
  if (failed) console.error('profile_avatar_cleanup_partial_failure', { claimed: data.length, deleted, failed });
  return apiOk({ claimed: data.length, deleted, failed });
}

// Vercel Cron invokes GET; POST stays for manual runs.
export const GET = POST;
