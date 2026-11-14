import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: () => ({ insert: mocks.insert }), rpc: mocks.rpc }) }));

import { createHandoffToken, createTicketFromHandoff, handoffContentHash } from '../handoff-token';

describe('handoff preview token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: [{ ticket_id: 'ticket-1', category: 'general', created: true }], error: null });
  });

  it('stores hashes and verified source ids and returns an opaque random token', async () => {
    const token = await createHandoffToken('owner-1', 'Booking issue', 'My booking is missing', {
      sessionId: '11111111-1111-4111-8111-111111111111',
      botMessageId: '33333333-3333-4333-8333-333333333333',
      userMessageId: '44444444-4444-4444-8444-444444444444',
      userMessageBody: 'Call me at 012-3456789',
      sanitizedMessageSnapshot: 'Call me at [PHONE]',
    });
    const record = mocks.insert.mock.calls[0][0] as Record<string, unknown>;

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain('Booking issue');
    expect(JSON.stringify(record)).not.toContain('012-3456789');
    expect(record.source_message_snapshot).toBe('Call me at [PHONE]');
    expect(record.source_bot_message_id).toBe('33333333-3333-4333-8333-333333333333');
    expect(record.source_user_message_id).toBe('44444444-4444-4444-8444-444444444444');
    expect(record.source_message_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record).not.toHaveProperty('source_message_body');
    expect(record.token_hash).not.toBe(token);
    expect(record.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('binds the submitted owner, token and reviewed content in the atomic consume call', async () => {
    const token = 'A'.repeat(43);
    await expect(createTicketFromHandoff({
      ownerId: '11111111-1111-4111-8111-111111111111',
      operationId: '22222222-2222-4222-8222-222222222222',
      operationPayloadHash: 'c'.repeat(64),
      token,
      subject: 'Booking issue',
      summary: 'My booking is missing',
      sourceMessageId: '44444444-4444-4444-8444-444444444444',
      sourceMessageSnapshot: 'My booking is missing [PHONE]',
      category: 'booking',
    })).resolves.toEqual({ data: { id: 'ticket-1', category: 'general', created: true }, error: null });
    expect(mocks.rpc).toHaveBeenCalledWith('create_support_ticket_from_handoff', expect.objectContaining({
      p_owner_id: '11111111-1111-4111-8111-111111111111',
      p_content_hash: handoffContentHash('Booking issue', 'My booking is missing', '44444444-4444-4444-8444-444444444444', 'My booking is missing [PHONE]'),
      p_source_message_id: '44444444-4444-4444-8444-444444444444',
      p_subject: 'Booking issue',
      p_body: 'My booking is missing',
    }));
  });

  it('rejects malformed handoff tokens before database access', async () => {
    await expect(createTicketFromHandoff({
      ownerId: 'owner-1', operationId: 'operation-1', operationPayloadHash: 'c'.repeat(64),
      token: 'bad', subject: 'Help', summary: 'Question', category: 'general',
    })).resolves.toEqual({ data: null, error: 'support_handoff_invalid' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('includes the consented snapshot in the preview content hash', () => {
    expect(handoffContentHash('Help', 'Summary', 'source-id', 'Question [PHONE]'))
      .not.toBe(handoffContentHash('Help', 'Summary', 'source-id', 'Question 012-3456789'));
  });
});
