import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { chatThreadReportSchema } from '@/lib/validation/conduct-schemas';
import { accessibleChatThreadIds } from '@/lib/chat/authorization';
import { getRequestId } from '@/lib/request-id';

interface Props {
  params: Promise<{ threadId: string }>;
}

const DAILY_CAP = 10;
// A reporter with 3+ dismissed reports in the last 30 days is a likely
// false-reporter — throttle them harder rather than banning outright, so a
// single bad-faith actor can't drown the moderation queue.
const REPEAT_FALSE_REPORTER_DISMISSED_THRESHOLD = 3;
const REPEAT_FALSE_REPORTER_DAILY_CAP = 2;

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unknown';
  const code = error.code;
  return typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'unknown';
}

function isMissingAuthSession(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AuthSessionMissingError');
}

function unauthorized() {
  return apiFail('UNAUTHORIZED', 'Sign in required', 401);
}

function readUnavailable(request: Request, error: unknown, operation: string) {
  const requestId = getRequestId(request);
  console.error('[chat/report] read failed', { requestId, operation, errorCode: safeErrorCode(error) });
  return apiFail('READ_UNAVAILABLE', 'We could not verify this conversation or report status. Check your connection and try again.', 503, undefined, { requestId });
}

function writeUnavailable(request: Request, error: unknown) {
  const requestId = getRequestId(request);
  console.error('[chat/report] insert failed', { requestId, errorCode: safeErrorCode(error) });
  return apiFail('WRITE_UNAVAILABLE', 'We could not confirm whether this report was sent. Do not submit it again now; check its status or contact Support.', 503, undefined, { requestId });
}

async function loadReportContext(request: Request, threadId: string) {
  let authClient: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null;
  try {
    authClient = await createClient();
    const result = await authClient.auth.getUser();
    if (isMissingAuthSession(result.error)) return { ok: false as const, response: unauthorized() };
    if (result.error) return { ok: false as const, response: readUnavailable(request, result.error, 'auth') };
    user = result.data.user;
  } catch (error) {
    if (isMissingAuthSession(error)) return { ok: false as const, response: unauthorized() };
    return { ok: false as const, response: readUnavailable(request, error, 'auth') };
  }
  if (!user) return { ok: false as const, response: unauthorized() };

  let threadResult;
  try {
    threadResult = await authClient
      .from('chat_threads')
      .select('id,customer_id,outlet_id')
      .eq('id', threadId)
      .maybeSingle();
  } catch (error) {
    return { ok: false as const, response: readUnavailable(request, error, 'thread') };
  }
  if (threadResult.error) return { ok: false as const, response: readUnavailable(request, threadResult.error, 'thread') };
  if (!threadResult.data) return { ok: false as const, response: apiFail('NOT_FOUND', 'Conversation not found', 404) };

  let accessible: Set<string>;
  try {
    accessible = await accessibleChatThreadIds(authClient, user.id, [threadResult.data], { throwOnLookupError: true });
  } catch (error) {
    return { ok: false as const, response: readUnavailable(request, error, 'participant') };
  }
  if (!accessible.has(threadId)) {
    return { ok: false as const, response: apiFail('FORBIDDEN', 'Not a participant in this conversation', 403) };
  }

  return { ok: true as const, authClient, user };
}

export async function GET(request: Request, { params }: Props) {
  const { threadId } = await params;
  const context = await loadReportContext(request, threadId);
  if (!context.ok) return context.response;

  let service;
  try {
    service = createServiceClient();
    const { data, error } = await service
      .from('chat_reports')
      .select('id')
      .eq('thread_id', threadId)
      .eq('reporter_id', context.user.id)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();
    if (error) return readUnavailable(request, error, 'report_status');
    return apiOk({ reported: Boolean(data) });
  } catch (error) {
    return readUnavailable(request, error, 'report_status');
  }
}

export async function POST(request: Request, { params }: Props) {
  const { threadId } = await params;
  const parsed = await parseBody(request, chatThreadReportSchema);
  if (!parsed.ok) return parsed.response;

  const context = await loadReportContext(request, threadId);
  if (!context.ok) return context.response;

  let operation: 'read' | 'insert' = 'read';
  try {
    const service = createServiceClient();
    const { data: activeBan, error: banError } = await service
      .from('chat_report_bans')
      .select('id')
      .eq('user_id', context.user.id)
      .gt('banned_until', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (banError) return readUnavailable(request, banError, 'ban');
    if (activeBan) return apiFail('REPORT_BLOCKED', 'You are temporarily blocked from reporting conversations.', 403);

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: dismissedCount, error: dismissedError } = await service
      .from('chat_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', context.user.id)
      .eq('status', 'dismissed')
      .gte('created_at', since30d);
    if (dismissedError) return readUnavailable(request, dismissedError, 'dismissed_count');

    const cap = (dismissedCount ?? 0) >= REPEAT_FALSE_REPORTER_DISMISSED_THRESHOLD ? REPEAT_FALSE_REPORTER_DAILY_CAP : DAILY_CAP;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount, error: recentError } = await service
      .from('chat_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', context.user.id)
      .gte('created_at', since24h);
    if (recentError) return readUnavailable(request, recentError, 'recent_count');
    if ((recentCount ?? 0) >= cap) {
      return apiFail('RATE_LIMITED', 'You have reached the limit for reports today. Please try again tomorrow.', 429);
    }

    operation = 'insert';
    const { error: insertError } = await context.authClient
      .from('chat_reports')
      .insert({
        thread_id: threadId,
        reporter_id: context.user.id,
        reason: parsed.data.reason,
        details: parsed.data.details?.trim() || null,
      });
    if (insertError) {
      if (insertError.code === '23505') {
        return apiFail('ALREADY_REPORTED', 'You have already reported this conversation.', 409);
      }
      return writeUnavailable(request, insertError);
    }

    return apiOk({ threadId, reason: parsed.data.reason }, { status: 201 });
  } catch (error) {
    return operation === 'insert'
      ? writeUnavailable(request, error)
      : readUnavailable(request, error, 'moderation_checks');
  }
}
