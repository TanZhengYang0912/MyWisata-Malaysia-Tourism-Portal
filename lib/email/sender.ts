import nodemailer from 'nodemailer';
import { getEmailConfig } from '@/lib/email/config';
import {
  escapeHtml,
  renderAccountEmail,
  renderRecommendationEmail,
  renderTransactionEmail,
  renderVendorEmail,
  type AccountEmailInput,
  type RecommendationEmailInput,
  type TransactionEmailInput,
  type VendorEmailInput,
} from '@/lib/email/templates';

export type SendTransactionEmailInput = TransactionEmailInput & { to: string };
export type SendAccountEmailInput = AccountEmailInput & { to: string };
export type SendRecommendationEmailInput = RecommendationEmailInput & { to: string };
export type SendVendorEmailInput = VendorEmailInput & { to: string };

function redactError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Unknown SMTP error';
  return new Error(message.replace(/(?:password|pass|token|secret|auth)=[^\s]+/gi, '$1=[redacted]'));
}

async function sendRenderedEmail(to: string, rendered: { subject: string; html: string; text: string }): Promise<{ id: string }> {
  to = to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error('Email recipient is invalid');
  }

  const config = getEmailConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  try {
    const result = await transport.sendMail({
      from: config.from,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    return { id: result.messageId };
  } catch (error) {
    throw redactError(error);
  } finally {
    transport.close();
  }
}

/** Server-only SMTP sender. The caller should persist an outbox row before invoking this. */
export function sendTransactionEmail(input: SendTransactionEmailInput): Promise<{ id: string }> {
  return sendRenderedEmail(input.to, renderTransactionEmail(input));
}

export function sendAccountEmail(input: SendAccountEmailInput): Promise<{ id: string }> {
  return sendRenderedEmail(input.to, renderAccountEmail(input));
}

export function sendRecommendationEmail(input: SendRecommendationEmailInput): Promise<{ id: string }> {
  return sendRenderedEmail(input.to, renderRecommendationEmail(input));
}

export function sendVendorEmail(input: SendVendorEmailInput): Promise<{ id: string }> {
  return sendRenderedEmail(input.to, renderVendorEmail(input));
}

export type SendCustomVendorEmailInput = { to: string; subject: string; body: string };

// Bypasses renderVendorEmail()'s fixed template entirely — used for the
// admin-drafted/edited vendor recommendation invite (subject+body come from
// the admin, not a closed VendorEmailType enum). Deliberately skips
// sanitizeVendorText()'s PII-redaction regexes: that function exists for
// text assembled from provider metadata, not admin-reviewed outbound prose
// — running it here risks mangling content the admin chose to include.
// escapeHtml() is still applied for HTML-injection safety.
export function sendCustomVendorEmail(input: SendCustomVendorEmailInput): Promise<{ id: string }> {
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#183b35;line-height:1.5">${input.body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')}</body></html>`;
  return sendRenderedEmail(input.to, { subject: input.subject, html, text: input.body });
}
