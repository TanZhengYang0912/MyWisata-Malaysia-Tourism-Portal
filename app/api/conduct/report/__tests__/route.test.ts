import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  isSuperAdmin: vi.fn(),
  createReport: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/moderation/chat-conduct-reports', () => ({ createChatConductReport: mocks.createReport }));

import { POST } from '../route';

const ticketId = '11111111-1111-4111-8111-111111111111';
const ownerId = 'customer-1';

function request(chatType = 'user_admin') {
  return new Request('http://localhost/api/conduct/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chatType, threadId: ticketId, reason: 'Please review this conversation.' }),
  });
}

function query(result: { data: unknown; error: unknown }) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } } });
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.from.mockReturnValue(query({ data: { id: ticketId, user_id: ownerId, assigned_to: null }, error: null }));
  mocks.createReport.mockResolvedValue({ ok: true, id: 'report-1' });
});

describe('POST /api/conduct/report', () => {
  it('returns 401 before querying when the login session has expired', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns a retryable error when authentication cannot be verified', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 503 } });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('AuthRetryableFetchError');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects an invalid ticket id before querying', async () => {
    const invalidRequest = new Request('http://localhost/api/conduct/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatType: 'user_admin', threadId: 'not-a-uuid', reason: 'Please review this conversation.' }),
    });

    const response = await POST(invalidRequest);

    expect(response.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects an overlong report reason before querying', async () => {
    const invalidRequest = new Request('http://localhost/api/conduct/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatType: 'user_admin', threadId: ticketId, reason: 'x'.repeat(501) }),
    });

    const response = await POST(invalidRequest);

    expect(response.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns an explicit duplicate result when the database uniqueness rule rejects the report', async () => {
    mocks.createReport.mockResolvedValue({ ok: false, reason: 'duplicate' });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('ALREADY_REPORTED');
  });

  it('returns a retryable read error when ticket lookup fails', async () => {
    mocks.from.mockReturnValue(query({ data: null, error: { message: 'database node private-db-4 unavailable' } }));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('private-db-4');
  });

  it.each(['chat_threads', 'outlets', 'vendors', 'outlet_managers'])('returns a retryable read error when %s lookup fails', async (failedTable) => {
    const rows: Record<string, { data: unknown; error: unknown }> = {
      chat_threads: { data: { id: ticketId, customer_id: 'other-user', outlet_id: 'outlet-1' }, error: null },
      outlets: { data: { id: 'outlet-1', vendor_id: 'vendor-1' }, error: null },
      vendors: { data: { id: 'vendor-1', owner_id: 'vendor-owner' }, error: null },
      outlet_managers: { data: null, error: null },
    };
    rows[failedTable] = { data: null, error: { message: 'private service diagnostic' } };
    mocks.from.mockImplementation((table: string) => query(rows[table]));

    const response = await POST(request('user_vendor'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('private service diagnostic');
    expect(mocks.createReport).not.toHaveBeenCalled();
  });

  it('does not create a report with an incomplete vendor party when the vendor row is missing', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'chat_threads') return query({ data: { id: ticketId, customer_id: 'other-user', outlet_id: 'outlet-1' }, error: null });
      if (table === 'outlets') return query({ data: { id: 'outlet-1', vendor_id: 'vendor-1' }, error: null });
      if (table === 'vendors') return query({ data: null, error: null });
      return query({ data: null, error: null });
    });

    const response = await POST(request('user_vendor'));

    expect(response.status).toBe(404);
    expect(mocks.createReport).not.toHaveBeenCalled();
  });

  it('uses the same not found response for a missing and non-participant ticket', async () => {
    mocks.from.mockReturnValueOnce(query({ data: null, error: null }));
    const missing = await POST(request());
    mocks.from.mockReturnValueOnce(query({ data: { id: ticketId, user_id: 'other-user', assigned_to: null }, error: null }));
    const forbidden = await POST(request());

    expect(missing.status).toBe(404);
    expect(forbidden.status).toBe(404);
    expect((await missing.json()).error.code).toBe('NOT_FOUND');
    expect((await forbidden.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns a retryable read error when the non-owner admin check is unavailable', async () => {
    mocks.from.mockReturnValue(query({ data: { id: ticketId, user_id: 'other-user', assigned_to: null }, error: null }));
    mocks.isSuperAdmin.mockRejectedValue(new Error('super_admin_lookup_unavailable'));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('super_admin_lookup_unavailable');
    expect(mocks.createReport).not.toHaveBeenCalled();
    expect(mocks.isSuperAdmin).toHaveBeenCalledWith(expect.anything(), ownerId, { throwOnLookupError: true });
  });

  it('does not return raw insert errors to the reporter', async () => {
    mocks.createReport.mockResolvedValue({ ok: false, reason: 'error', errorCode: '23514' });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('WRITE_UNAVAILABLE');
    expect(body.error.message).toContain('Do not submit it again now');
    expect(JSON.stringify(body)).not.toContain('private_reports_reason_check');
  });

  it('maps a network rejection during insert to a safe retryable response', async () => {
    mocks.createReport.mockRejectedValue(new Error('private-db-host connection lost'));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('WRITE_UNAVAILABLE');
    expect(body.error.message).toContain('Do not submit it again now');
    expect(JSON.stringify(body)).not.toContain('private-db-host');
  });
});
