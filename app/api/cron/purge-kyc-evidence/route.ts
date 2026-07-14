import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

const BUCKET = 'kyc-documents';

type PurgeWorkItem = {
  submission_id: string;
  side: 'front' | 'back';
  storage_path: string;
};

/**
 * POST /api/cron/purge-kyc-evidence
 *
 * Claims expired KYC evidence through the service-only RPC, removes each
 * private object, then confirms successful deletions. The response contains
 * aggregate counts only; object paths and identifiers never leave the job.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('purge_expired_kyc_evidence');
  if (error) {
    console.error('[cron/purge-kyc-evidence] claim failed', error.message);
    return NextResponse.json({ error: 'purge_unavailable' }, { status: 500 });
  }

  const worklist = Array.isArray(data) ? (data as PurgeWorkItem[]) : [];
  let purged = 0;
  let failed = 0;

  for (const item of worklist) {
    if (!item || (item.side !== 'front' && item.side !== 'back') ||
        typeof item.submission_id !== 'string' || typeof item.storage_path !== 'string') {
      failed += 1;
      continue;
    }

    const { error: removeError } = await service.storage.from(BUCKET).remove([item.storage_path]);
    if (removeError) {
      failed += 1;
      console.error('[cron/purge-kyc-evidence] object removal failed', removeError.message);
      continue;
    }

    const { data: confirmed, error: confirmError } = await service.rpc('confirm_purged_kyc_evidence', {
      p_submission_id: item.submission_id,
      p_side: item.side,
    });
    if (confirmError || confirmed !== true) {
      failed += 1;
      if (confirmError) console.error('[cron/purge-kyc-evidence] confirmation failed', confirmError.message);
      continue;
    }
    purged += 1;
  }

  return NextResponse.json({ claimed: worklist.length, purged, failed });
}
