import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { mapCustomerKycSubmission } from '@/lib/kyc/customer-submission';

export async function GET() {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await createServiceClient()
    .from('kyc_submissions')
    .select('id,status,document_type,queue_position,created_at,reviewed_at,review_reason_code,review_reason_detail')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return apiFail('SUBMISSION_LOOKUP_FAILED', 'Unable to load KYC submission status', 500);

  return apiOk({ submission: data ? mapCustomerKycSubmission(data) : null });
}
