import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { meetsMinTier, REQUIRED_TIER } from '@/lib/constants';

const recSubmitSchema = z.object({
  vendorName:    z.string().trim().min(3).max(255),
  description:   z.string().trim().min(20).max(2000),
  categoryId:    z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
  state:         z.string().trim().min(2).max(50),
  vendorAddress: z.string().trim().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Tier gate: profile_complete required to submit recommendations (ADR-028)
  const { data: profile } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single();
  if (!profile || !meetsMinTier(profile.tier, REQUIRED_TIER.RECOMMENDATION)) {
    return apiFail('TIER_INSUFFICIENT', 'Profile completion required to submit recommendations', 403);
  }

  const parsed = await parseBody(request, recSubmitSchema);
  if (!parsed.ok) return parsed.response;
  const { vendorName, description, categoryId, state, vendorAddress } = parsed.data;

  // Atomic: advisory lock + daily count + duplicate check + insert — all in one RPC.
  const { data, error } = await supabase.rpc('submit_recommendation', {
    p_vendor_name:    vendorName,
    p_description:    description,
    p_state:          state,
    p_category_id:    categoryId ?? null,
    p_vendor_address: vendorAddress ?? null,
  });

  if (error) {
    if (error.message.includes('rate_limited'))
      return apiFail('RATE_LIMITED', 'Daily recommendation limit reached — try again tomorrow', 429);
    if (error.message.includes('duplicate'))
      return apiFail('DUPLICATE', 'You already recommended a vendor with this name', 409);
    return apiFail('DB_ERROR', error.message, 500);
  }

  return apiOk({ id: data, vendor_name: vendorName, status: 'pending' }, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await supabase
    .from('vendor_recommendations')
    .select('id, vendor_name, status, state, categories(name), created_at')
    .eq('recommender_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk(data ?? []);
}
