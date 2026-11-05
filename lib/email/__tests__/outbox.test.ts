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
      EMAIL_FROM: 'MYLawatan <user@gmail.com>',
    })).toMatchObject({ host: 'smtp.gmail.com', port: 587 });
  });

  it('brands bare sender addresses without changing the SMTP login or mailbox', () => {
    const base = { SMTP_USER: 'sender@example.test', SMTP_PASS: 'secret' };
    expect(getEmailConfig(base)).toMatchObject({ user: base.SMTP_USER, from: 'MYLawatan <sender@example.test>' });
    expect(getEmailConfig({ ...base, EMAIL_FROM: 'notices@example.test' })).toMatchObject({
      user: base.SMTP_USER,
      from: 'MYLawatan <notices@example.test>',
    });
  });

  it.each(['FYP App', 'MyLawatan', 'MYLawatan'])('normalizes the configured sender display name %s without changing its mailbox', name => {
    expect(getEmailConfig({ SMTP_USER: 'smtp-login@example.test', SMTP_PASS: 'secret', EMAIL_FROM: `${name} <notices@example.test>` })).toMatchObject({
      user: 'smtp-login@example.test', from: 'MYLawatan <notices@example.test>',
    });
  });

  it('requires one sender mailbox and rejects injected headers', () => {
    for (const sender of ['One <one@example.test>, Two <two@example.test>', 'Sender <one@example.test>\r\nBcc: hidden@example.test']) {
      expect(() => getEmailConfig({ SMTP_USER: 'smtp-login@example.test', SMTP_PASS: 'secret', EMAIL_FROM: sender })).toThrow('invalid EMAIL_FROM');
    }
  });
});
