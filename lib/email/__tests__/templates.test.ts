import { describe, expect, it } from 'vitest';
import { renderTransactionEmail } from '@/lib/email/templates';

describe('transaction email templates', () => {
  it('renders a top-up confirmation without sensitive fields', () => {
    const result = renderTransactionEmail({
      eventType: 'topup_succeeded',
      recipientName: 'Aina',
      amountRm: 25,
      reference: 'evt_123',
      occurredAt: '2026-07-15T10:00:00.000Z',
    });

    expect(result.subject).toContain('Top-up');
    expect(result.html).toContain('RM25.00');
    expect(result.text).toContain('evt_123');
    expect(result.html).not.toContain('990101-14-5678');
    expect(result.html).not.toContain('re_');
  });

  it('renders withdrawal statuses with stable subjects', () => {
    const result = renderTransactionEmail({
      eventType: 'withdrawal_failed',
      recipientName: null,
      amountRm: 100,
      reference: 'wd_123',
      occurredAt: '2026-07-15T10:00:00.000Z',
    });

    expect(result.subject).toBe('Withdrawal failed');
    expect(result.html).toContain('RM100.00');
    expect(result.text).toContain('wd_123');
  });
});
