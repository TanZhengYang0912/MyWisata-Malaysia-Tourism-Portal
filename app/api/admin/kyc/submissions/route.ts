import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import {
  ADMIN_KYC_SUBMISSION_SELECT,
  mapAdminKycSubmission,
  type AdminKycSubmissionRow,
} from '@/lib/kyc/admin-submission';

export async function GET() {
  const { response } = await requireStaffPermission('admin.kyc.review');
  if (response) return response;

  const service = createServiceClient();
  const { data, error } = await service
    .from('kyc_submissions')
    .select(ADMIN_KYC_SUBMISSION_SELECT)
    .in('status', ['pending', 'info_requested'])
    .order('created_at', { ascending: true });
  if (error) return apiFail('SUBMISSION_LOOKUP_FAILED', 'Unable to load KYC submissions', 500);

  const submissions = (data ?? []).map((row) => mapAdminKycSubmission(row as AdminKycSubmissionRow));
  const userIds = submissions.map((submission) => submission.userId);
  const [customersResult, verifiedResult] = await Promise.all([
    userIds.length > 0
      ? service
          .from('users')
          .select('id,email,full_name,tier')
          .in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    service
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tier', 'kyc_verified'),
  ]);
  if (customersResult.error || verifiedResult.error) {
    return apiFail('CUSTOMER_LOOKUP_FAILED', 'Unable to load KYC customers', 500);
  }

  const customers = ((customersResult.data ?? []) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    tier: string;
  }>).map((customer) => ({
    id: customer.id,
    name: customer.full_name?.trim() || customer.email,
    email: customer.email,
    verificationTier: customer.tier,
  }));

  return apiOk({
    submissions,
    customers,
    verifiedCount: verifiedResult.count ?? 0,
  });
}
