import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  draftKbEntry: vi.fn(),
  rpc: vi.fn(),
  quota: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/chatbot/kb-draft', () => ({ draftKbEntry: mocks.draftKbEntry }));
vi.mock('@/lib/rate-limit/ai', () => ({ reserveAiQuota: mocks.quota }));

import { POST } from '../route';

describe('POST /api/admin/chatbot/kb/draft privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    const docsResult = Promise.resolve({ data: [], error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        result_json: { title: 'Refund status', body: '[ADMIN: confirm refund policy].', keywords: ['refund'], category: 'payment' },
        result_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }, error: null }),
      then: docsResult.then.bind(docsResult),
    };
    mocks.from.mockImplementation((_table: string) => query);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'reserve_support_kb_draft') return Promise.resolve({
        data: { state: 'running', shouldExecute: true, leaseToken: 'lease-1', created: true }, error: null,
      });
      if (name === 'mark_support_operation_external_started') return Promise.resolve({ data: true, error: null });
      if (name === 'complete_support_kb_draft') return Promise.resolve({
        data: { title: 'Refund status', body: '[ADMIN: confirm refund policy].', keywords: ['refund'], category: 'payment' }, error: null,
      });
      return Promise.resolve({ data: 'failed', error: null });
    });
    mocks.quota.mockResolvedValue(true);
    mocks.draftKbEntry.mockImplementation(async (_question: string, _answer: string | null, beforeExternalCall?: () => Promise<void>) => {
      await beforeExternalCall?.();
      return { title: 'Refund status', body: '[ADMIN: confirm refund policy].', keywords: ['refund'] };
    });
    mocks.createServiceClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
  });

  function request(operationId = '11111111-1111-4111-8111-111111111111') {
    return new Request('http://localhost/api/admin/chatbot/kb/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'When will my refund arrive?', operationId }),
    });
  }

  it('withholds a personal-data question before calling the AI drafter', async () => {
    const response = await POST(new Request('http://localhost/api/admin/chatbot/kb/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'My phone number is 012-3456789. How do I book?', operationId: crypto.randomUUID() }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('PERSONAL_DATA_WITHHELD');
    expect(body.error.message).toContain('write the knowledge-base entry manually');
    expect(mocks.draftKbEntry).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('replays a completed result for the same operation without another Gemini or quota call', async () => {
    mocks.rpc.mockImplementationOnce(() => Promise.resolve({
      data: { state: 'running', shouldExecute: true, leaseToken: 'lease-1', created: true }, error: null,
    })).mockImplementationOnce(() => Promise.resolve({ data: true, error: null }))
      .mockImplementationOnce(() => Promise.resolve({
        data: { title: 'Refund status', body: '[ADMIN: confirm refund policy].', keywords: ['refund'], category: 'payment' }, error: null,
      }))
      .mockImplementationOnce(() => Promise.resolve({ data: { state: 'completed', shouldExecute: false }, error: null }));

    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ data: { title: 'Refund status', category: 'payment' } });
    expect(mocks.draftKbEntry).toHaveBeenCalledTimes(1);
    expect(mocks.quota).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith('support_operations');
  });

  it('does not call Gemini again when an earlier external result is unknown', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: 'unknown', shouldExecute: false }, error: null });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('OPERATION_UNKNOWN');
    expect(mocks.draftKbEntry).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });

  it('lets a confirmed but expired result start a fresh user-requested draft', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: 'completed', shouldExecute: false }, error: null });
    const docsResult = Promise.resolve({ data: [], error: null });
    const expiredQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        result_json: { title: 'Expired', body: 'Old draft', keywords: [], category: 'general' },
        result_expires_at: new Date(Date.now() - 1).toISOString(),
      }, error: null }),
      then: docsResult.then.bind(docsResult),
    };
    mocks.from.mockImplementation(() => expiredQuery);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('DRAFT_RESULT_EXPIRED');
    expect(mocks.draftKbEntry).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
});
