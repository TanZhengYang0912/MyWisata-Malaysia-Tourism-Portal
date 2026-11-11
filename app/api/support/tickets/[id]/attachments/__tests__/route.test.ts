import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  validateChatAttachment: vi.fn(),
  notifyTicketReply: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/support/attachment', () => ({
  validateChatAttachment: mocks.validateChatAttachment,
  buildTicketAttachmentPath: (ticketId: string, token: string, mime: string) => `${ticketId}/${token}.${mime === 'image/png' ? 'png' : 'bin'}`,
}));
vi.mock('@/lib/support/notify', () => ({ notifyTicketReply: mocks.notifyTicketReply }));
vi.mock('@/lib/moderation/clean', () => ({ cleanUserContent: async (text: string) => ({ display: text, original: text, hadSlur: false }) }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag: vi.fn() }));
vi.mock('@/lib/moderation/admin-conduct', () => ({ logAdminConductFlagIfNeeded: vi.fn() }));

import { POST } from '../route';

const ticketId = '11111111-1111-4111-8111-111111111111';
const operationId = '7b456ed4-615e-4210-a704-840abc4c1790';

function makeRequest(bytes: number[], caption = '') {
  const formData = new FormData();
  formData.set('file', new File([new Uint8Array(bytes)], 'receipt.png', { type: 'image/png' }));
  formData.set('operationId', operationId);
  formData.set('caption', caption);
  return new Request(`http://localhost/api/support/tickets/${ticketId}/attachments`, { method: 'POST', body: formData });
}

function makeService() {
  let reply: Record<string, unknown> | null = null;
  const storage = { upload: vi.fn(async () => ({ error: null })), remove: vi.fn(async () => ({ error: null })) };
  const service = {
    storage: { from: vi.fn(() => storage) },
    from: vi.fn((table: string) => {
      if (table === 'support_tickets') {
        const query: Record<string, (...args: unknown[]) => unknown> = {};
        query.select = () => query;
        query.eq = () => query;
        query.maybeSingle = async () => ({ data: { id: ticketId, subject: 'Question', user_id: 'owner-1', assigned_to: null, status: 'open' }, error: null });
        query.update = () => ({ eq: async () => ({ error: null }) });
        return query;
      }
      if (table === 'support_ticket_replies') {
        const query: Record<string, (...args: unknown[]) => unknown> = {};
        query.select = () => query;
        query.eq = () => query;
        query.maybeSingle = async () => ({ data: reply, error: null });
        query.insert = (values: unknown) => ({
          select: () => ({
            single: async () => {
              reply = { ...(values as Record<string, unknown>), id: 'reply-1', created_at: '2026-11-11T00:00:00.000Z' };
              return { data: reply, error: null };
            },
          }),
        });
        return query;
      }
      return { insert: vi.fn() };
    }),
  };
  return { service, storage };
}

function submit(bytes: number[], caption = '') {
  return POST(makeRequest(bytes, caption), { params: Promise.resolve({ id: ticketId }) });
}

describe('POST /api/support/tickets/[id]/attachments operation idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);
    mocks.validateChatAttachment.mockImplementation(async (file: File) => ({ ok: true, buffer: await file.arrayBuffer() }));
    mocks.notifyTicketReply.mockResolvedValue(undefined);
  });

  it('returns the existing reply for a repeated attachment operation without a second upload or notification', async () => {
    const { service, storage } = makeService();
    mocks.createServiceClient.mockReturnValue(service);

    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(201);
    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(200);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(mocks.notifyTicketReply).toHaveBeenCalledTimes(1);
  });

  it('rejects a changed file or caption under the same operation ID before uploading again', async () => {
    const { service, storage } = makeService();
    mocks.createServiceClient.mockReturnValue(service);

    expect((await submit([1, 2, 3], 'Receipt')).status).toBe(201);
    const response = await submit([3, 2, 1], 'Receipt');

    expect(response.status).toBe(409);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(mocks.notifyTicketReply).toHaveBeenCalledTimes(1);
  });

  it('rejects captions beyond the documented limit before uploading', async () => {
    const { service, storage } = makeService();
    mocks.createServiceClient.mockReturnValue(service);
    const response = await submit([1, 2, 3], 'x'.repeat(2001));

    expect(response.status).toBe(422);
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
