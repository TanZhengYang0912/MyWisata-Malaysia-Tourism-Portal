import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type KycServiceOperation = 'document.view' | 'confirmation.stage' | 'confirmation.lookup' | 'resolution.confirmation.stage' | 'evidence.revision';

export type KycServiceOperationTicket = {
  ticketId: string;
  reviewVersion: number;
  evidenceRevision: string;
};

/** Database derives actor and session from the authenticated JWT; callers only select the operation scope. */
export async function issueKycServiceOperationTicket(
  db: SupabaseClient,
  input: {
    submissionId: string;
    action: KycServiceOperation;
    expectedVersion?: number;
    side?: 'front' | 'back';
    targetId?: string;
    purpose?: 'primary' | 'independent_second';
  },
): Promise<KycServiceOperationTicket | null> {
  const { data, error } = await db.rpc('issue_kyc_service_operation_ticket', {
    p_submission_id: input.submissionId,
    p_action: input.action,
    p_expected_version: input.expectedVersion ?? null,
    p_side: input.side ?? null,
    p_target_id: input.targetId ?? null,
    p_purpose: input.purpose ?? null,
  });
  if (error || !data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (typeof value.ticketId !== 'string' || typeof value.reviewVersion !== 'number'
    || !Number.isSafeInteger(value.reviewVersion) || typeof value.evidenceRevision !== 'string') return null;
  return {
    ticketId: value.ticketId,
    reviewVersion: value.reviewVersion,
    evidenceRevision: value.evidenceRevision,
  };
}
