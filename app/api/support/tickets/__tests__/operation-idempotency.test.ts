import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), classify: vi.fn() }));

function query(result: unknown) {
  const terminal = Promise.resolve(result);
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'insert']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: vi.fn(async (text: string) => ({ display: text, original: text, hadSlur: false, hadPII: false })) }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));
vi.mock('@/lib/chatbot/classify-ai', () => ({ classifyTicketSmart: mocks.classify }));
vi.mock('@/lib/rate-limit/ai', () => ({ reserveAiQuota: vi.fn(async () => false) }));
vi.mock('@/lib/support/handoff-token', () => ({ verifyHandoffToken: vi.fn(async () => true) }));
vi.mock('@/lib/support/unread', () => ({ getLatestReplyTimestamps: vi.fn(), isUnread: vi.fn() }));

import { POST } from '../route';

const operationId = '9e93f6a7-a11a-47b0-87bd-619e2481190a';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/support/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationId, handoffToken: 'test-handoff-token', subject: 'Help with my order', body: 'Please check my order', ...body }),
  });
}

describe('POST /api/support/tickets operation idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
  });

  it('returns the existing ticket for a repeated operation with the same payload', async () => {
    const existing = query({ data: {
      id: 'ticket-1',
      category: 'booking',
      operation_payload_hash: '0c06c67db384d55511d1a718bce7d13157fb25daa46cdd44ff766c51bdb34546',
    }, error: null });
    mocks.from.mockReturnValue(existing);

    const response = await POST(request({}));

    expect(response.status).toBe(200);
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(existing.insert).not.toHaveBeenCalled();
  });

  it('hashes normalized submission content using Web Crypto', async () => {
    const builder = query({ data: { id: 'ticket-new', category: 'general' }, error: null });
    const resultLookup = query({ data: null, error: null });
    mocks.from.mockReturnValueOnce(resultLookup).mockReturnValueOnce(builder);
    mocks.classify.mockResolvedValue({ category: 'general', method: 'keyword' });
    const response = await POST(request({ operationId: 'd3277304-74a2-4fc8-9ba7-301fce273dd7' }));
    expect(response.status).toBe(201);
    expect(builder.insert).toHaveBeenCalledTimes(1);
    const insert = builder.insert.mock.calls[0]?.[0] as { operation_payload_hash: string };
    expect(insert.operation_payload_hash).toBe('0c06c67db384d55511d1a718bce7d13157fb25daa46cdd44ff766c51bdb34546');
  });

  it('rejects reuse of an operation key for different ticket details', async () => {
    const existing = query({ data: {
      id: 'ticket-1',
      category: 'booking',
      operation_payload_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }, error: null });
    mocks.from.mockReturnValue(existing);

    const response = await POST(request({ body: 'Different content' }));

    expect(response.status).toBe(409);
    expect(mocks.classify).not.toHaveBeenCalled();
    expect(existing.insert).not.toHaveBeenCalled();
  });
});
