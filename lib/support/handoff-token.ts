import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

const TOKEN_TTL_SECONDS = 15 * 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function handoffContentHash(subject: string, summary: string, sourceMessageId: string | null = null): string {
  return hashToken(JSON.stringify({ subject, summary, sourceMessageId }));
}

export interface HandoffSource {
  sessionId: string | null;
  botMessageId: string | null;
  userMessageId: string | null;
  userMessageBody: string | null;
}

export async function createHandoffToken(ownerId: string, subject: string, summary: string, source: HandoffSource = {
  sessionId: null,
  botMessageId: null,
  userMessageId: null,
  userMessageBody: null,
}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const contentHash = handoffContentHash(subject, summary, source.userMessageId);
  const { error } = await createServiceClient().from('support_handoff_tokens').insert({
    token_hash: hashToken(token),
    owner_id: ownerId,
    content_hash: contentHash,
    source_session_id: source.sessionId,
    source_bot_message_id: source.botMessageId,
    source_user_message_id: source.userMessageId,
    source_message_hash: source.userMessageBody ? hashToken(source.userMessageBody) : null,
    expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error('support_handoff_token_unavailable');
  return token;
}

export interface HandoffTicketInput {
  ownerId: string;
  operationId: string;
  operationPayloadHash: string;
  token: string;
  subject: string;
  summary: string;
  sourceMessageId?: string | null;
  category: string;
}

export async function createTicketFromHandoff(input: HandoffTicketInput) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) return { data: null, error: 'support_handoff_invalid' };
  const { data, error } = await createServiceClient().rpc('create_support_ticket_from_handoff', {
    p_owner_id: input.ownerId,
    p_operation_id: input.operationId,
    p_operation_payload_hash: input.operationPayloadHash,
    p_handoff_token_hash: hashToken(input.token),
    p_content_hash: handoffContentHash(input.subject, input.summary, input.sourceMessageId ?? null),
    p_source_message_id: input.sourceMessageId ?? null,
    p_subject: input.subject,
    p_body: input.summary,
    p_category: input.category,
  });
  if (error) {
    const code = error.code === '23505' && error.message?.includes('support_ticket_operation_conflict')
      ? 'support_ticket_operation_conflict'
      : error.code === '22023' && error.message?.includes('support_handoff_expired')
        ? 'support_handoff_expired'
        : error.code === '22023' && error.message?.includes('support_handoff_consumed')
          ? 'support_handoff_consumed'
          : error.code === '22023' && error.message?.includes('support_handoff_invalid')
            ? 'support_handoff_invalid'
            : 'support_handoff_unavailable';
    return { data: null, error: code };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (typeof row !== 'object' || row === null) return { data: null, error: 'support_handoff_result_invalid' };
  const result = row as Record<string, unknown>;
  if (typeof result.ticket_id !== 'string' || typeof result.category !== 'string' || typeof result.created !== 'boolean') {
    return { data: null, error: 'support_handoff_result_invalid' };
  }
  return { data: { id: result.ticket_id, category: result.category, created: result.created }, error: null };
}
