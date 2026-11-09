import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ service: vi.fn(), from: vi.fn(), rpc: vi.fn(), assurance: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } }, error: null }) }, from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));
vi.mock('@/lib/auth/staff-assurance', () => ({ requireStaffAssurance: mocks.assurance }));
vi.mock('@/lib/refunds/process-refund', () => ({ processRefund: vi.fn() }));
vi.mock('@/lib/payments/simulator-config', () => ({ isPaymentSimulatorEnabled: () => true }));
import { GET as refunds } from '@/app/api/admin/refunds/route';
import { POST as refund } from '@/app/api/admin/refunds/[refundId]/route';
import { GET as counts } from '@/app/api/admin/navigation/counts/route';
import { POST as outcome } from '@/app/api/admin/orders/[orderId]/financial-outcome/route';
import { POST as simulator } from '@/app/api/payments/simulator/refunds/[refundId]/action/route';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
const id = '44444444-4444-4444-8444-444444444444';
const request = () => new Request('https://mylawatan.my/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'succeeded' }) });
beforeEach(() => { vi.clearAllMocks(); mocks.assurance.mockImplementation(async () => Response.json({ error: { code: 'STAFF_PASSKEY_REQUIRED' } }, { status: 403 })); });
describe('staff assurance before privileged data or service use', () => {
  it.each([
    ['refund list', () => refunds(new Request("https://mylawatan.my/api/admin/refunds"))], ['refund action', () => refund(request(), { params: Promise.resolve({ refundId: id }) })],
    ['queue counts', () => counts(new Request('https://mylawatan.my/api/admin/navigation/counts'))], ['financial outcome', () => outcome(request(), { params: Promise.resolve({ orderId: id }) })],
    ['simulator refund', () => simulator(request(), { params: Promise.resolve({ refundId: id }) })],
  ])('denies %s without privileged reads', async (_name, action) => {
    expect((await action()).status).toBe(403);
    expect(mocks.service).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not resolve permissions or expose the client before staff verification', async () => {
    expect((await requireStaffPermission('admin.withdrawal.approve')).response?.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
