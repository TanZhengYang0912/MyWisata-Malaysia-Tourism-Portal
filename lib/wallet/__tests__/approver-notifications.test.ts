import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn(), enqueue: vi.fn(), smtp: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc, from: () => ({ upsert: mocks.upsert }) }) }));
vi.mock('@/lib/email/outbox', () => ({ enqueueEmail: mocks.enqueue, processEmailOutbox: mocks.smtp }));
import { notifyWithdrawalApprovers, processWithdrawalApproverNotifications } from '../approver-notifications';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation((name: string) => {
    const data = name === 'claim_withdrawal_approver_job' ? { withdrawalId: id(1), cycle: 2, stage: 'pending', cursor: null, token: id(4), customerUserId: id(2) }
      : name === 'deliver_withdrawal_approver_notifications' ? { stale: false, recipients: [{ id: id(3), email: 'reviewer@example.test', full_name: 'Reviewer', preferred_locale: 'en' }] }
      : true;
    const result = { data, error: null };
    return Object.assign(Promise.resolve(result), { abortSignal: async () => result });
  });
  mocks.upsert.mockResolvedValue({ error: null }); mocks.enqueue.mockResolvedValue({ inserted: true });
});
describe('durable approval notifications', () => {
  it('customer requests only persist an intent, without fanout or SMTP', async () => {
    await notifyWithdrawalApprovers({ withdrawalId: id(1), approvalCycle: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith('enqueue_withdrawal_approvers', { p_id: id(1), p_cycle: 2 });
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.enqueue).not.toHaveBeenCalled(); expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it('uses the atomic status-checked delivery RPC and checkpoints only after durable writes', async () => {
    expect(await processWithdrawalApproverNotifications()).toEqual({ recipients: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith('deliver_withdrawal_approver_notifications', {
      p_id: id(1), p_cycle: 2, p_stage: 'pending', p_token: id(4), p_cursor: null,
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      userId: id(3), eventType: 'staff_withdrawal_approval',
      eventKey: `withdrawal_submitted:${id(1)}:cycle:2:approver:${id(3)}`,
      reason: 'A withdrawal approval task is waiting in the protected Admin workspace.',
    }), expect.anything());
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_withdrawal_approver_job', expect.objectContaining({ p_cursor: id(3), p_complete: true, p_failed: false }));
    expect(mocks.smtp).not.toHaveBeenCalled();
  });
  it('retains the old cursor after a partial enqueue failure for safe replay', async () => {
    mocks.enqueue.mockRejectedValue(new Error('private transport details'));
    await expect(processWithdrawalApproverNotifications()).rejects.toThrow('notification_batch_unconfirmed');
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_withdrawal_approver_job', expect.objectContaining({ p_cursor: null, p_failed: true }));
  });
  it('keeps overdue escalation email intents distinct from approval-stage intents', async () => {
    mocks.rpc.mockImplementation((name: string) => {
      const data = name === 'claim_withdrawal_approver_job' ? { withdrawalId: id(5), cycle: 1, stage: 'overdue', cursor: null, token: id(6), customerUserId: id(7) }
        : name === 'deliver_withdrawal_approver_notifications' ? { stale: false, recipients: [{ id: id(8), email: 'superadmin@example.test', full_name: 'Admin', preferred_locale: 'en' }] }
        : true;
      const result = { data, error: null };
      return Object.assign(Promise.resolve(result), { abortSignal: async () => result });
    });
    await expect(processWithdrawalApproverNotifications()).resolves.toEqual({ recipients: 1 });
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: `withdrawal_overdue:${id(5)}:cycle:1:approver:${id(8)}`,
      reason: 'An overdue withdrawal needs Super Admin attention in the protected Admin workspace.',
    }), expect.anything());
    expect(mocks.rpc).toHaveBeenLastCalledWith('finish_withdrawal_approver_job', expect.objectContaining({ p_stage: 'overdue', p_complete: true }));
  });
});
