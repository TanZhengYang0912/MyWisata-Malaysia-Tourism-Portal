import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';

export type PortalWorkload = 'kyc_upload' | 'recommendation_upload' | 'trip_ai' | 'kyc_preview';
const limits: Record<PortalWorkload, number> = { kyc_upload: 1, recommendation_upload: 2, trip_ai: 2, kyc_preview: 0 };
const active: Record<PortalWorkload, number> = { kyc_upload: 0, recommendation_upload: 0, trip_ai: 0, kyc_preview: 0 };
export class WorkloadUnavailableError extends Error {
  constructor(public code: 'busy' | 'unavailable') { super(`workload_${code}`); }
}

/** No waiting list. DB admission coordinates instances; the local guard also
 * protects a process during a failed/unknown release or an expired lease. */
export async function withPortalWorkload<T>(scope: PortalWorkload, work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (scope === 'kyc_preview') {
    const integer = (name: string) => {
      const value = Number(process.env[name]);
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    };
    const total = integer('KYC_OCR_TOTAL_MAX_CONCURRENT');
    const formalReserve = integer('KYC_OCR_FORMAL_RESERVE');
    const preview = integer('KYC_OCR_PREVIEW_MAX_CONCURRENT');
    const formalWorker = integer('KYC_PRESCREENING_MAX_RUNNING');
    if (process.env.KYC_OCR_PREVIEW_ENABLED !== 'true' || !total || !formalReserve || !preview || !formalWorker
      || formalReserve < formalWorker || preview > total - formalReserve) throw new WorkloadUnavailableError('unavailable');
    limits.kyc_preview = preview;
  }
  if (signal?.aborted || active[scope] >= limits[scope]) throw new WorkloadUnavailableError('busy');
  const db = createServiceClient();
  active[scope]++;
  const token = crypto.randomUUID();
  let claimed = false;
  try {
    const { data, error } = await db.rpc('claim_portal_workload', { p_scope: scope, p_token: token }).abortSignal(AbortSignal.timeout(5_000));
    if (error) throw new WorkloadUnavailableError('unavailable');
    if (data !== true) throw new WorkloadUnavailableError('busy');
    claimed = true;
    const deadline = AbortSignal.any([AbortSignal.timeout(45_000), ...(signal ? [signal] : [])]);
    deadline.throwIfAborted();
    return await work(deadline);
  } finally {
    // Never release while native work is still running: await the work above,
    // and give each native/provider operation its own shorter timeout.
    if (claimed) {
      try {
        const { error } = await db.rpc('release_portal_workload', { p_scope: scope, p_token: token }).abortSignal(AbortSignal.timeout(5_000));
        if (error) console.error('portal_workload_release_failed', { scope });
      } catch { console.error('portal_workload_release_failed', { scope }); }
    }
    active[scope]--;
  }
}
