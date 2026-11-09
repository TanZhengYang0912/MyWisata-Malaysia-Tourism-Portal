import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';

export type PurgeFailureCode = 'claim_failed' | 'storage_failed' | 'confirmation_failed' | 'invalid_work_item' | 'unexpected_error' | 'operation_cleanup_failed';
export type PurgeRunResult = { claimed: number; purged: number; failed: number; failureCode: PurgeFailureCode | null };

export async function startKycPurgeRun(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.rpc('start_kyc_purge_run');
  if (error || typeof data !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
    throw new Error('purge_record_unavailable');
  }
  return data;
}

export async function finishKycPurgeRun(db: SupabaseClient, runId: string, result: PurgeRunResult): Promise<void> {
  const { error } = await db.rpc('finish_kyc_purge_run', {
    p_run_id: runId, p_claimed: result.claimed, p_purged: result.purged,
    p_failed: result.failed, p_failure_code: result.failureCode,
  });
  if (error) throw new Error('purge_record_unavailable');
}

export async function checkKycSecurityHealth(): Promise<void> {
  const { data, error } = await createServiceClient().rpc('check_kyc_security_health');
  if (error || data?.checked !== true) throw new Error('kyc_monitor_unavailable');
}
