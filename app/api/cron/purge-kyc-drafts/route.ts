import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const positiveInteger = (name: string, maximum: number) => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
};

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return apiFail('UNAUTHORIZED', 'Unauthorized', 401);
  const batch = positiveInteger('KYC_DRAFT_PURGE_BATCH_SIZE', 100);
  const lease = positiveInteger('KYC_DRAFT_PURGE_LEASE_SECONDS', 300);
  if (!batch || !lease) return apiFail('PURGE_DISABLED', 'Draft cleanup is not configured', 503);
  const service = createServiceClient();
  const { data, error } = await service.rpc('claim_kyc_draft_purge', { p_limit: batch, p_lease_seconds: lease });
  if (error || !Array.isArray(data)) return apiFail('PURGE_UNAVAILABLE', 'Draft cleanup could not start', 503);

  let deleted = 0;
  let failed = 0;
  for (const row of data as Array<{ draft_id: string; front_storage_path: string | null; back_storage_path: string | null; retired_storage_paths: string[] | null }>) {
    const paths = [...new Set([row.front_storage_path, row.back_storage_path, ...(row.retired_storage_paths ?? [])]
      .filter((path): path is string => typeof path === 'string'))];
    const storageResult = paths.length ? await service.storage.from('kyc-documents').remove(paths).catch(() => ({ error: { message: 'remove_failed' } })) : { error: null };
    const removed = !storageResult.error;
    const { data: finished, error: finishError } = await service.rpc('finish_kyc_draft_purge', {
      p_draft_id: row.draft_id, p_succeeded: removed,
    });
    if (!finishError && finished === true && removed) deleted++;
    else failed++;
  }
  const { data: orphanRows, error: orphanError } = await service.rpc('claim_kyc_draft_cleanup_orphans', { p_limit: batch, p_lease_seconds: lease });
  if (orphanError || !Array.isArray(orphanRows)) failed++;
  else for (const orphan of orphanRows as Array<{ orphan_id: string; storage_path: string }>) {
    const removed = await service.storage.from('kyc-documents').remove([orphan.storage_path]).catch(() => ({ error: { message: 'remove_failed' } }));
    const { data: finished, error: finishError } = await service.rpc('finish_kyc_draft_cleanup_orphan', {
      p_orphan_id: orphan.orphan_id, p_succeeded: !removed.error,
    });
    if (!finishError && finished === true && !removed.error) deleted++;
    else failed++;
  }
  if (failed) console.error('kyc_draft_purge_partial_failure', { failed, deleted });
  return apiOk({ claimed: data.length, deleted, failed });
}
