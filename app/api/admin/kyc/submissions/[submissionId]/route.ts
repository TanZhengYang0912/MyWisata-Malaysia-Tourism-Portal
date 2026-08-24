import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ADMIN_KYC_SUBMISSION_DETAIL_SELECT,
  mapAdminKycSubmissionDetail,
  type AdminKycSubmissionDetailRow,
} from '@/lib/kyc/admin-submission';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Props {
  params: Promise<{ submissionId: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: canReview, error: capabilityError } = await authenticated.rpc('can_review_kyc', {
    uid: user.id,
  });
  if (capabilityError || canReview !== true) {
    return apiFail('FORBIDDEN', 'KYC reviewer role required', 403);
  }

  const { submissionId } = await params;
  if (!UUID.test(submissionId)) return apiFail('NOT_FOUND', 'KYC submission not found', 404);

  const service = createServiceClient();
  const { data: submissionRow, error: submissionError } = await service
    .from('kyc_submissions')
    .select(ADMIN_KYC_SUBMISSION_DETAIL_SELECT)
    .eq('id', submissionId)
    .maybeSingle();
  if (submissionError) return apiFail('SUBMISSION_LOOKUP_FAILED', 'Unable to load KYC submission', 500);
  if (!submissionRow) return apiFail('NOT_FOUND', 'KYC submission not found', 404);

  const submission = mapAdminKycSubmissionDetail(submissionRow as AdminKycSubmissionDetailRow);
  const { data: customerRow, error: customerError } = await service
    .from('users')
    .select('id,email,full_name')
    .eq('id', submission.userId)
    .maybeSingle();
  if (customerError) return apiFail('CUSTOMER_LOOKUP_FAILED', 'Unable to load KYC customer', 500);
  if (!customerRow) return apiFail('NOT_FOUND', 'KYC submission not found', 404);

  const { data: claimData, error: claimError } = await authenticated.rpc('claim_kyc_submission', {
    p_submission_id: submissionId,
  });
  if (claimError) return apiFail('ASSIGNMENT_FAILED', 'Unable to claim KYC submission', 409);

  const { data: eventRows, error: eventsError } = await service
    .from('kyc_review_events')
    .select('id,from_status,to_status,action,actor_id,actor_role,reason_category,internal_note,customer_message,created_at')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: true });
  if (eventsError) return apiFail('REVIEW_EVENTS_FAILED', 'Unable to load KYC review history', 500);

  const claim = claimData as {
    assignedTo?: string | null;
    claimedAt?: string | null;
    isAssignedToActor?: boolean;
    canDecide?: boolean;
  } | null;
  const name = submission.legalIdentity.fullName?.trim() || customerRow.full_name?.trim() || submission.legalIdentity.email || customerRow.email;
  const email = submission.legalIdentity.email || customerRow.email;
  return apiOk({
    submission,
    customer: {
      id: customerRow.id,
      name,
      email,
      avatarInitial: name.charAt(0).toUpperCase() || '?',
    },
    assignment: {
      assignedTo: claim?.assignedTo ?? submission.assignedTo,
      claimedAt: claim?.claimedAt ?? submission.claimedAt,
      isAssignedToCurrentUser: claim?.isAssignedToActor === true,
      canDecide: claim?.canDecide === true,
    },
    reviewEvents: (eventRows ?? []).map((event) => ({
      id: event.id,
      fromStatus: event.from_status,
      toStatus: event.to_status,
      action: event.action,
      actorId: event.actor_id,
      actorRole: event.actor_role,
      reasonCategory: event.reason_category,
      internalNote: event.internal_note ?? null,
      customerMessage: event.customer_message ?? null,
      createdAt: event.created_at,
    })),
  });
}
