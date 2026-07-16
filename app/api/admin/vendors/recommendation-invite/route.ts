import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiFail, apiOk } from '@/lib/validation/schemas';
import { createRecommendationInviteToken } from '@/lib/recommendations/invite-token';
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
  const { token, tokenHash } = createRecommendationInviteToken();
  const service = createServiceClient();
  const { data, error } = await service.from('vendor_recommendation_invites').insert({ recommendation_id: parsed.data.recommendationId, email: parsed.data.email ?? null, token_hash: tokenHash }).select('id,expires_at').single();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return apiOk({ ...data, claimUrl: `${origin}/vendor/register?recommendation=${encodeURIComponent(token)}` }, { status: 201 });
}
