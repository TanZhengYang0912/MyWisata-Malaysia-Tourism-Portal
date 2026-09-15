/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), service: vi.fn(),
  serviceFrom: vi.fn(), storage: vi.fn(), resolveVendor: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));
vi.mock('@/lib/payments/simulator-config', () => ({ isPaymentSimulatorEnabled: () => true }));
vi.mock('@/lib/demo/runtime', () => ({ isDemoToolRuntimeEnabled: () => true }));
vi.mock('@/lib/affiliate/vendor-share-stats', () => ({ resolveVendorForUser: mocks.resolveVendor, getVendorShareStats: vi.fn() }));

// Keep route handlers and role guards real. Stop at the external business-data
// boundary so a missing guard fails without executing a write, payout or email.
const reachedBusinessData = new Error('reached business data before authorization');
const routes = import.meta.glob('../**/route.ts');
type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;
const id = '11111111-1111-4111-8111-111111111111';
let roles: string[];
let grantedPermissions: string[];

const staffRoutes: [string, string, Record<string, unknown>?][] = [
  ['admin/affiliate/stats', 'GET'], ['admin/affiliate/report', 'GET'],
  ['admin/affiliate/run-clearing', 'POST'], ['admin/affiliate/fraud-flags', 'GET'],
  ['admin/affiliate/fraud-flags/[id]', 'PATCH'], ['admin/affiliate/fraud-sweep', 'POST'],
  ['admin/affiliate/fraud-analytics', 'GET'], ['admin/affiliate/insight', 'GET'],
  ['admin/affiliate/attributions/[id]/accept', 'POST'], ['admin/affiliate/attributions/[id]/reject', 'POST'],
  ['admin/affiliate/links/[id]', 'PATCH'], ['admin/affiliate/tiers/[id]', 'PATCH'],
  ['admin/chatbot/stats', 'GET'], ['admin/chatbot/reindex', 'POST'],
  ['admin/chatbot/kb', 'GET'], ['admin/chatbot/kb', 'POST'],
  ['admin/chatbot/kb/[id]', 'PATCH'], ['admin/chatbot/kb/draft', 'POST'],
  ['admin/moderation/flags', 'GET'], ['admin/moderation/flags/[id]', 'PATCH'],
  ['admin/tickets', 'GET'], ['admin/tickets/[id]', 'PATCH'],
  ['admin/vendors/[id]/approval-email', 'POST'], ['admin/vendors/[id]/approval-email/draft', 'POST'],
  ['admin/vendors/[id]/approve', 'POST', { action: 'approve' }],
  ['admin/vendors/[id]/approve', 'POST', { action: 'reject', reason: 'Not eligible for approval' }],
  ['admin/vendors/[id]/approve', 'POST', { action: 'request_information', reason: 'Please supply details' }],
  ['admin/catalogue/reviews', 'GET'], ['admin/catalogue/reviews', 'POST'],
  ['admin/refunds', 'GET'], ['admin/refunds/[refundId]', 'POST', { action: 'approve' }],
  ['admin/refunds/[refundId]', 'POST', { action: 'reject' }],
  ['admin/chat-reports', 'GET'], ['admin/chat-reports/[reportId]', 'PATCH'],
  ['admin/report-bans/[userId]', 'POST'], ['admin/report-bans/[userId]', 'DELETE'],
  ['admin/chat-settings', 'GET'], ['admin/clear-earnings', 'POST'],
  ['checkout/release-expired', 'POST'], ['dev/force-clear', 'POST'],
  ['payments/simulator/refunds/[refundId]/action', 'POST', { outcome: 'succeeded' }],
];

function query(data: unknown) {
  const result = { data, error: null };
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), not: vi.fn(), update: vi.fn(() => { throw reachedBusinessData; }), then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  return chain;
}

async function call(path: string, method: string, body: Record<string, unknown> = {}) {
  const routeModule = await routes[`../${path}/route.ts`]() as Record<string, Handler>;
  const request = new Request(`http://localhost/api/${path}?path=${id}/attachment.pdf&vendorId=${id}`, {
    method, ...(method !== 'GET' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  try {
    return await routeModule[method](request, { params: Promise.resolve({ id, userId: id, reportId: id, refundId: id }) });
  } catch (error) {
    if (error === reachedBusinessData) return error;
    throw error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
    roles = ['approver'];
    grantedPermissions = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'user_roles') return query(roles.map((name) => ({ roles: { name } })));
    throw reachedBusinessData;
  });
  mocks.rpc.mockImplementation((name: string, args?: { p_permission_key?: string }) => {
    if (name === 'has_staff_permission') {
      const permissionKey = args?.p_permission_key ?? '';
      const legacyAdminPermission = roles.includes('admin')
        && ['admin.vendor.manage', 'admin.kyc.review'].includes(permissionKey);
      return Promise.resolve({
        data: roles.includes('super_admin') || legacyAdminPermission || grantedPermissions.includes(permissionKey),
        error: null,
      });
    }
    if (name === 'is_admin' || name === 'is_approver') return Promise.resolve({ data: roles.some((r) => ['super_admin', 'approver'].includes(r)), error: null });
    if (name === 'is_super_admin') return Promise.resolve({ data: roles.includes('super_admin'), error: null });
    throw reachedBusinessData;
  });
  mocks.service.mockImplementation(() => { throw reachedBusinessData; });
  mocks.resolveVendor.mockResolvedValue(null);
});

describe('Wallet Approver cannot call unrelated management APIs', () => {
  it.each(staffRoutes)('%s %s denies approver before business access', async (path, method, body) => {
    const result = await call(path, method, body);
    expect(result).toMatchObject({ status: 403 });
    expect(mocks.from.mock.calls.every(([table]) => table === 'user_roles')).toBe(true);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it.each(['admin/catalogue/reviews', 'admin/refunds', 'admin/chat-reports', 'admin/tickets'])('preserves Super Admin authority for %s', async (path) => {
    roles = ['approver', 'super_admin'];
    expect(await call(path, 'GET')).toBe(reachedBusinessData);
  });

  it('preserves content-admin claimed-vendor approval authority', async () => {
    roles = ['admin'];
    expect(await call('admin/vendors/[id]/approve', 'POST', { action: 'approve' })).toBe(reachedBusinessData);
  });

  it('lets Staff with the dynamic Catalogue Review permission reach the review data boundary', async () => {
    roles = ['staff'];
    grantedPermissions = ['admin.catalogue.review'];
    expect(await call('admin/catalogue/reviews', 'GET')).toBe(reachedBusinessData);
    expect(mocks.rpc).toHaveBeenCalledWith('has_staff_permission', {
      p_user_id: 'actor',
      p_permission_key: 'admin.catalogue.review',
    });
  });

  it('preserves cron-secret checkout expiry', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    mocks.service.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: 3, error: null }) });
    const { POST } = await import('../checkout/release-expired/route');
    const response = await POST(new Request('http://localhost/api/checkout/release-expired', { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } }));
    expect(response.status).toBe(200);
    expect(mocks.getUser).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe('shared APIs do not give approver a staff override', () => {
  beforeEach(() => {
    const ticket = { id, user_id: 'someone-else', assigned_to: 'actor', status: 'open', subject: 'Private ticket' };
    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_roles') return query(roles.map((name) => ({ roles: { name } })));
      if (table === 'support_tickets') return query(ticket);
      throw reachedBusinessData;
    });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'support_tickets') return query(ticket);
      throw reachedBusinessData;
    });
    mocks.service.mockReturnValue({ from: mocks.serviceFrom, storage: { from: mocks.storage } });
    mocks.storage.mockImplementation(() => { throw reachedBusinessData; });
  });

  it.each([
    ['support/tickets/[id]', 'GET', {}],
    ['support/tickets/[id]/read', 'PATCH', {}],
    ['support/tickets/[id]/replies', 'POST', { body: 'A valid ticket reply.' }],
    ['support/tickets/[id]/attachments', 'GET', {}],
    ['support/tickets/[id]/attachments', 'POST', {}],
    ['conduct/report', 'POST', { chatType: 'user_admin', threadId: id, reason: 'Please review this ticket' }],
    ['vendor/share-analytics', 'GET', {}],
  ] as [string, string, Record<string, unknown>][])('%s %s denies access to someone else’s resource', async (path, method, body) => {
    expect(await call(path, method, body)).toMatchObject({ status: 403 });
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.serviceFrom.mock.calls.every(([table]) => table === 'support_tickets')).toBe(true);
  });

  it('lets an approver mark only their own ticket as customer-read', async () => {
    const update = vi.fn().mockReturnValue(query(null));
    mocks.serviceFrom.mockReturnValue({ ...query({ id, user_id: 'actor' }), update });
    expect(await call('support/tickets/[id]/read', 'PATCH')).toMatchObject({ status: 200 });
    expect(update).toHaveBeenCalledWith({ customer_last_read_at: expect.any(String) });
  });

  it('scopes unread count to the caller rather than the staff queue', async () => {
    const tickets = query([]);
    mocks.serviceFrom.mockReturnValue(tickets);
    expect(await call('support/unread-count', 'GET')).toMatchObject({ status: 200 });
    expect(tickets.eq).toHaveBeenCalledWith('user_id', 'actor');
  });
});
