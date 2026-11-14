import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), classify: vi.fn(), createTicketFromHandoff: vi.fn(), reserveAiQuota: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: vi.fn(async (text: string) => ({ display: text, original: text, hadSlur: false, hadPII: false })) }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));
vi.mock('@/lib/chatbot/classify-ai', () => ({ classifyTicketSmart: mocks.classify }));
vi.mock('@/lib/rate-limit/ai', () => ({ reserveAiQuota: mocks.reserveAiQuota }));
vi.mock('@/lib/support/handoff-token', () => ({ createTicketFromHandoff: mocks.createTicketFromHandoff }));
vi.mock('@/lib/support/unread', () => ({ getLatestReplyTimestamps: vi.fn(), isUnread: vi.fn() }));

import { POST } from '../route';

const operationId = '9e93f6a7-a11a-47b0-87bd-619e2481190a';

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/support/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationId, handoffToken: 'test-handoff-token', consent: true, subject: 'Help with my order', body: 'Please check my order', ...body }),
  });
}

describe('POST /api/support/tickets operation idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    mocks.classify.mockResolvedValue({ category: 'general', method: 'keyword' });
    mocks.reserveAiQuota.mockResolvedValue(false);
    mocks.createTicketFromHandoff.mockResolvedValue({ data: { id: 'ticket-existing', category: 'booking', created: false }, error: null });
  });

  it('returns the existing ticket for a repeated operation and lets the atomic RPC consume the same preview', async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(200);
    expect(mocks.createTicketFromHandoff).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'owner-1', token: 'test-handoff-token' }));
    expect(mocks.reserveAiQuota).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and passes normalized content and its operation hash to the transaction', async () => {
    const missingConsent = await POST(request({ consent: false }));
    expect(missingConsent.status).toBe(422);
    expect(mocks.createTicketFromHandoff).not.toHaveBeenCalled();

    mocks.createTicketFromHandoff.mockResolvedValue({ data: { id: 'ticket-new', category: 'general', created: true }, error: null });
    const response = await POST(request({ operationId: 'd3277304-74a2-4fc8-9ba7-301fce273dd7' }));
    expect(response.status).toBe(201);
    expect(mocks.createTicketFromHandoff).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'owner-1',
      subject: 'Help with my order',
      summary: 'Please check my order',
      operationPayloadHash: '0c06c67db384d55511d1a718bce7d13157fb25daa46cdd44ff766c51bdb34546',
    }));
  });

  it('requires the exact previewed source snapshot when a message id is selected', async () => {
    const responseWithoutSnapshot = await POST(request({ sourceMessageId: '44444444-4444-4444-8444-444444444444' }));
    expect(responseWithoutSnapshot.status).toBe(422);
    expect(mocks.createTicketFromHandoff).not.toHaveBeenCalled();

    const responseWithSnapshot = await POST(request({
      sourceMessageId: '44444444-4444-4444-8444-444444444444',
      sourceMessage: 'My redacted question [PHONE]',
    }));

    expect(responseWithSnapshot.status).toBe(200);
    expect(mocks.createTicketFromHandoff).toHaveBeenCalledWith(expect.objectContaining({
      sourceMessageSnapshot: 'My redacted question [PHONE]',
    }));
  });

  it('rejects reuse of an operation key for different ticket details', async () => {
    mocks.createTicketFromHandoff.mockResolvedValue({ data: null, error: 'support_ticket_operation_conflict' });

    const response = await POST(request({ body: 'Different content' }));

    expect(response.status).toBe(409);
    expect(mocks.createTicketFromHandoff).toHaveBeenCalledTimes(1);
  });

  it('still creates a confirmed handoff ticket with keyword classification when AI quota is exhausted', async () => {
    mocks.createTicketFromHandoff.mockResolvedValue({ data: { id: 'ticket-new', category: 'general', created: true }, error: null });

    const response = await POST(request({ operationId: 'd3277304-74a2-4fc8-9ba7-301fce273dd7' }));

    expect(response.status).toBe(201);
    expect(mocks.createTicketFromHandoff).toHaveBeenCalledTimes(1);
    expect(mocks.reserveAiQuota).toHaveBeenCalledWith(expect.any(Request), 'ticket_classification', 'owner-1');
    expect(mocks.classify).toHaveBeenCalledTimes(1);
    expect(mocks.classify).toHaveBeenCalledWith('Help with my order', 'Please check my order', false);
  });
});
