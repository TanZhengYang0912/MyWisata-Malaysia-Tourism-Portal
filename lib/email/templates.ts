export type TransactionEmailType =
  | 'checkout_succeeded'
  | 'topup_succeeded'
  | 'withdrawal_submitted'
  | 'withdrawal_approved'
  | 'withdrawal_hold'
  | 'withdrawal_paid'
  | 'withdrawal_failed'
  | 'withdrawal_rejected'
  | 'recommendation_reward_pending'
  | 'recommendation_reward_available'
  | 'recommendation_reward_reversed';

export type AccountEmailType =
  | 'account_suspended'
  | 'account_unsuspended'
  | 'account_deleted'
  | 'account_restored';

export type TransactionEmailInput = {
  eventType: TransactionEmailType;
  recipientName?: string | null;
  amountRm: number;
  reference: string;
  occurredAt: string;
};

export type AccountEmailInput = {
  eventType: AccountEmailType;
  recipientName?: string | null;
  reason: string;
  occurredAt: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const SUBJECTS: Record<TransactionEmailType, string> = {
  checkout_succeeded: 'Checkout payment received',
  topup_succeeded: 'Wallet Top-up successful',
  withdrawal_submitted: 'Withdrawal request received',
  withdrawal_approved: 'Withdrawal approved',
  withdrawal_hold: 'Withdrawal placed on hold',
  withdrawal_paid: 'Withdrawal paid',
  withdrawal_failed: 'Withdrawal failed',
  withdrawal_rejected: 'Withdrawal rejected',
  recommendation_reward_pending: 'Your recommendation earned a pending reward',
  recommendation_reward_available: 'Your recommendation reward is now available',
  recommendation_reward_reversed: 'Your pending recommendation reward was reversed',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

export function renderTransactionEmail(input: TransactionEmailInput): RenderedEmail {
  const subject = SUBJECTS[input.eventType];
  const name = input.recipientName?.trim() || 'there';
  const amount = `RM ${input.amountRm.toFixed(2)}`;
  const reference = input.reference.trim();
  const occurredAt = new Date(input.occurredAt).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const safeName = escapeHtml(name);
  const safeSubject = escapeHtml(subject);
  const safeAmount = escapeHtml(amount);
  const safeReference = escapeHtml(reference);
  const safeOccurredAt = escapeHtml(occurredAt);

  const text = [
    `Hi ${name},`,
    '',
    subject,
    `Amount: ${amount}`,
    `Reference: ${reference}`,
    `Time: ${occurredAt}`,
    '',
    'This is an automated message from FYP App. Please do not reply with passwords or identity documents.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><body style="font-family:Arial,sans-serif;color:#183b35;line-height:1.5">
  <h2>${safeSubject}</h2>
  <p>Hi ${safeName},</p>
  <p>Your transaction has been updated in FYP App.</p>
  <table role="presentation" cellpadding="6">
    <tr><td><strong>Amount</strong></td><td>${safeAmount}</td></tr>
    <tr><td><strong>Reference</strong></td><td>${safeReference}</td></tr>
    <tr><td><strong>Time</strong></td><td>${safeOccurredAt} (Malaysia time)</td></tr>
  </table>
  <p>This is an automated message. Never reply with passwords or identity documents.</p>
</body></html>`;

  return { subject, html, text };
}

const ACCOUNT_SUBJECTS: Record<AccountEmailType, string> = {
  account_suspended: 'Your account has been suspended',
  account_unsuspended: 'Your account has been reinstated',
  account_deleted: 'Your account has been closed',
  account_restored: 'Your account has been restored',
};

export function renderAccountEmail(input: AccountEmailInput): RenderedEmail {
  const subject = ACCOUNT_SUBJECTS[input.eventType];
  const name = input.recipientName?.trim() || 'there';
  const reason = input.reason.trim();
  const occurredAt = new Date(input.occurredAt).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const safeName = escapeHtml(name);
  const safeSubject = escapeHtml(subject);
  const safeReason = escapeHtml(reason);
  const safeOccurredAt = escapeHtml(occurredAt);
  const text = [
    `Hi ${name},`,
    '',
    subject,
    `Reason: ${reason}`,
    `Time: ${occurredAt}`,
    '',
    'For questions, please contact support. Never reply with passwords or identity documents.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="en"><body style="font-family:Arial,sans-serif;color:#183b35;line-height:1.5">
  <h2>${safeSubject}</h2>
  <p>Hi ${safeName},</p>
  <p>Your MyWisata account status has been updated.</p>
  <p><strong>Reason:</strong> ${safeReason}</p>
  <p><strong>Time:</strong> ${safeOccurredAt} (Malaysia time)</p>
  <p>For questions, please contact support. Never reply with passwords or identity documents.</p>
</body></html>`;
  return { subject, html, text };
}
