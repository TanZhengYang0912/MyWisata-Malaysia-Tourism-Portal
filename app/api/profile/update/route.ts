import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { toE164MY, validateMalaysianPhone } from '@/lib/phone/normalize';

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  city:     z.string().trim().min(1).max(100),
  phone:    z.string().trim().min(1).max(20),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, profileUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const { fullName, city, phone } = parsed.data;

  if (!validateMalaysianPhone(phone)) {
    return apiFail('INVALID_PHONE', 'Enter a valid Malaysian phone number (e.g. 0123456789)', 422);
  }
  const normalizedPhone = toE164MY(phone);

  const { error } = await supabase
    .from('users')
    .update({ full_name: fullName, city, phone: normalizedPhone })
    .eq('id', user.id);

  if (error) return apiFail('DB_ERROR', error.message, 500);

  const { data: updated } = await supabase
    .from('users')
    .select('kyc_status')
    .eq('id', user.id)
    .single();

  return apiOk({ verificationTier: updated?.kyc_status ?? 'registered' });
}
