import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emailReason } from '../copy';
import { renderAccountEmail, renderKycSecurityEmail, renderRecommendationEmail, renderTransactionEmail, renderVendorEmail } from '../templates';

const occurredAt = '2026-10-14T12:00:00Z';

describe('recipient-language system mail', () => {
  beforeEach(() => vi.stubEnv('APP_URL', 'https://mylawatan.my'));
  it('names MYLawatan in English transaction mail', () => {
    const mail = renderTransactionEmail({ locale: 'en', eventType: 'order_refunded', amountRm: 25, reference: 'MW-123', occurredAt });
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain('Your transaction has been updated in MYLawatan.');
      expect(body).not.toMatch(/mywisata|FYP App/i);
    }
  });
  it.each([
    ['zh-CN', '订单退款已完成', '金额', '查看订单'],
    ['ms', 'Bayaran balik pesanan selesai', 'Amaun', 'Lihat pesanan'],
  ] as const)('localizes the complete %s transaction without translating recipient data', (locale, subject, amount, action) => {
    const mail = renderTransactionEmail({ locale, eventType: 'order_refunded', amountRm: 25, reference: 'MW-123', recipientName: 'Aina <Tan>', occurredAt, accessUrl: 'https://mylawatan.my/customer/orders/access#token=test' });
    expect(mail.subject).toBe(subject);
    expect(mail.html).toContain(`lang="${locale}"`);
    expect(mail.html).toContain('Aina &lt;Tan&gt;');
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain(amount);
      expect(body).toContain(action);
      expect(body).toContain('MW-123');
      expect(body).toContain('RM25.00');
    }
  });

  it('localizes each exception phase and keeps scope data intact', () => {
    const mail = renderVendorEmail({ locale: 'zh-CN', eventType: 'vendor_order_update', vendorName: 'Baker <Shop>', recipientName: '陈先生', reason: 'Original manual note', reasonCode: 'pickup_review', reasonDetails: 'MW-1 · 2 × Cake', occurredAt, actionUrl: 'https://mylawatan.my/vendor/orders' });
    expect(mail.subject).toBe('商家订单更新');
    expect(mail.html).toContain('Baker &lt;Shop&gt;');
    expect(mail.text).toContain('取货日期已过');
    expect(mail.text).toContain('MW-1 · 2 × Cake');
    expect(mail.text).not.toContain('Original manual note');
    expect(mail.text).toContain('查看商家后台');
  });

  it('localizes Admin security mail while excluding arbitrary incident data', () => {
    const mail = renderKycSecurityEmail({ locale: 'zh-CN', eventType: 'kyc_security_alert', kind: 'purge_failed', count: 2, occurredAt, reason: 'private/identity.jpg' } as never);
    expect(mail.subject).toContain('安全警报');
    expect(mail.text).toContain('清理失败');
    expect(mail.text).toContain('2');
    expect(mail.html).not.toContain('identity.jpg');
  });

  it('localizes account and recommendation copy', () => {
    const account = renderAccountEmail({ locale: 'ms', eventType: 'account_suspended', reason: 'Manual review', occurredAt });
    expect(account.subject).toBe('Akaun anda digantung');
    expect(account.text).toContain('Sebab: Manual review');
    const recommendation = renderRecommendationEmail({ locale: 'zh-CN', eventType: 'recommendation_approved', vendorName: 'Cake House', occurredAt });
    expect(recommendation.subject).toBe('您的推荐已获批准');
    expect(recommendation.text).toContain('Cake House');
  });

  it('sends approvers a generic protected-workspace email without review details', () => {
    const mail = renderAccountEmail({ locale: 'zh-CN', eventType: 'staff_withdrawal_approval', reason: 'ignored private details', occurredAt });
    expect(mail.subject).toBe('有提现审核任务待处理');
    expect(mail.text).toContain('受保护的 Admin 工作区');
    expect(mail.text).toContain('打开提现审批');
    expect(mail.text).not.toContain('ignored private details');
    expect(mail.text).not.toContain('RM');
  });

  it('localizes event labels and boolean display values without changing venue names', () => {
    const mail = renderVendorEmail({ locale: 'zh-CN', eventType: 'vendor_event_update', vendorName: 'Craft House', reason: 'Manual note', occurredAt, eventChange: { kind: 'approval', eventTitle: 'Market', locationName: 'Hall A', startsOn: '2026-11-01', endsOn: '2026-11-02', actionPath: '/vendor/events', reason: 'Participation approved', changes: [{ field: 'stallNumber', before: '', after: 'A12' }, { field: 'applicationsOpen', before: 'false', after: 'true' }] } });
    expect(mail.subject).toBe('您的活动参与申请已获批准');
    expect(mail.text).toContain('摊位:');
    expect(mail.text).toContain('报名开放: 否 → 是');
    expect(mail.text).toContain('Hall A');
  });

  it('translates known producer copy and preserves manually authored evidence', () => {
    expect(emailReason('Order MW-123 has been paid and is ready for fulfilment.', 'zh-CN')).toBe('订单 MW-123 已付款，可以开始履约。');
    expect(emailReason('Your vendor account is approved and ready to manage.', 'ms')).toContain('diluluskan');
    expect(emailReason('Your product review was rejected: Keep this human note.', 'zh-CN')).toBe('您的商品审核已被拒绝。 Keep this human note.');
    expect(emailReason('A completely manual explanation.', 'zh-CN')).toBe('A completely manual explanation.');
  });

  it('uses English only when no supported preference is supplied', () => {
    const mail = renderTransactionEmail({ locale: 'invalid', eventType: 'withdrawal_failed', amountRm: 1, reference: 'MW-2', occurredAt } as never);
    expect(mail.subject).toBe('Withdrawal failed');
    expect(mail.html).toContain('lang="en"');
  });
});
