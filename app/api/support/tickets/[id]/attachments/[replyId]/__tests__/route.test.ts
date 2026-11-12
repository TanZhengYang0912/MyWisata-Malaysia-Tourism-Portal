import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  readTicket: vi.fn(),
  readReply: vi.fn(),
  download: vi.fn(),
  serviceFrom: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { GET } from '../route';

const ticketId = '11111111-1111-4111-8111-111111111111';
const replyId = '22222222-2222-4222-8222-222222222222';
const ownerId = 'owner-1';
const requesterId = 'requester-1';
const storagePath = `${ticketId}/33333333-3333-4333-8333-333333333333.pdf`;
const params = { params: Promise.resolve({ id: ticketId, replyId }) };

function query(read: () => Promise<unknown>) {
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'eq'] as const) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(read);
  return builder;
}

function service() {
  return {
    from: mocks.serviceFrom,
    storage: { from: mocks.storageFrom },
  };
}

function request() {
  return new Request(`http://localhost/api/support/tickets/${ticketId}/attachments/${replyId}`);
}

async function readResponse() {
  return GET(request(), params);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } }, error: null });
  mocks.isSuperAdmin.mockResolvedValue(false);
  mocks.createServiceClient.mockReturnValue(service());
  mocks.readTicket.mockResolvedValue({ data: { id: ticketId, user_id: ownerId }, error: null });
  mocks.readReply.mockResolvedValue({ data: { attachment_url: storagePath }, error: null });
  mocks.download.mockResolvedValue({ data: new Blob(['pdf content']), error: null });
  mocks.serviceFrom.mockImplementation((table: string) => query(table === 'support_tickets' ? mocks.readTicket : mocks.readReply));
  mocks.storageFrom.mockReturnValue({ download: mocks.download });
});

describe('GET /api/support/tickets/[id]/attachments/[replyId]', () => {
  it('requires a signed-in user before reading ticket data', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await readResponse();

    expect(response.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('treats an expired auth session as a sign-in requirement', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError' } });

    const response = await readResponse();

    expect(response.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('keeps auth infrastructure failures distinct from an expired session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { code: '08006', message: 'private auth database' } });

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private auth database');
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('returns an authorized owner attachment through the same-origin route', async () => {
    const response = await readResponse();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pdf content');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="support-attachment.pdf"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(mocks.isSuperAdmin).not.toHaveBeenCalled();
    expect(mocks.storageFrom).toHaveBeenCalledWith('ticket-attachments');
    expect(mocks.download).toHaveBeenCalledWith(storagePath);
    expect(response.headers.get('content-disposition')).not.toContain(storagePath);
  });

  it('requires a positive admin check for non-owners', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: requesterId } }, error: null });
    mocks.isSuperAdmin.mockResolvedValue(true);

    const response = await readResponse();

    expect(response.status).toBe(200);
    expect(mocks.isSuperAdmin).toHaveBeenCalledWith(expect.anything(), requesterId, { throwOnLookupError: true });
  });

  it('keeps inaccessible tickets indistinguishable from missing attachments', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: requesterId } }, error: null });
    mocks.isSuperAdmin.mockResolvedValue(false);

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(JSON.stringify(payload)).not.toContain(storagePath);
    expect(mocks.readReply).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('returns a safe temporary error when the admin role lookup fails', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: requesterId } }, error: null });
    mocks.isSuperAdmin.mockRejectedValue(new Error('private role database path'));

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private role database path');
    expect(JSON.stringify(payload)).not.toContain(storagePath);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(['ticket', 'reply'] as const)('returns a safe temporary error when the %s query reports a database failure', async (target) => {
    const failedRead = target === 'ticket' ? mocks.readTicket : mocks.readReply;
    failedRead.mockResolvedValue({ data: null, error: { code: '08006', message: 'private support database path' } });

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private support database path');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(['ticket', 'reply'] as const)('maps a thrown %s read failure to a retryable response', async (target) => {
    const failedRead = target === 'ticket' ? mocks.readTicket : mocks.readReply;
    failedRead.mockRejectedValue(new Error('private connection reset'));

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private connection reset');
  });

  it('maps a service client initialization failure to a retryable response', async () => {
    mocks.createServiceClient.mockImplementation(() => { throw new Error('private service configuration'); });

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private service configuration');
  });

  it('does not retrieve a storage object from an invalid registered path', async () => {
    mocks.readReply.mockResolvedValue({ data: { attachment_url: `${ticketId}/../private.pdf` }, error: null });

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(['returned error', 'thrown error'] as const)('returns a fixed retryable error when Storage has a %s', async (failure) => {
    if (failure === 'returned error') {
      mocks.download.mockResolvedValue({ data: null, error: { statusCode: '503', message: `private bucket path ${storagePath}` } });
    } else {
      mocks.download.mockRejectedValue(new Error(`private bucket path ${storagePath}`));
    }

    const response = await readResponse();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('ATTACHMENT_UNAVAILABLE');
    expect(JSON.stringify(payload)).not.toContain('private bucket path');
    expect(JSON.stringify(payload)).not.toContain(storagePath);
  });
});
