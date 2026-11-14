import { describe, expect, it } from 'vitest';
import { resolveCustomerSupportIntent } from '../customer-intent';

describe('resolveCustomerSupportIntent', () => {
  it.each([
    ['Is my booking confirmed?', 'bookings'],
    ['我的预订确认了吗？', 'bookings'],
    ['Semak status tempahan saya', 'bookings'],
    ['Where is my refund?', 'refunds'],
    ['退款处理到哪一步了？', 'refunds'],
    ['Ada balasan pada tiket sokongan saya?', 'tickets'],
    ['订单状态怎么样？', 'orders'],
    ['我有什么订单吗', 'orders'],
    ['我有哪些订单？', 'orders'],
    ['Has my withdrawal been paid?', 'withdrawals'],
    ['我的提现审核到哪里了？', 'withdrawals'],
    ['What is my KYC status?', 'kyc'],
    ['我的身份验证状态怎么样？', 'kyc'],
  ] as const)('routes a status question to the matching record type', (question, expected) => {
    expect(resolveCustomerSupportIntent(question)).toBe(expected);
  });

  it('leaves general policy questions on the existing FAQ and Gemini path', () => {
    expect(resolveCustomerSupportIntent('How do refunds work?')).toBeNull();
    expect(resolveCustomerSupportIntent('Can you check refund eligibility?')).toBeNull();
    expect(resolveCustomerSupportIntent('How do I check my refund status?')).toBeNull();
    expect(resolveCustomerSupportIntent('How do I withdraw my earnings?')).toBeNull();
    expect(resolveCustomerSupportIntent('What should I pack for my trip?')).toBeNull();
  });

  it('does not look up another person using the signed-in customer account', () => {
    expect(resolveCustomerSupportIntent("Can you check my mother's KYC status?")).toBeNull();
    expect(resolveCustomerSupportIntent('帮我查朋友的退款状态')).toBeNull();
  });

  it('routes an explicit personal record lookup, but leaves navigation instructions to the knowledge path', () => {
    expect(resolveCustomerSupportIntent('Can you check my refund?')).toBe('refunds');
    expect(resolveCustomerSupportIntent('How do I check my refund status?')).toBeNull();
  });
});
