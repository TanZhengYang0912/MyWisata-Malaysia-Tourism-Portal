import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiFail, apiOk } from '@/lib/validation/schemas';
import { createRecommendationInviteToken } from '@/lib/recommendations/invite-token';
import { enqueueVendorClaimInviteEmail } from '@/lib/email/events';
import { z } from 'zod';

const schema = z.object({ recommendationId: z.string().uuid(), email: z.string().email().optional() }).strict();

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: roles } = await db.from('user_roles').select('roles(name)').eq('user_id', user.id);
  const names = (roles ?? []).map((row: any) => row.roles?.name);
  if (!names.includes('super_admin') && !names.includes('approver')) return apiFail('FORBIDDEN', 'Admin role required', 403);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const service = createServiceClient();
  const { data: recommendation, error: recommendationError } = await service
    .from('vendor_recommendations')
    .select('id,vendor_name,status')
    .eq('id', parsed.data.recommendationId)
    .maybeSingle();
  if (recommendationError) return apiFail('DB_ERROR', recommendationError.message, 500);
  if (!recommendation) return apiFail('NOT_FOUND', 'Recommendation not found', 404);
  if (!['approved', 'invited'].includes(recommendation.status)) {
    return apiFail('RECOMMENDATION_NOT_READY', 'Only approved recommendations can invite a vendor', 409);
  }

  const { token, tokenHash } = createRecommendationInviteToken();
  const { data, error } = await service.from('vendor_recommendation_invites').insert({ recommendation_id: parsed.data.recommendationId, email: parsed.data.email ?? null, token_hash: tokenHash }).select('id,expires_at').single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const { error: statusError } = await service
    .from('vendor_recommendations')
    .update({ status: 'invited' })
    .eq('id', parsed.data.recommendationId);
  if (statusError) return apiFail('DB_ERROR', statusError.message, 500);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const claimUrl = `${origin}/vendor/register?recommendation=${encodeURIComponent(token)}`;
  if (parsed.data.email) {
    try {
      await enqueueVendorClaimInviteEmail({
        recommendationId: parsed.data.recommendationId,
        email: parsed.data.email,
        vendorName: recommendation.vendor_name,
        claimUrl,
      });
    } catch (emailError) {
      console.error('[vendor-claim] invite email enqueue failed:', emailError);
    }
  }
  return apiOk({ ...data, claimUrl }, { status: 201 });
}
