// P-TMF — Customer submits KYC document
// POST /api/kyc/submit
//   Body: { documentType, documentUrl }
//   Auth: any signed-in user
//   Idempotent: yes (via Idempotency-Key header)

import { createClient } from '@/lib/supabase/server';
import { kycSubmitSchema, parseBody, apiFail } from '@/lib/validation/schemas';
import { withIdempotency } from '@/lib/idempotency';
import { recordAudit } from '@/lib/audit';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, kycSubmitSchema);
  if (!parsed.ok) return parsed.response;

  const idem = await withIdempotency(request, user.id, '/api/kyc/submit', parsed.data);
  if (idem.replayed) return idem.replayed;

  // Business rule: no active pending submission
  const { data: existing } = await supabase
    .from('kyc_submissions')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return apiFail(
      'PENDING_SUBMISSION_EXISTS',
      'A pending KYC submission already exists',
      409,
      { submissionId: existing.id },
    );
  }

  // Business rule: rejected users need 24h cooldown before re-submitting
  const { data: lastRejected } = await supabase
    .from('kyc_submissions')
    .select('reviewed_at')
    .eq('user_id', user.id)
    .eq('status', 'rejected')
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRejected?.reviewed_at) {
    const hoursSince = (Date.now() - new Date(lastRejected.reviewed_at).getTime()) / 3_600_000;
    if (hoursSince < 24) {
      return apiFail(
        'COOLDOWN_ACTIVE',
        `Please wait ${Math.ceil(24 - hoursSince)} hour(s) before re-submitting`,
        429,
      );
    }
  }

  const { data: submission, error } = await supabase
    .from('kyc_submissions')
    .insert({
      user_id:       user.id,
      document_type: parsed.data.documentType,
      document_url:  parsed.data.documentUrl,
      status:        'pending',
    })
    .select('id, status, created_at')
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);

  // Reflect status change on users table
  await supabase.from('users').update({ kyc_status: 'pending' }).eq('id', user.id);

  await recordAudit({
    actorId:    user.id,
    action:     'kyc.submitted',
    entityType: 'kyc_submission',
    entityId:   submission.id,
    afterData:  { document_type: parsed.data.documentType, status: 'pending' },
  });

  return idem.record({ data: submission, error: null }, 201);
}
