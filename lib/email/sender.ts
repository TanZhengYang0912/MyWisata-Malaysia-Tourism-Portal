import nodemailer from 'nodemailer';
import { getEmailConfig } from '@/lib/email/config';
import { renderAccountEmail, renderTransactionEmail, type AccountEmailInput, type TransactionEmailInput } from '@/lib/email/templates';

export type SendTransactionEmailInput = TransactionEmailInput & { to: string };
export type SendAccountEmailInput = AccountEmailInput & { to: string };

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
