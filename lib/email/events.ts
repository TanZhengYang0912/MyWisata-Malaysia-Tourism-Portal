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
};

export type VendorEmailEventInput = VendorEmailInput & {
  userId: string;
  eventKey: string;
};

export async function enqueueVendorClaimInviteEmail(input: {
  recommendationId: string;
  email: string;
  vendorName: string;
  claimUrl: string;
}): Promise<void> {
  await enqueueEmail({
    eventKey: `vendor_claim_invite:${input.recommendationId}`,
    toEmail: input.email,
    eventType: 'vendor_account_update',
    vendorName: input.vendorName,
    reason: 'Your business has been invited to complete vendor onboarding.',
    reference: input.claimUrl,
    occurredAt: new Date().toISOString(),
  });

  try {
    await processEmailOutbox(10);
  } catch (error) {
    console.error('[email-outbox] vendor claim invite failed:', error);
  }
}

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
  } catch (error) {
    console.error('[email-outbox] recommendation approval failed:', error);
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
  });

  try {
    await processEmailOutbox(10);
  } catch (error) {
    console.error('[email-outbox] vendor notification failed:', error);
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
  } catch (error) {
    console.error('[email-outbox] account notification failed:', error);
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

export async function enqueueUserTransactionEmail(input: UserEmailEventInput): Promise<void> {
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
    amountRm: input.amountRm,
    reference: input.reference,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  });

  // Payment/status routes should deliver promptly, while failures remain in the outbox.
  try {
    await processEmailOutbox(10);
  } catch (error) {
    console.error('[email-outbox] enqueue/process failed:', error);
  }
}
