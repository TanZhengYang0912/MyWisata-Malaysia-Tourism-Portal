import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  validateChatAttachment: vi.fn(),
  reserveSupportAttachment: vi.fn(),
  markSupportAttachmentStarted: vi.fn(),
  markSupportAttachmentUploaded: vi.fn(),
  abandonSupportAttachment: vi.fn(),
  commitSupportTicketAttachment: vi.fn(),
  retrySupportAttachment: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/support/attachment', () => ({
  readTicketAttachmentForm: async (request: Request) => ({ ok: true, data: await request.formData() }),
  validateChatAttachment: mocks.validateChatAttachment,
}));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: async (text: string) => ({ display: text, original: text, hadSlur: false }) }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));
vi.mock('@/lib/moderation/admin-conduct', () => ({ logAdminConductFlagIfNeeded: vi.fn() }));

import { POST } from '../route';

const ticketId = '11111111-1111-4111-8111-111111111111';
const operationId = '7b456ed4-615e-4210-a704-840abc4c1790';
const leaseToken = '8c567fe5-726f-4321-b815-951ded5ca301';
const uploadId = '99999999-9999-4999-8999-999999999999';
const ownerId = 'owner-1';

function makeRequest(bytes: number[], caption = '') {
  const formData = new FormData();
  formData.set('file', new File([new Uint8Array(bytes)], 'receipt.png', { type: 'image/png' }));
  formData.set('operationId', operationId);
  formData.set('caption', caption);
  return new Request(`http://localhost/api/support/tickets/${ticketId}/attachments`, { method: 'POST', body: formData });
}

function makeService() {
  let reply: Record<string, unknown> | null = null;
  const storage = {
    upload: vi.fn<(path: string, body: unknown, options: unknown) => Promise<{ error: unknown }>>(async () => ({ error: null })),
    download: vi.fn<(path: string) => Promise<{ data: Blob | null; error: { statusCode?: string } | null }>>(async () => ({ data: null, error: { statusCode: '404' } })),
  };
  const service = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'reserve_support_attachment') return mocks.reserveSupportAttachment(name, args);
      if (name === 'mark_support_attachment_started') return mocks.markSupportAttachmentStarted(name, args);
      if (name === 'mark_support_attachment_uploaded') return mocks.markSupportAttachmentUploaded(name, args);
      if (name === 'abandon_support_attachment') return mocks.abandonSupportAttachment(name, args);
      if (name === 'commit_support_ticket_attachment') return mocks.commitSupportTicketAttachment(name, args);
      if (name === 'retry_support_attachment') return mocks.retrySupportAttachment(name, args);
      throw new Error(`Unexpected RPC ${name}`);
    },
    storage: { from: vi.fn(() => storage) },
    from: vi.fn((table: string) => {
      if (table === 'support_tickets') {
        const query: Record<string, (...args: unknown[]) => unknown> = {};
        query.select = () => query;
        query.eq = () => query;
        query.maybeSingle = async () => ({ data: { id: ticketId, subject: 'Question', user_id: ownerId, assigned_to: null, status: 'open' }, error: null });
        return query;
      }
      if (table === 'support_ticket_replies') {
        const query: Record<string, (...args: unknown[]) => unknown> = {};
        query.select = () => query;
        query.eq = () => query;
        query.maybeSingle = async () => ({ data: reply, error: null });
        return query;
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  mocks.commitSupportTicketAttachment.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
    const result = {
      id: 'reply-1',
      sender_id: ownerId,
      sender_role: 'customer',
      body: 'Receipt',
      created_at: '2026-11-11T00:00:00.000Z',
      new_status: 'open',
      created: true,
      ticket_user_id: ownerId,
      operation_payload_hash: args.p_operation_payload_hash,
    };
    reply = result;
    return { data: result, error: null };
  });
  return { service, storage };
}

function submit(bytes: number[], caption = '') {
  return POST(makeRequest(bytes, caption), { params: Promise.resolve({ id: ticketId }) });
}

describe('POST /api/support/tickets/[id]/attachments operation idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveSupportAttachment.mockResolvedValue({
      data: { state: 'reserved', storage_path: `${ticketId}/${uploadId}.png`, lease_token: leaseToken },
      error: null,
    });
    mocks.markSupportAttachmentStarted.mockResolvedValue({ data: null, error: null });
    mocks.markSupportAttachmentUploaded.mockResolvedValue({ data: null, error: null });
    mocks.abandonSupportAttachment.mockResolvedValue({ data: null, error: null });
    mocks.retrySupportAttachment.mockResolvedValue({ data: null, error: { message: 'support_attachment_retry_pending' } });
    mocks.commitSupportTicketAttachment.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.validateChatAttachment.mockImplementation(async (file: File) => ({ ok: true, buffer: await file.arrayBuffer() }));
  });

  it('returns the existing reply for a repeated attachment operation without uploading again', async () => {
    const { service, storage } = makeService();
    mocks.createServiceClient.mockReturnValue(service);

    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(201);
    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(200);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(mocks.commitSupportTicketAttachment).toHaveBeenCalledTimes(1);
  });

  it('rejects a changed file or caption under the same operation ID before uploading again', async () => {
    const { service, storage } = makeService();
    mocks.createServiceClient.mockReturnValue(service);

    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(201);
    const response = await submit([3, 2, 1], 'Receipt');

    expect(response.status).toBe(409);
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it('reconciles a previously uploaded object after an uncertain database response', async () => {
    const { service, storage } = makeService();
    storage.upload.mockResolvedValueOnce({ error: null });
    storage.download.mockResolvedValueOnce({
      data: new File([new Uint8Array([1, 2, 3])], 'receipt.png', { type: 'image/png' }),
      error: null,
    });
    mocks.commitSupportTicketAttachment
      .mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
      .mockImplementationOnce(async () => {
        const result = {
          id: 'reply-1', sender_id: ownerId, sender_role: 'customer', body: 'Receipt',
          created_at: '2026-11-11T00:00:00.000Z', new_status: 'open', created: true, ticket_user_id: ownerId,
        };
        return { data: result, error: null };
      });
    mocks.reserveSupportAttachment
      .mockResolvedValueOnce({
        data: { state: 'reserved', storage_path: `${ticketId}/${uploadId}.png`, lease_token: leaseToken },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { state: 'uploaded', storage_path: `${ticketId}/${uploadId}.png`, lease_token: leaseToken },
        error: null,
      });
    mocks.createServiceClient.mockReturnValue(service);

    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(503);
    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(201);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.download).toHaveBeenCalledTimes(1);
    expect(storage.upload.mock.calls[0][0]).toBe(storage.download.mock.calls[0][0]);
    expect(mocks.commitSupportTicketAttachment).toHaveBeenCalledTimes(2);
  });

  it('rejects captions beyond the documented limit before uploading', async () => {
    const { service, storage } = makeService();
    mocks.createServiceClient.mockReturnValue(service);
    const response = await submit([1, 2, 3], 'x'.repeat(2001));

    expect(response.status).toBe(422);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('keeps an uncertain upload pending when Storage has not confirmed the object', async () => {
    const { service, storage } = makeService();
    mocks.reserveSupportAttachment.mockResolvedValue({
      data: { state: 'unknown', storage_path: `${ticketId}/${uploadId}.png`, lease_token: leaseToken },
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(service);

    const response = await submit([1, 2, 3], 'Receipt');
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('WRITE_UNAVAILABLE');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('restarts the same operation with a new path after cleanup confirmed deletion', async () => {
    const { service, storage } = makeService();
    mocks.reserveSupportAttachment.mockResolvedValue({ data: null, error: { message: 'support_attachment_result_unavailable' } });
    mocks.retrySupportAttachment.mockResolvedValue({
      data: { state: 'reserved', storage_path: `${ticketId}/${uploadId}.png`, lease_token: leaseToken },
      error: null,
    });
    mocks.createServiceClient.mockReturnValue(service);

    const response = await submit([1, 2, 3], 'Receipt');

    expect(response.status).toBe(201);
    expect(mocks.retrySupportAttachment).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });
});
