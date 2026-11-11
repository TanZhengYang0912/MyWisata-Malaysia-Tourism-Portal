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
  ] as const)('routes a status question to the matching record type', (question, expected) => {
    expect(resolveCustomerSupportIntent(question)).toBe(expected);
  });

  it('leaves general policy questions on the existing FAQ and Gemini path', () => {
    expect(resolveCustomerSupportIntent('How do refunds work?')).toBeNull();
    expect(resolveCustomerSupportIntent('Can you check refund eligibility?')).toBeNull();
    expect(resolveCustomerSupportIntent('What should I pack for my trip?')).toBeNull();
  });
});
