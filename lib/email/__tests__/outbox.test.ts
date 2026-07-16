import { describe, expect, it } from 'vitest';
import { makeEmailEventKey } from '@/lib/email/outbox';
import { getEmailConfig } from '@/lib/email/config';

describe('email outbox contracts', () => {
  it('creates deterministic event keys', () => {
    expect(makeEmailEventKey('topup_succeeded', 'evt_123')).toBe('topup_succeeded:evt_123');
    expect(makeEmailEventKey('topup_succeeded', 'evt_123')).toBe(makeEmailEventKey('topup_succeeded', 'evt_123'));
  });

  it('requires server-only SMTP credentials', () => {
    expect(() => getEmailConfig({ SMTP_USER: 'user@gmail.com' })).toThrow('SMTP_USER, SMTP_PASS, or EMAIL_FROM');
  });

  it('defaults to Gmail SMTP port 587', () => {
    expect(getEmailConfig({
      SMTP_USER: 'user@gmail.com',
      SMTP_PASS: 'app-password',
      EMAIL_FROM: 'FYP App <user@gmail.com>',
    })).toMatchObject({ host: 'smtp.gmail.com', port: 587 });
  });
});
