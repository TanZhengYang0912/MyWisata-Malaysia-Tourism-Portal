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
  const from = env.EMAIL_FROM?.trim() || user;

  if (!user || !pass || !from) {
    throw new Error('Email SMTP configuration is missing SMTP_USER, SMTP_PASS, or EMAIL_FROM');
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Email SMTP configuration has an invalid SMTP_PORT');
  }

  return { host, port, user, pass, from };
}
