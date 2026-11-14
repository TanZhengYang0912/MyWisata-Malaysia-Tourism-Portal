import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireStaffPermission: vi.fn(), createServiceClient: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission: mocks.requireStaffPermission }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

import { GET } from '../route';

const rows = [
  {
    id: 'withdrawal-cycle-two-empty', user_id: 'customer-a', amount: 20, status: 'pending_second_approval',
    requires_dual_approval: true, approval_cycle: 2, created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
    users: { full_name: 'Customer A', email: 'a@example.test' },
    withdrawal_approvals: [
      { approver_id: 'approver-a', action: 'approve', approval_cycle: 1 },
      { approver_id: 'approver-b', action: 'approve', approval_cycle: 1 },
    ],
    withdrawal_risk_assessments: [],
  },
  {
    id: 'withdrawal-cycle-two-one', user_id: 'customer-b', amount: 30, status: 'pending_second_approval',
    requires_dual_approval: true, approval_cycle: 2, created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z',
    users: { full_name: 'Customer B', email: 'b@example.test' },
    withdrawal_approvals: [
      { approver_id: 'approver-a', action: 'approve', approval_cycle: 1 },
      { approver_id: 'approver-a', action: 'approve', approval_cycle: 2 },
      { approver_id: 'approver-a', action: 'approve', approval_cycle: 2 },
      { approver_id: 'approver-b', action: 'hold', approval_cycle: 2 },
      { approver_id: 'approver-c', action: 'approve', approval_cycle: null },
    ],
    withdrawal_risk_assessments: [],
  },
];

describe('GET /api/admin/withdrawals approval cycle projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffPermission.mockResolvedValue({ response: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: rows, count: rows.length, error: null }),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
    };
    mocks.rpc.mockResolvedValue({ data: { payoutValueSen: 5000, highRiskCount: 0, overdueCount: 0 }, error: null });
    mocks.createServiceClient.mockReturnValue({ from: vi.fn(() => query), rpc: mocks.rpc });
  });

  it('counts only distinct approvals in the current cycle and ignores legacy null cycles', async () => {
    const response = await GET(new Request('http://localhost/api/admin/withdrawals'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items.map((item: { approvalCycle: number; approvalCount: number }) => [item.approvalCycle, item.approvalCount]))
      .toEqual([[2, 0], [2, 1]]);
    expect(body.data.summary).toEqual({ payoutValueSen: 5000, highRiskCount: 0, overdueCount: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith('get_admin_withdrawal_filter_summary', {
      p_statuses: null, p_risk_level: null, p_search: null,
    });
  });

  it('scopes a name or email search to the joined users table so PostgREST can parse it', async () => {
    const or = vi.fn().mockReturnThis();
    // The route applies .or() after .range(), so the builder itself is what gets awaited.
    const query = {
      select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or,
      range: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], count: 0, error: null }),
    };
    mocks.createServiceClient.mockReturnValue({ from: vi.fn(() => query), rpc: mocks.rpc });

    const response = await GET(new Request('http://localhost/api/admin/withdrawals?search=siti'));

    expect(response.status).toBe(200);
    expect(or).toHaveBeenCalledWith('full_name.ilike.%siti%,email.ilike.%siti%', { referencedTable: 'users' });
  });
});
