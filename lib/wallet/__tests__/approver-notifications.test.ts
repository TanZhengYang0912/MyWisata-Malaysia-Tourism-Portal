import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  in: vi.fn(),
  upsert: vi.fn(),
  enqueueEmail: vi.fn(),
  processEmailOutbox: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/email/outbox', () => ({ enqueueEmail: mocks.enqueueEmail, processEmailOutbox: mocks.processEmailOutbox }));

import { notifyWithdrawalApprovers } from '../approver-notifications';

describe('notifyWithdrawalApprovers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ select: mocks.select, upsert: mocks.upsert });
    mocks.select.mockReturnValue({ in: mocks.in });
    mocks.in
      .mockResolvedValueOnce({ data: [{ id: 1, name: 'approver' }, { id: 2, name: 'super_admin' }], error: null })
      .mockResolvedValueOnce({ data: [{ user_id: 'approver-1' }, { user_id: 'admin-1' }, { user_id: 'customer-1' }], error: null })
      .mockResolvedValueOnce({ data: [
        { id: 'approver-1', email: 'approver@example.test', full_name: 'Approver', status: 'active' },
        { id: 'admin-1', email: 'admin@example.test', full_name: 'Admin', status: 'active' },
        { id: 'customer-1', email: 'customer@example.test', full_name: 'Customer', status: 'active' },
      ], error: null });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.enqueueEmail.mockResolvedValue({ inserted: true });
    mocks.processEmailOutbox.mockResolvedValue({ sent: 2, failed: 0 });
  });

  it('fans out idempotent in-app and email events to active approvers, excluding submitter', async () => {
    await notifyWithdrawalApprovers({ withdrawalId: 'withdrawal-1', customerUserId: 'customer-1', amountRm: 75, approvalCycle: 2 });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ user_id: 'approver-1', event_key: 'withdrawal_submitted:withdrawal-1:cycle:2:approver:approver-1' }),
      expect.objectContaining({ user_id: 'admin-1', event_key: 'withdrawal_submitted:withdrawal-1:cycle:2:approver:admin-1' }),
    ]), { onConflict: 'event_key', ignoreDuplicates: true });
    expect(mocks.enqueueEmail).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'approver-1',
      eventKey: 'withdrawal_submitted:withdrawal-1:cycle:2:approver:approver-1',
      eventType: 'withdrawal_submitted',
    }));
  });
});
