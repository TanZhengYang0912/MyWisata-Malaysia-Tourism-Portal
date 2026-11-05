import { emailLocale } from '@/lib/email/copy';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueEmail } from '@/lib/email/outbox';
import { z } from 'zod';

export type ApproverNotificationInput = {
  withdrawalId: string;
  approvalCycle?: number;
};

/** The transaction trigger is authoritative; this idempotent nudge also covers
 * existing callers. Customer requests never enumerate recipients or send SMTP. */
export async function notifyWithdrawalApprovers(input: ApproverNotificationInput): Promise<void> {
  try {
    const { error } = await createServiceClient().rpc('enqueue_withdrawal_approvers', {
      p_id: input.withdrawalId, p_cycle: input.approvalCycle ?? 1,
    }).abortSignal(AbortSignal.timeout(5_000));
    if (error) throw new Error('notification_intent_unavailable');
  } catch { console.error('[wallet] notification intent unavailable'); }
}

const jobSchema = z.object({
  withdrawalId: z.string().uuid(), cycle: z.number().int().positive(), stage: z.enum(['pending', 'pending_second_approval', 'overdue']), cursor: z.string().uuid().nullable(),
  token: z.string().uuid(), customerUserId: z.string().uuid(),
});
const recipientsSchema = z.array(z.object({
  id: z.string().uuid(), email: z.string().nullable(), full_name: z.string().nullable(), preferred_locale: z.string().nullable(),
})).max(25);
const deliveryBatchSchema = z.object({ stale: z.boolean(), recipients: recipientsSchema });

/** One checkpointed batch per invocation, before the existing mail worker runs. */
export async function processWithdrawalApproverNotifications() {
  const db = createServiceClient({ signal: AbortSignal.timeout(45_000) });
  const { data, error } = await db.rpc('claim_withdrawal_approver_job');
  if (error) throw new Error('notification_claim_unavailable');
  if (data === null) return { recipients: 0 };
  const parsed = jobSchema.safeParse(data);
  if (!parsed.success) throw new Error('notification_job_invalid');
  const job = parsed.data;
  let cursor = job.cursor;
  let complete = false;
  let failed = false;
  let count = 0;
  try {
    const result = await db.rpc('deliver_withdrawal_approver_notifications', {
      p_id: job.withdrawalId,
      p_cycle: job.cycle,
      p_stage: job.stage,
      p_token: job.token,
      p_cursor: job.cursor,
    });
    const batch = deliveryBatchSchema.safeParse(result.data);
    if (result.error || !batch.success) throw new Error('notification_delivery_unavailable');
    if (batch.data.stale) return { recipients: 0 };
    const users = batch.data.recipients;
    if (users.some((user) => user.id === job.customerUserId)) throw new Error('notification_recipient_invalid');
    if (users.length) {
      const stageSuffix = job.stage === 'pending_second_approval' ? ':stage:second' : '';
      const eventPrefix = job.stage === 'overdue' ? 'withdrawal_overdue' : 'withdrawal_submitted';
      const eventKey = (id: string) => `${eventPrefix}:${job.withdrawalId}:cycle:${job.cycle}:approver:${id}${stageSuffix}`;
      const emails = await Promise.allSettled(users.filter((user) => user.email?.trim()).map((user) => enqueueEmail({
        eventKey: eventKey(user.id), userId: user.id, toEmail: user.email!.trim(),
        locale: emailLocale(user.preferred_locale), eventType: 'staff_withdrawal_approval', recipientName: user.full_name,
        reason: job.stage === 'overdue'
          ? 'An overdue withdrawal needs Super Admin attention in the protected Admin workspace.'
          : 'A withdrawal approval task is waiting in the protected Admin workspace.',
        occurredAt: new Date().toISOString(),
      }, db)));
      if (emails.some((result) => result.status === 'rejected')) throw new Error('notification_email_unavailable');
      cursor = users[users.length - 1].id;
    }
    count = users.length;
    complete = users.length < 25;
  } catch { failed = true; }
  // A separate bounded client can checkpoint after the work deadline expired.
  const saved = await createServiceClient().rpc('finish_withdrawal_approver_job', {
    p_id: job.withdrawalId, p_cycle: job.cycle, p_stage: job.stage, p_token: job.token,
    p_cursor: cursor, p_complete: complete, p_failed: failed,
  }).abortSignal(AbortSignal.timeout(5_000));
  if (failed || saved.error || saved.data !== true) throw new Error('notification_batch_unconfirmed');
  return { recipients: count };
}
