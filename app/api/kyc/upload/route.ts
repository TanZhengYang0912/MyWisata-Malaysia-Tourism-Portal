import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { hashIC } from '@/lib/kyc/hash';
import { validateMagicBytes } from '@/lib/kyc/magic-bytes';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE       = 5 * 1024 * 1024; // 5 MB

const IC_PATTERNS: Record<string, RegExp> = {
  national_id:     /^\d{6}-?\d{2}-?\d{4}$/,
  driving_license: /^\d{6}-?\d{2}-?\d{4}$/,
  passport:        /^[A-Za-z]{1,2}[0-9]{6,8}$/,
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return apiFail('INVALID_FORM', 'Could not parse form data', 400); }

  const icNumber = formData.get('icNumber') as string | null;
  const docType  = formData.get('docType')  as string | null;
  const file     = formData.get('file')     as File | null;

  if (!icNumber?.trim() || !docType || !file) {
    return apiFail('MISSING_FIELDS', 'icNumber, docType, and file are required', 422);
  }

  if (!Object.keys(IC_PATTERNS).includes(docType)) {
    return apiFail('INVALID_DOC_TYPE', 'docType must be national_id, passport, or driving_license', 422);
  }
  if (!IC_PATTERNS[docType].test(icNumber.trim().toUpperCase())) {
    return apiFail('INVALID_IC', 'IC number format does not match document type', 422);
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return apiFail('INVALID_FILE_TYPE', 'File must be JPEG, PNG, or PDF', 422);
  }
  if (file.size > MAX_SIZE) {
    return apiFail('FILE_TOO_LARGE', 'File must be under 5 MB', 422);
  }

  const buffer = await file.arrayBuffer();
  const validMagic = await validateMagicBytes(buffer, file.type);
  if (!validMagic) {
    return apiFail('INVALID_FILE_CONTENT', 'File content does not match its claimed type', 422);
  }

  const icHash = await hashIC(icNumber.trim());

  const ext  = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${user.id}/document.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('kyc-documents')
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadErr) return apiFail('UPLOAD_FAILED', uploadErr.message, 500);

  const { data: submissionId, error: rpcErr } = await supabase.rpc('submit_kyc', {
    p_user_id:  user.id,
    p_ic_hash:  icHash,
    p_doc_type: docType,
    p_doc_url:  path,
  });
  if (rpcErr) {
    if (rpcErr.message.includes('tier_insufficient'))
      return apiFail('TIER_INSUFFICIENT', 'Complete your profile before submitting KYC', 403);
    return apiFail('SUBMIT_FAILED', rpcErr.message, 500);
  }

  const { data: sub } = await supabase
    .from('kyc_submissions')
    .select('queue_position')
    .eq('id', submissionId as string)
    .maybeSingle();

  return apiOk({ submissionId, queuePosition: (sub as any)?.queue_position ?? null }, { status: 201 });
}
