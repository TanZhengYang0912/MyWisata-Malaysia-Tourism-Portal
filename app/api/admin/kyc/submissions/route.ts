import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import {
  ADMIN_KYC_SUBMISSION_SELECT,
  mapAdminKycSubmission,
  type AdminKycSubmissionRow,
} from '@/lib/kyc/admin-submission';

export async function GET() {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: roleRows, error: roleError } = await service
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id);
  type RoleRow = { roles: { name: string } | { name: string }[] | null };
  const roleNames = ((roleRows ?? []) as RoleRow[]).map((r) => {
    const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
    return role?.name ?? '';
  });
  if (roleError || !roleNames.some((n) => ['admin', 'approver', 'super_admin'].includes(n))) {
    return apiFail('FORBIDDEN', 'Admin role required', 403);
  }

  const { data, error } = await service
    .from('kyc_submissions')
    .select(ADMIN_KYC_SUBMISSION_SELECT)
    .in('status', ['pending', 'info_requested'])
    .order('created_at', { ascending: true });
  if (error) return apiFail('SUBMISSION_LOOKUP_FAILED', 'Unable to load KYC submissions', 500);

  const submissions = (data ?? []).map((row) => mapAdminKycSubmission(row as AdminKycSubmissionRow));
  return apiOk({ submissions });
}
