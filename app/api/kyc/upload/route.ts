import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { hashICWithHmac } from '@/lib/kyc/hash';
import { abandonAndRemoveKycEvidence, buildKycEvidencePaths, validateKycUploadFile } from '@/lib/kyc/submission';

const IC_PATTERNS: Record<string, RegExp> = {
  national_id: /^\d{6}-?\d{2}-?\d{4}$/,
  driving_license: /^\d{6}-?\d{2}-?\d{4}$/,
  passport: /^[A-Za-z]{1,2}[0-9]{6,8}$/,
};

function safeSubmissionFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('tier_insufficient')) {
    return apiFail('TIER_INSUFFICIENT', 'Complete your profile before submitting KYC', 403);
  }
  if (message.includes('active_submission_exists')) {
    return apiFail('ACTIVE_SUBMISSION_EXISTS', 'You already have an active KYC submission', 409);
  }
  return apiFail('SUBMIT_FAILED', 'Unable to submit KYC documents', 500);
}

export async function POST(request: Request) {
  const authenticated = await createClient();
  const { data: { user } } = await authenticated.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return apiFail('INVALID_FORM', 'Could not parse form data', 400); }

  const icNumber = formData.get('icNumber');
  const docType = formData.get('docType');
  const frontFile = formData.get('frontFile');
  const backFile = formData.get('backFile');
  if (typeof icNumber !== 'string' || typeof docType !== 'string' || !(frontFile instanceof File) || !(backFile instanceof File)) {
    return apiFail('MISSING_FIELDS', 'icNumber, docType, frontFile, and backFile are required', 422);
  }
  if (!(docType in IC_PATTERNS)) {
    return apiFail('INVALID_DOC_TYPE', 'docType must be national_id, passport, or driving_license', 422);
  }
  if (!IC_PATTERNS[docType].test(icNumber.trim().toUpperCase())) {
    return apiFail('INVALID_IC', 'IC number format does not match document type', 422);
  }

  const [front, back] = await Promise.all([validateKycUploadFile(frontFile), validateKycUploadFile(backFile)]);
  if (!front.ok) return apiFail(front.code, 'Front document is not a valid JPEG, PNG, or PDF under 5 MB', 422);
  if (!back.ok) return apiFail(back.code, 'Back document is not a valid JPEG, PNG, or PDF under 5 MB', 422);

  let fingerprint: { algorithm: 'hmac_sha256_v1'; value: string };
  try { fingerprint = await hashICWithHmac(icNumber.trim()); }
  catch { return apiFail('SERVER_CONFIGURATION', 'KYC submission is temporarily unavailable', 503); }

  const service = createServiceClient();
  const { data: submissionId, error: beginError } = await service.rpc('begin_kyc_submission', {
    p_user_id: user.id,
    p_ic_hash: fingerprint.value,
    p_ic_hash_version: fingerprint.algorithm,
    p_doc_type: docType,
  });
  if (beginError || typeof submissionId !== 'string') return safeSubmissionFailure(beginError);

  const paths = buildKycEvidencePaths(user.id, submissionId, crypto.randomUUID(), frontFile.type, backFile.type);
  const cleanup = async () => {
    // `abandon_kyc_submission` is the state reconciliation step: it returns
    // true only when this caller's draft was deleted. Never remove evidence
    // after a finalize timeout/error unless that proof is positive.
    const result = await abandonAndRemoveKycEvidence({ submissionId, paths, authenticated, service });
    if (!result.ok) {
      console.error('KYC draft cleanup failed', { submissionId, reason: result.reason });
      return false;
    }
    return true;
  };

  const frontUpload = await service.storage.from('kyc-documents').upload(paths.front, front.buffer, {
    contentType: frontFile.type, upsert: false,
  });
  if (frontUpload.error) {
    if (!await cleanup()) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
    return apiFail('UPLOAD_FAILED', 'Unable to upload KYC documents', 502);
  }

  const backUpload = await service.storage.from('kyc-documents').upload(paths.back, back.buffer, {
    contentType: backFile.type, upsert: false,
  });
  if (backUpload.error) {
    if (!await cleanup()) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
    return apiFail('UPLOAD_FAILED', 'Unable to upload KYC documents', 502);
  }

  const { error: finalizeError } = await authenticated.rpc('finalize_kyc_submission', {
    p_submission_id: submissionId,
    p_front_path: paths.front,
    p_back_path: paths.back,
  });
  if (finalizeError) {
    if (!await cleanup()) return apiFail('CLEANUP_FAILED', 'KYC submission state could not be safely resolved', 500);
    return safeSubmissionFailure(finalizeError);
  }

  return apiOk({ submissionId, status: 'pending' }, { status: 201 });
}
