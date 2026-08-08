import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const schema = z.object({ outcome: z.literal('fraud'), reason: z.string().trim().min(10).max(500) }).strict();

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const { data: roles } = await db.from('user_roles').select('roles(name)').eq('user_id', user.id);
  const allowed = (roles ?? []).some((row) => ['admin', 'super_admin'].includes((row.roles as { name?: string } | null)?.name ?? ''));
  if (!allowed) return apiFail('FORBIDDEN', 'Admin role required', 403);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { orderId } = await context.params;
  const { data, error } = await db.rpc('mark_order_financial_outcome', { p_order_id: orderId, p_status: parsed.data.outcome, p_actor_id: user.id, p_provider_event_id: null });
  if (error) return apiFail('OUTCOME_FAILED', 'Unable to record the financial outcome', 422);
  return apiOk({ orderId, outcome: parsed.data.outcome, reversedCount: Number(data ?? 0) });
}
