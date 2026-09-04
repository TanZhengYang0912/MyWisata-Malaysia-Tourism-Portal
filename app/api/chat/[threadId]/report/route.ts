import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { accessibleChatThreadIds } from '@/lib/chat/authorization';

interface Props {
  params: Promise<{ threadId: string }>;
}

const REASONS = new Set(['scam', 'abuse', 'spam', 'other']);
const DAILY_CAP = 10;
// A reporter with 3+ dismissed reports in the last 30 days is a likely
// false-reporter — throttle them harder rather than banning outright, so a
// single bad-faith actor can't drown the moderation queue.
const REPEAT_FALSE_REPORTER_DISMISSED_THRESHOLD = 3;
const REPEAT_FALSE_REPORTER_DAILY_CAP = 2;

export async function POST(request: Request, { params }: Props) {
  const { threadId } = await params;
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  let body: { reason?: string; details?: string } = {};
  try { body = await request.json(); } catch { return apiFail('INVALID_BODY', 'reason is required', 400); }
  if (!body.reason || !REASONS.has(body.reason)) {
    return apiFail('INVALID_REASON', 'reason must be one of scam, abuse, spam, other', 422);
  }

  // chat_threads_participant RLS scopes this to threads the caller can see —
  // customer, vendor owner, outlet manager, or admin. A miss means not a participant.
  const { data: thread, error: threadError } = await authClient
    .from('chat_threads').select('id,customer_id,outlet_id').eq('id', threadId).maybeSingle();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
  if (!thread) return apiFail('NOT_FOUND', 'Conversation not found', 404);
  if (!(await accessibleChatThreadIds(authClient, user.id, [thread])).has(thread.id)) {
    return apiFail('FORBIDDEN', 'Not a participant in this conversation', 403);
  }

  // Reporters have no SELECT policy on chat_reports (only admins do), so rate
  // limiting/reputation reads need the service client — this is internal
  // bookkeeping the route controls, not data being handed back to the caller.
  const service = createServiceClient();

  const { data: activeBan, error: banError } = await service
    .from('chat_report_bans')
    .select('id')
    .eq('user_id', user.id)
    .gt('banned_until', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (banError) return apiFail('DB_ERROR', banError.message, 500);
  if (activeBan) return apiFail('REPORT_BLOCKED', 'You are temporarily blocked from reporting conversations.', 403);

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: dismissedCount, error: dismissedError } = await service
    .from('chat_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id)
    .eq('status', 'dismissed')
    .gte('created_at', since30d);
  if (dismissedError) return apiFail('DB_ERROR', dismissedError.message, 500);

  const cap = (dismissedCount ?? 0) >= REPEAT_FALSE_REPORTER_DISMISSED_THRESHOLD ? REPEAT_FALSE_REPORTER_DAILY_CAP : DAILY_CAP;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: recentError } = await service
    .from('chat_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id)
    .gte('created_at', since24h);
  if (recentError) return apiFail('DB_ERROR', recentError.message, 500);
  if ((recentCount ?? 0) >= cap) {
    return apiFail('RATE_LIMITED', 'You have reached the limit for reports today. Please try again tomorrow.', 429);
  }

  // Insert through the authenticated client (not service) so
  // chat_reports_insert RLS re-verifies participant + reporter_id = auth.uid()
  // as a second, independent check on the write itself.
  const { error: insertError } = await authClient
    .from('chat_reports')
    .insert({ thread_id: threadId, reporter_id: user.id, reason: body.reason, details: body.details?.trim() || null });
  if (insertError) {
    if (insertError.code === '23505') {
      return apiFail('ALREADY_REPORTED', 'You have already reported this conversation.', 409);
    }
    return apiFail('DB_ERROR', insertError.message, 500);
  }

  return apiOk({ threadId, reason: body.reason }, { status: 201 });
}
