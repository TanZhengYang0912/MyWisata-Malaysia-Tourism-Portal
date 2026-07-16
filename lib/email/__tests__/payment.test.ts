import { describe, expect, it } from 'vitest';
import { getPaymentEmailType } from '@/lib/email/payment';

describe('payment email mapping', () => {
  it('maps order sessions to checkout confirmation', () => {
    expect(getPaymentEmailType('order')).toEqual({
      eventType: 'checkout_succeeded',
      keyPrefix: 'stripe-checkout',
    });
  });

  it('defaults unknown payment kinds to wallet top-up', () => {
    expect(getPaymentEmailType(undefined)).toEqual({
      eventType: 'topup_succeeded',
      keyPrefix: 'stripe-topup',
    });
  });
});
