import { createServiceClient } from '@/lib/supabase/service';
import { enqueueEmail, processEmailOutbox } from '@/lib/email/outbox';
import { buildWithdrawalNotificationMetadata, buildWithdrawalNotificationReason, type WithdrawalNotificationSnapshot } from './withdrawal-review-projection';
import { formatMYR } from '@/lib/i18n/format';

export type ApproverNotificationInput = {
  withdrawalId: string;
  customerUserId: string;
  amountRm: number;
  approvalCycle?: number;
  snapshot?: WithdrawalNotificationSnapshot;
};

/** Notify every active Wallet Approver and Super Admin after a new review cycle starts. */
export async function notifyWithdrawalApprovers(input: ApproverNotificationInput): Promise<void> {
  try {
    const service = createServiceClient();
    const { data: roles, error: rolesError } = await service
      .from('roles')
      .select('id,name')
      .in('name', ['approver', 'super_admin']);
    if (rolesError) throw rolesError;

    const roleIds = (roles ?? []).map((role) => role.id as number);
    if (!roleIds.length) return;
    let snapshot = input.snapshot;
    if (!snapshot) {
      const { data: snapshotData, error: snapshotError } = await service.rpc('get_withdrawal_notification_snapshot', { p_withdrawal_id: input.withdrawalId });
      if (snapshotError || !snapshotData) throw snapshotError ?? new Error('withdrawal_notification_snapshot_missing');
      snapshot = snapshotData as WithdrawalNotificationSnapshot;
    }
    const { data: assignments, error: assignmentsError } = await service
      .from('user_roles')
      .select('user_id')
      .in('role_id', roleIds);
    if (assignmentsError) throw assignmentsError;

    const recipientIds = [...new Set((assignments ?? []).map((row) => row.user_id as string))]
      .filter((userId) => userId !== input.customerUserId);
    if (!recipientIds.length) return;

    const { data: users, error: usersError } = await service
      .from('users')
      .select('id,email,full_name,status')
      .in('id', recipientIds);
    if (usersError) throw usersError;

    const cycle = input.approvalCycle ?? 1;
    const recipientSet = new Set(recipientIds);
    const recipients = (users ?? []).filter((user) => recipientSet.has(user.id) && user.status === 'active');
    if (!recipients.length) return;
    const eventKey = (userId: string) => `withdrawal_submitted:${input.withdrawalId}:cycle:${cycle}:approver:${userId}`;
    const notificationReason = buildWithdrawalNotificationReason(snapshot);
    const notificationMetadata = buildWithdrawalNotificationMetadata(snapshot);

    const notificationRows = recipients.map((user) => ({
      user_id: user.id,
      type: 'withdrawal_submitted',
      title: 'New withdrawal requires review',
      body: `A customer submitted a withdrawal of ${formatMYR(input.amountRm)} for review. ${notificationReason}`,
      link: `/admin/withdrawals/${input.withdrawalId}`,
      event_key: eventKey(user.id),
      category: 'wallet',
      metadata: { withdrawal_id: input.withdrawalId, approval_cycle: cycle, ...notificationMetadata },
    }));
    const { error: notificationError } = await service
      .from('notifications')
      .upsert(notificationRows, { onConflict: 'event_key', ignoreDuplicates: true });
    if (notificationError) throw notificationError;

    const emailJobs = recipients
      .filter((user) => typeof user.email === 'string' && user.email.trim().length > 0)
      .map((user) => enqueueEmail({
        eventKey: eventKey(user.id),
        userId: user.id,
        toEmail: user.email.trim(),
        eventType: 'withdrawal_submitted',
        recipientName: user.full_name ?? null,
        amountRm: input.amountRm,
        reference: input.withdrawalId,
        reason: notificationReason,
        occurredAt: new Date().toISOString(),
      }));
    await Promise.allSettled(emailJobs);
    if (emailJobs.length) await processEmailOutbox(emailJobs.length);
  } catch (error) {
    console.error('[wallet] approver notification fan-out failed:', error instanceof Error ? error.message : error);
  }
}
