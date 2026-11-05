// These business-rule fixtures represent a session that has completed staff verification.
vi.mock("@/lib/auth/staff-assurance", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/staff-assurance")>()), requireStaffAssurance: vi.fn(async () => null) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth/staff-assurance', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/auth/staff-assurance')>()), requireStaffAssurance: vi.fn(async () => null) }));

const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';
const REFUND_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), authFrom: vi.fn(), serviceFrom: vi.fn(), serviceRpc: vi.fn(), processRefund: vi.fn(), adminGuard: vi.fn() }));

function queryResult(data: unknown, error: unknown = null) {
  const terminal = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'in']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal);
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.authFrom })),
}));
vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffRoleManagementSuperAdmin: mocks.adminGuard }));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom, rpc: mocks.serviceRpc })),
}));
vi.mock('@/lib/refunds/process-refund', () => ({ processRefund: mocks.processRefund }));

import { GET } from '../route';
import { POST } from '../[refundId]/route';

describe('GET /api/admin/refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceRpc.mockImplementation(async (name: string) => ({ data: name === 'list_staff_review_queue' ? { items: [{ id: REFUND_ID }], page: 1, total: 1 } : { items: [], version: 'a'.repeat(32) }, error: null }));
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.adminGuard.mockResolvedValue({ db: {}, user: { id: USER_ID }, response: null });
    mocks.authFrom.mockReturnValue(queryResult([{ roles: { name: 'super_admin' } }]));
    mocks.serviceFrom.mockReturnValue(queryResult([{
      id: REFUND_ID,
      order_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
      amount: 50,
      reason: 'Customer request',
      reasonCode: null,
      evidence: { items: [], version: 'a'.repeat(32) },
      status: 'approved',
      provider_refund_id: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      manual_reference: null,
      wallet_topup_sen: 1000,
      wallet_earnings_sen: 2000,
      external_amount_sen: 2000,
      provider_failure_code: null,
      provider_failure_message: null,
      attempt_count: 1,
      created_at: '2026-08-17T00:00:00.000Z',
      updated_at: '2026-08-17T00:01:00.000Z',
      payments: { method: 'ewallet', provider: 'tng_ewallet_simulator' },
      orders: { display_id: 'ORD-1001' },
    }]));
  });

  it('returns a bounded admin-safe refund projection', async () => {
    const response = await GET(new Request("http://localhost/api/admin/refunds"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.refunds[0]).toEqual({
      id: REFUND_ID,
      orderId: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
      orderNumber: 'ORD-1001',
      amountRm: 50,
      reason: 'Customer request',
      reasonCode: null,
      evidence: { items: [], version: 'a'.repeat(32) },
      status: 'approved',
      provider: 'tng_ewallet_simulator',
      method: 'ewallet',
      providerRefundId: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      manualReference: null,
      walletTopupSen: 1000,
      walletEarningsSen: 2000,
      externalAmountSen: 2000,
      failureCode: null,
      failureMessage: null,
      attemptCount: 1,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:01:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('provider_payment_id');
    expect(mocks.serviceFrom.mock.results[0].value.in).toHaveBeenCalledWith('id', [REFUND_ID]);
    expect(mocks.serviceRpc.mock.calls.filter(([name]) => name === 'get_event_refund_evidence')).toHaveLength(1);
  });

  it('rejects non-admin users before using the service client', async () => {
    mocks.adminGuard.mockResolvedValue({ db: {}, user: null, response: new Response(null, { status: 403 }) });
    const response = await GET(new Request("http://localhost/api/admin/refunds"));

    expect(response.status).toBe(403);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/refunds/[refundId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceRpc.mockImplementation(async (name: string) => ({ data: name === 'list_staff_review_queue' ? { items: [{ id: REFUND_ID }], page: 1, total: 1 } : { items: [], version: 'a'.repeat(32) }, error: null }));
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.adminGuard.mockResolvedValue({ db: {}, user: { id: USER_ID }, response: null });
    mocks.authFrom.mockReturnValue(queryResult([{ roles: { name: 'super_admin' } }]));
    mocks.serviceFrom.mockReturnValue(queryResult({ id: REFUND_ID, status: 'pending' }));
    mocks.processRefund.mockResolvedValue({ ok: true, data: { refundId: REFUND_ID, status: 'processed' } });
  });

  it('passes the manual transaction reference to refund processing', async () => {
    const response = await POST(new Request('http://localhost/api/admin/refunds/' + REFUND_ID, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve', manualReference: 'BANK-REF-12345' }),
    }), { params: Promise.resolve({ refundId: REFUND_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.processRefund).toHaveBeenCalledWith(expect.objectContaining({
      refundId: REFUND_ID,
      actorId: USER_ID,
      manualReference: 'BANK-REF-12345',
    }));
  });
});
