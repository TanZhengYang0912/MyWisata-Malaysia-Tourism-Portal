import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';
import addressparser from 'nodemailer/lib/addressparser';

export type EmailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

/** Server-only configuration. Never call this from a client component. */
export function getEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const host = env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(env.SMTP_PORT || 587);
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.trim();
  const sender = env.EMAIL_FROM?.trim() || user;

  if (!user || !pass || !sender) {
    throw new Error('Email SMTP configuration is missing SMTP_USER, SMTP_PASS, or EMAIL_FROM');
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Email SMTP configuration has an invalid SMTP_PORT');
  }

  const addresses = addressparser(sender, { flatten: true });
  if (/[\r\n]/.test(sender) || addresses.length !== 1 || !addresses[0].address.includes('@')) {
    throw new Error('Email SMTP configuration has an invalid EMAIL_FROM');
  }
  // The mailbox is configuration; the public brand must not drift with an old display-name override.
  const from = `${BRAND_NAME} <${addresses[0].address}>`;
  return { host, port, user, pass, from };
}
