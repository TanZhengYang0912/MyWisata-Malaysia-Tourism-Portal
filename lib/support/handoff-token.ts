import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';

const TOKEN_TTL_SECONDS = 15 * 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createHandoffToken(ownerId: string, subject: string, summary: string, _sourceMessageId?: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const contentHash = hashToken(JSON.stringify({ subject, summary }));
  const { error } = await createServiceClient().from('support_handoff_tokens').insert({
    token_hash: hashToken(token),
    owner_id: ownerId,
    content_hash: contentHash,
    expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error('support_handoff_token_unavailable');
  return token;
}

export async function verifyHandoffToken(token: string, ownerId: string, subject: string, summary: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const { data, error } = await createServiceClient().from('support_handoff_tokens')
    .select('owner_id, content_hash, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (error || !data || data.owner_id !== ownerId || new Date(data.expires_at).getTime() < Date.now()) return false;
  const expected = Buffer.from(data.content_hash, 'hex');
  const actual = Buffer.from(hashToken(JSON.stringify({ subject, summary })), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
