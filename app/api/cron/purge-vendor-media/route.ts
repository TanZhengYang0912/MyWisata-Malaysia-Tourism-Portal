import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { log } from '@/lib/log';

/**
 * Vendor media cleanup sweep (docs/plans/2026-11-14-1610-vendor-media-upload-cleanup.md).
 *
 * Dry-run unless VENDOR_MEDIA_CLEANUP_MODE=delete: a dry run writes nothing
 * and reports what would be deleted. Not scheduled in vercel.json until
 * Phase 3, after the dry-run report has been checked.
 */
const BATCH_LIMIT = 50;
const BUCKETS = new Set(['vendor-products', 'event-posters']);
// Registered paths always start with the owning vendor id; never accept traversal.
const SAFE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._\/-]+$/;

type SweepRow = { object_id: string; bucket: string; storage_path: string; claim_token: string | null; action: 'delete' | 'keep_referenced' | 'keep_recent' };

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return apiFail('UNAUTHORIZED', 'Unauthorized', 401);

  const isDryRun = process.env.VENDOR_MEDIA_CLEANUP_MODE !== 'delete';
  const service = createServiceClient();
  const { data, error } = await service.rpc('claim_vendor_media_cleanup', { p_limit: BATCH_LIMIT, p_dry_run: isDryRun });
  if (error || !Array.isArray(data)) return apiFail('CLEANUP_UNAVAILABLE', 'Vendor media cleanup could not start', 503);
  const rows = data as SweepRow[];
  const candidates = rows.filter((row) => row.action === 'delete');
  const summary = {
    dryRun: isDryRun,
    checked: rows.length,
    referencedSkipped: rows.filter((row) => row.action === 'keep_referenced').length,
    recentSkipped: rows.filter((row) => row.action === 'keep_recent').length,
    deleted: 0,
    failed: 0,
  };

  if (isDryRun) {
    log('info', '[vendor-media-cleanup] dry run', { ...summary, wouldDelete: candidates.map((row) => `${row.bucket}/${row.storage_path}`) });
    return apiOk({ ...summary, wouldDelete: candidates.map((row) => ({ bucket: row.bucket, path: row.storage_path })) });
  }

  for (const row of candidates) {
    const isSafe = BUCKETS.has(row.bucket) && SAFE_PATH.test(row.storage_path) && !row.storage_path.includes('..') && row.claim_token;
    // An unsafe row is released back (not deleted) so a human can inspect it.
    const removed = isSafe
      ? await service.storage.from(row.bucket).remove([row.storage_path]).catch(() => ({ error: { message: 'storage_remove_failed' } }))
      : { error: { message: 'unsafe_path' } };
    const { data: finished, error: finishError } = await service.rpc('finish_vendor_media_cleanup', {
      p_object_id: row.object_id,
      p_claim_token: row.claim_token,
      p_succeeded: !removed.error,
    });
    if (!removed.error && !finishError && finished === true) summary.deleted++;
    else summary.failed++;
  }
  if (summary.failed) log('error', '[vendor-media-cleanup] partial failure', summary);
  return apiOk(summary);
}

// Vercel Cron invokes GET.
export const GET = POST;
