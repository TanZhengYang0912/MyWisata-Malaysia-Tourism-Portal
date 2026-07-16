import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { hashRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { z } from 'zod';

const schema = z.object({ token: z.string().min(20).max(200), vendorId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  let body: unknown;
  try { body = await request.json(); } catch { return apiFail('INVALID_JSON', 'Body is not valid JSON', 400); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'token and vendorId are required', 422);
  const service = createServiceClient();
  const { data: vendor } = await service.from('vendors').select('id,owner_id,name,status').eq('id', parsed.data.vendorId).maybeSingle();
  if (!vendor || vendor.owner_id !== user.id || !['pending', 'approved'].includes(vendor.status)) return apiFail('FORBIDDEN', 'You can only claim an invite for your own pending or approved vendor', 403);
  const { data: invite, error } = await service.from('vendor_recommendation_invites').select('id,recommendation_id,expires_at,status').eq('token_hash', hashRecommendationInviteToken(parsed.data.token)).maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!invite) return apiFail('NOT_FOUND', 'Invite not found', 404);
  if (invite.status !== 'invited' || new Date(invite.expires_at).getTime() < Date.now()) return apiFail('INVALID_STATE', 'This invite is expired or already claimed', 409);
  const { error: updateError } = await service.from('vendor_recommendation_invites').update({ status: 'claimed', claimed_vendor_id: vendor.id, claimed_at: new Date().toISOString() }).eq('id', invite.id).eq('status', 'invited');
  if (updateError) return apiFail('DB_ERROR', updateError.message, 500);
  return apiOk({ recommendationId: invite.recommendation_id, vendorId: vendor.id, status: 'claimed', next: 'admin_link_required' });
}
