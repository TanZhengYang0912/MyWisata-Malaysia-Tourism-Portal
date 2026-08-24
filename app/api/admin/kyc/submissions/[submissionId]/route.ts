import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ADMIN_KYC_SUBMISSION_SELECT,
  mapAdminKycSubmission,
  type AdminKycSubmissionRow,
} from '@/lib/kyc/admin-submission';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEWER_ROLES = ['admin', 'approver', 'super_admin'];

interface Props {
  params: Promise<{ submissionId: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { submissionId } = await params;
  if (!UUID.test(submissionId)) return apiFail('NOT_FOUND', 'KYC submission not found', 404);

  const service = createServiceClient();
  const { data: roleRows, error: roleError } = await service
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id);
  type RoleRow = { roles: { name: string } | { name: string }[] | null };
  const roleNames = ((roleRows ?? []) as RoleRow[]).map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name ?? '';
  });
  if (roleError || !roleNames.some((name) => REVIEWER_ROLES.includes(name))) {
    return apiFail('FORBIDDEN', 'Admin role required', 403);
  }

  const { data: submissionRow, error: submissionError } = await service
    .from('kyc_submissions')
    .select(ADMIN_KYC_SUBMISSION_SELECT)
    .eq('id', submissionId)
    .maybeSingle();
  if (submissionError) return apiFail('SUBMISSION_LOOKUP_FAILED', 'Unable to load KYC submission', 500);
  if (!submissionRow) return apiFail('NOT_FOUND', 'KYC submission not found', 404);

  const submission = mapAdminKycSubmission(submissionRow as AdminKycSubmissionRow);
  const { data: customerRow, error: customerError } = await service
    .from('users')
    .select('id,email,full_name')
    .eq('id', submission.userId)
    .maybeSingle();
  if (customerError) return apiFail('CUSTOMER_LOOKUP_FAILED', 'Unable to load KYC customer', 500);
  if (!customerRow) return apiFail('NOT_FOUND', 'KYC submission not found', 404);

  const name = customerRow.full_name?.trim() || customerRow.email;
  return apiOk({
    submission,
    customer: {
      id: customerRow.id,
      name,
      email: customerRow.email,
      avatarInitial: name.charAt(0).toUpperCase() || '?',
    },
  });
}
