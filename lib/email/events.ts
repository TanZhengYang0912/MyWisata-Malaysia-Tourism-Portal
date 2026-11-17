import { after } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueEmail, processEmailOutbox } from '@/lib/email/outbox';
import type {
  AccountEmailType,
  TransactionEmailType,
  VendorEmailInput,
} from '@/lib/email/templates';

type UserEmailEventInput = {
  userId: string;
  eventType: TransactionEmailType;
  eventKey: string;
  reference: string;
  amountRm: number;
  occurredAt?: string;
  /** Order checkout emails go to the contact email saved on this order, not the account email. */
  orderId?: string;
  /** Persist the intent only; a scheduled outbox worker handles delivery. */
  deferDelivery?: boolean;
};

export type VendorEmailEventInput = VendorEmailInput & {
  userId: string;
  eventKey: string;
};

export async function enqueueRecommendationApprovalEmail(input: {
  recommendationId: string;
  userId: string;
  vendorName: string;
  occurredAt?: string;
}): Promise<void> {
  const db = createServiceClient();
  const { data: user, error } = await db
    .from('users')
    .select('email, full_name')
    .eq('id', input.userId)
    .single();

  if (error || !user) throw new Error(`Cannot find email recipient for user ${input.userId}`);
  const toEmail = String((user as { email?: string | null }).email ?? '').trim();
  if (!toEmail) throw new Error(`User ${input.userId} has no email address`);

  await enqueueEmail({
    eventKey: `recommendation_approved:${input.recommendationId}`,
    userId: input.userId,
    toEmail,
    eventType: 'recommendation_approved',
    recipientName: (user as { full_name?: string | null }).full_name ?? null,
    vendorName: input.vendorName,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });

  try {
    await processEmailOutbox(10);
  } catch {
    console.error('[email-outbox] email_processing_unavailable');
  }
}

export async function enqueueVendorEmail(input: VendorEmailEventInput): Promise<void> {
  const db = createServiceClient();
  const { data: user, error } = await db
    .from('users')
    .select('email, full_name')
    .eq('id', input.userId)
    .single();

  if (error || !user) throw new Error(`Cannot find email recipient for user ${input.userId}`);
  const toEmail = String((user as { email?: string | null }).email ?? '').trim();
  if (!toEmail) throw new Error(`User ${input.userId} has no email address`);

  await enqueueEmail({
    eventKey: input.eventKey,
    userId: input.userId,
    toEmail,
    eventType: input.eventType,
    recipientName: (user as { full_name?: string | null }).full_name ?? input.recipientName ?? null,
    vendorName: input.vendorName,
    reason: input.reason,
    reference: input.reference ?? null,
    occurredAt: input.occurredAt,
    eventChange: input.eventChange,
  });

  try {
    await processEmailOutbox(10);
  } catch {
    console.error('[email-outbox] email_processing_unavailable');
  }
}

export async function enqueueUserAccountEmail(input: {
  userId: string;
  eventType: AccountEmailType;
  eventKey: string;
  reason: string;
  occurredAt?: string;
}): Promise<void> {
  const db = createServiceClient();
  const { data: user, error } = await db
    .from('users')
    .select('email, full_name')
    .eq('id', input.userId)
    .single();

  if (error || !user) throw new Error(`Cannot find email recipient for user ${input.userId}`);
  const toEmail = String((user as { email?: string | null }).email ?? '').trim();
  if (!toEmail) throw new Error(`User ${input.userId} has no email address`);

  await enqueueEmail({
    eventKey: input.eventKey,
    userId: input.userId,
    toEmail,
    eventType: input.eventType,
    recipientName: (user as { full_name?: string | null }).full_name ?? null,
    reason: input.reason,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });

  try {
    await processEmailOutbox(10);
  } catch {
    console.error('[email-outbox] email_processing_unavailable');
  }
}

export async function enqueueWithdrawalEmail(input: {
  withdrawalId: string;
  userId: string;
  eventType: Extract<TransactionEmailType, `withdrawal_${string}`>;
  amountRm: number;
  occurredAt?: string;
}): Promise<void> {
  return enqueueUserTransactionEmail({
    userId: input.userId,
    eventType: input.eventType,
    eventKey: `${input.eventType}:${input.withdrawalId}`,
    reference: input.withdrawalId,
    amountRm: input.amountRm,
    occurredAt: input.occurredAt,
  });
}

/** Dispatch is an accelerator; the business transaction and Cron retain the intent. */
export function scheduleEmailDelivery(): void {
  after(async () => {
    try { await processEmailOutbox(10); }
    catch { console.error('[email-outbox] email_processing_unavailable'); }
  });
}

/** Backwards-compatible name for order receipt callers. */
export function scheduleReceiptDelivery(): void {
  scheduleEmailDelivery();
}

export async function enqueueUserTransactionEmail(input: UserEmailEventInput): Promise<void> {
  const db = createServiceClient();
  if (input.eventType === 'checkout_succeeded' && input.orderId) {
    const { data, error } = await db.rpc('queue_order_receipt', { p_order_id: input.orderId });
    if (error || data !== true) throw new Error('receipt_queue_unavailable');
    try { await processEmailOutbox(10); }
    catch { console.error('[email-outbox] email_processing_unavailable'); }
    return;
  }
  const { data: user, error } = await db
    .from('users')
    .select('email, full_name')
    .eq('id', input.userId)
    .single();

  if (error || !user) throw new Error(`Cannot find email recipient for user ${input.userId}`);
  let toEmail = String((user as { email?: string | null }).email ?? '').trim();
  if (input.orderId) {
    const { data: order, error: orderError } = await db.from('orders').select('contact_email').eq('id', input.orderId).eq('user_id', input.userId).maybeSingle();
    if (orderError || !order) throw new Error('email_order_recipient_unavailable');
    toEmail = String(order?.contact_email ?? '').trim() || toEmail;
  }
  if (!toEmail) throw new Error(`User ${input.userId} has no email address`);

  await enqueueEmail({
    eventKey: input.eventKey,
    userId: input.userId,
    toEmail,
    eventType: input.eventType,
    recipientName: (user as { full_name?: string | null }).full_name ?? null,
    amountRm: input.amountRm,
    reference: input.reference,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });

  if (input.deferDelivery) return;

  // Payment/status routes should deliver promptly, while failures remain in the outbox.
  try {
    await processEmailOutbox(10);
  } catch {
    console.error('[email-outbox] email_processing_unavailable');
  }
}
