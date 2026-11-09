import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { log } from '@/lib/log';
import { getRequestId } from '@/lib/request-id';
import { startKycPurgeRun, finishKycPurgeRun, type PurgeRunResult } from '@/lib/kyc/security-monitor';

const BUCKET = 'kyc-documents';
type PurgeWorkItem = { submission_id: string; side: 'front' | 'back'; storage_path: string };

/** Service-only retention job. Persist a heartbeat even when no evidence is due. */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized', requestId }, { status: 401 });
  }

  const service = createServiceClient();
  let runId: string;
  try { runId = await startKycPurgeRun(service); }
  catch { return NextResponse.json({ error: 'purge_record_unavailable', requestId }, { status: 503 }); }

  const result: PurgeRunResult = { claimed: 0, purged: 0, failed: 0, failureCode: null };
  let operationsMarkedForReconciliation = 0;
  let operationsPurged = 0;
  let status = 200;
  try {
    const { data, error } = await service.rpc('purge_expired_kyc_evidence');
    if (error || !Array.isArray(data)) {
      result.failureCode = 'claim_failed';
      status = 500;
    } else {
      const worklist = data as PurgeWorkItem[];
      result.claimed = worklist.length;
      for (const item of worklist) {
        if (!item || (item.side !== 'front' && item.side !== 'back') ||
            typeof item.submission_id !== 'string' || typeof item.storage_path !== 'string') {
          result.failed += 1;
          result.failureCode ??= 'invalid_work_item';
          continue;
        }
        const { error: removeError } = await service.storage.from(BUCKET).remove([item.storage_path]);
        if (removeError) {
          result.failed += 1;
          result.failureCode ??= 'storage_failed';
          continue;
        }
        const { data: confirmed, error: confirmError } = await service.rpc('confirm_purged_kyc_evidence', {
          p_submission_id: item.submission_id, p_side: item.side,
        });
        if (confirmError || confirmed !== true) {
          result.failed += 1;
          result.failureCode ??= 'confirmation_failed';
          continue;
        }
        result.purged += 1;
      }
      if (result.failed > 0) status = 502;
    }
  } catch {
    result.failed = result.claimed - result.purged;
    result.failureCode = 'unexpected_error';
    status = 500;
  }

  try {
    const { data, error } = await service.rpc('purge_kyc_draft_ocr_operations', { p_limit: 500 });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row || !Number.isSafeInteger(row.marked_for_reconciliation) || !Number.isSafeInteger(row.deleted)) {
      result.failureCode ??= 'operation_cleanup_failed';
      status = 500;
    } else {
      operationsMarkedForReconciliation = row.marked_for_reconciliation;
      operationsPurged = row.deleted;
    }
  } catch {
    result.failureCode ??= 'operation_cleanup_failed';
    status = 500;
  }

  try { await finishKycPurgeRun(service, runId, result); }
  catch {
    log('error', '[cron/purge-kyc-evidence] run persistence failed', { requestId });
    return NextResponse.json({ error: 'purge_record_unavailable', requestId }, { status: 503 });
  }
  if (result.failureCode) log('error', '[cron/purge-kyc-evidence] run failed', { requestId, failureCode: result.failureCode });
  return NextResponse.json({ claimed: result.claimed, purged: result.purged, failed: result.failed,
    operationsMarkedForReconciliation, operationsPurged, requestId }, { status });
}

export const GET = POST;
