import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAccountEmail, renderKycSecurityEmail, renderRecommendationEmail, renderTransactionEmail, renderVendorEmail } from '../templates';

const occurredAt = '2026-10-14T12:00:00Z';

describe('English system mail', () => {
  beforeEach(() => vi.stubEnv('APP_URL', 'https://mylawatan.my'));
  it('names MYLawatan in English transaction mail', () => {
    const mail = renderTransactionEmail({ eventType: 'order_refunded', amountRm: 25, reference: 'MW-123', occurredAt });
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain('Your transaction has been updated in MYLawatan.');
      expect(body).not.toMatch(/mywisata|FYP App/i);
    }
  });
  it('renders a complete English transaction without translating recipient data', () => {
    const mail = renderTransactionEmail({ eventType: 'order_refunded', amountRm: 25, reference: 'MW-123', recipientName: 'Aina <Tan>', occurredAt, accessUrl: 'https://mylawatan.my/customer/orders/access#token=test' });
    expect(mail.subject).toBe('Order refund completed');
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain('Aina &lt;Tan&gt;');
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain('Amount');
      expect(body).toContain('View your order');
      expect(body).toContain('MW-123');
      expect(body).toContain('RM25.00');
    }
  });

  it('keeps the producer reason verbatim in vendor exception mail', () => {
    const reason = 'The pickup date has passed and collection is unconfirmed. MW-1 · 2 × Cake';
    const mail = renderVendorEmail({ eventType: 'vendor_order_update', vendorName: 'Baker <Shop>', recipientName: '陈先生', reason, occurredAt, actionUrl: 'https://mylawatan.my/vendor/orders' });
    expect(mail.subject).toBe('Vendor order update');
    expect(mail.html).toContain('Baker &lt;Shop&gt;');
    expect(mail.text).toContain('Hi 陈先生,');
    expect(mail.text).toContain(`Reason: ${reason}`);
    expect(mail.text).toContain('View in Vendor Portal');
  });

  it('sends English Admin security mail while excluding arbitrary incident data', () => {
    const mail = renderKycSecurityEmail({ eventType: 'kyc_security_alert', kind: 'purge_failed', count: 2, occurredAt, reason: 'private/identity.jpg' } as never);
    expect(mail.subject).toBe('MYLawatan KYC security alert');
    expect(mail.text).toContain('cleanup failed');
    expect(mail.text).toContain('Count: 2');
    expect(mail.html).not.toContain('identity.jpg');
  });

  it('renders English account and recommendation copy', () => {
    const account = renderAccountEmail({ eventType: 'account_suspended', reason: 'Manual review', occurredAt });
    expect(account.subject).toBe('Your account has been suspended');
    expect(account.text).toContain('Reason: Manual review');
    const recommendation = renderRecommendationEmail({ eventType: 'recommendation_approved', vendorName: 'Cake House', occurredAt });
    expect(recommendation.subject).toBe('Your recommendation was approved');
    expect(recommendation.text).toContain('Cake House');
  });

  it('sends approvers a generic protected-workspace email without review details', () => {
    const mail = renderAccountEmail({ eventType: 'staff_withdrawal_approval', reason: 'ignored private details', occurredAt });
    expect(mail.subject).toBe('Withdrawal review task assigned');
    expect(mail.text).toContain('protected Admin workspace');
    expect(mail.text).toContain('Open withdrawal approvals');
    expect(mail.text).not.toContain('ignored private details');
    expect(mail.text).not.toContain('RM');
  });

  it('labels event changes and boolean values without changing venue names', () => {
    const mail = renderVendorEmail({ eventType: 'vendor_event_update', vendorName: 'Craft House', reason: 'Manual note', occurredAt, eventChange: { kind: 'approval', eventTitle: 'Market', locationName: 'Hall A', startsOn: '2026-11-01', endsOn: '2026-11-02', actionPath: '/vendor/events', reason: 'Participation approved', changes: [{ field: 'stallNumber', before: '', after: 'A12' }, { field: 'applicationsOpen', before: 'false', after: 'true' }] } });
    expect(mail.subject).toBe('Your event participation is approved');
    expect(mail.text).toContain('Stall: Not set → A12');
    expect(mail.text).toContain('Applications open: No → Yes');
    expect(mail.text).toContain('Hall A');
  });

  it('ignores a stale locale left on an old outbox payload', () => {
    const mail = renderTransactionEmail({ locale: 'zh-CN', eventType: 'withdrawal_failed', amountRm: 1, reference: 'MW-2', occurredAt } as never);
    expect(mail.subject).toBe('Withdrawal failed');
    expect(mail.html).toContain('lang="en"');
  });
});
