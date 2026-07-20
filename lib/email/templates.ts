export type TransactionEmailType =
  | 'checkout_succeeded'
  | 'topup_succeeded'
  | 'topup_failed'
  | 'topup_refunded'
  | 'withdrawal_submitted'
  | 'withdrawal_approved'
  | 'withdrawal_hold'
  | 'withdrawal_resumed'
  | 'withdrawal_paid'
  | 'withdrawal_failed'
  | 'withdrawal_rejected'
  | 'wallet_adjustment'
  | 'payout_account_connected'
  | 'payout_account_disconnected'
  | 'recommendation_reward_pending'
  | 'recommendation_reward_available'
  | 'recommendation_reward_reversed';

export type AccountEmailType =
  | 'account_suspended'
  | 'account_unsuspended'
  | 'account_deleted'
  | 'account_restored';

export type VendorEmailType =
  | 'vendor_order_update'
  | 'vendor_booking_update'
  | 'vendor_listing_review'
  | 'vendor_wallet_update'
  | 'vendor_account_update'
  | 'vendor_permission_update';

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

export type VendorEmailInput = {
  eventType: VendorEmailType;
  recipientName?: string | null;
  vendorName: string;
  reason: string;
  reference?: string | null;
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
  topup_failed: 'Wallet Top-up failed',
  topup_refunded: 'Wallet Top-up refunded',
  withdrawal_submitted: 'Withdrawal request received',
  withdrawal_approved: 'Withdrawal approved',
  withdrawal_hold: 'Withdrawal placed on hold',
  withdrawal_resumed: 'Withdrawal review resumed',
  withdrawal_paid: 'Withdrawal paid',
  withdrawal_failed: 'Withdrawal failed',
  withdrawal_rejected: 'Withdrawal rejected',
  wallet_adjustment: 'Wallet balance adjusted',
  payout_account_connected: 'Payout account connected',
  payout_account_disconnected: 'Payout account disconnected',
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

// Notification reasons and references may be assembled from provider metadata.
// Keep provider object IDs and key/value secrets out of email content while
// preserving a useful, human-readable explanation for the recipient.
function sanitizeVendorText(value: string): string {
  return value
    // Redact labelled financial, identity, contact, and location values while
    // retaining the label so the notification remains understandable.
    .replace(/\b(bank\s+account|account(?:\s+(?:number|no))?|card(?:\s+(?:number|no))?|iban|identity(?:\s+(?:card|number|no))?|passport|my\s*kad|mykad|ic|dob|date\s+of\s+birth|email|e-mail|phone|mobile|address)\s*[:=#-]\s*([^,;\n|]+)/gi, '$1: [redacted]')
    // Provider object IDs and secrets must never be exposed in email content.
    .replace(/\b(?:sk|rk|pk|pi|ch|cs|re|cus|acct|pm|src|tok|seti|price|prod|sub|in|ca|evt|whsec)_[A-Za-z0-9_-]+\b/gi, '[redacted]')
    .replace(/\b(?:password|pass|token|secret|auth)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    // Defence in depth for unlabelled email addresses and Malaysian ICs.
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
    .replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, '[redacted]')
    // Unlabelled phone, IBAN, passport, and payment/account-like values.
    .replace(/\+\d{1,3}(?:[\s().-]*\d){7,14}/g, '[redacted]')
    .replace(/(?:\(\s*0\d{1,2}\s*\)|\b0\d{1,2})(?:[\s.-]?\d){7,9}/g, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 9 && digits.length <= 11 ? '[redacted]' : match;
    })
    .replace(/\b[A-Z]{2}\s*\d{2}(?:[\s-]*[A-Z0-9]){11,30}\b/gi, (match) => {
      const normalized = match.replace(/[\s-]/g, '');
      const digitCount = (normalized.match(/\d/g) ?? []).length;
      return normalized.length >= 15 && normalized.length <= 34 && digitCount >= 6 ? '[redacted]' : match;
    })
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, (match) => {
      const digitCount = (match.match(/\d/g) ?? []).length;
      return digitCount >= 6 ? '[redacted]' : match;
    })
    .replace(/\b[A-Z]{1,2}[\s-]?\d{6,9}\b/gi, '[redacted]')
    .replace(/(?<!\d)(?:\d[\d -]?){12,18}\d(?!\d)/g, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 ? '[redacted]' : match;
    });
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

const VENDOR_SUBJECTS: Record<VendorEmailType, string> = {
  vendor_order_update: 'Vendor order update',
  vendor_booking_update: 'Vendor booking update',
  vendor_listing_review: 'Vendor listing review update',
  vendor_wallet_update: 'Vendor wallet update',
  vendor_account_update: 'Vendor account update',
  vendor_permission_update: 'Vendor permission update',
};

export function renderVendorEmail(input: VendorEmailInput): RenderedEmail {
  const subject = VENDOR_SUBJECTS[input.eventType];
  const name = input.recipientName?.trim() || 'there';
  const vendorName = sanitizeVendorText(input.vendorName.trim());
  const reason = sanitizeVendorText(input.reason.trim());
  const reference = input.reference ? sanitizeVendorText(input.reference.trim()) : '';
  const occurredAt = new Date(input.occurredAt).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const safeName = escapeHtml(name);
  const safeSubject = escapeHtml(subject);
  const safeVendorName = escapeHtml(vendorName);
  const safeReason = escapeHtml(reason);
  const safeReference = escapeHtml(reference);
  const safeOccurredAt = escapeHtml(occurredAt);
  const referenceLine = reference ? `Reference: ${reference}` : '';
  const referenceRow = reference
    ? `<tr><td><strong>Reference</strong></td><td>${safeReference}</td></tr>`
    : '';

  const text = [
    `Hi ${name},`,
    '',
    subject,
    `Vendor: ${vendorName}`,
    `Reason: ${reason}`,
    referenceLine,
    `Time: ${occurredAt}`,
    '',
    'This is an automated message from FYP App. Please do not reply with passwords or identity documents.',
  ].filter((line) => line !== '').join('\n');

  const html = `<!doctype html>
<html lang="en"><body style="font-family:Arial,sans-serif;color:#183b35;line-height:1.5">
  <h2>${safeSubject}</h2>
  <p>Hi ${safeName},</p>
  <p>There is an important update for <strong>${safeVendorName}</strong>.</p>
  <p><strong>Reason:</strong> ${safeReason}</p>
  <table role="presentation" cellpadding="6">
    ${referenceRow}
    <tr><td><strong>Time</strong></td><td>${safeOccurredAt} (Malaysia time)</td></tr>
  </table>
  <p>This is an automated message. Never reply with passwords or identity documents.</p>
</body></html>`;

  return { subject, html, text };
}
