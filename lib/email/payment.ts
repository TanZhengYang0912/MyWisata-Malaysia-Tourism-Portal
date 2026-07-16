import type { TransactionEmailType } from '@/lib/email/templates';

export function getPaymentEmailType(paymentKind: string | null | undefined): {
  eventType: Extract<TransactionEmailType, 'checkout_succeeded' | 'topup_succeeded'>;
  keyPrefix: 'stripe-checkout' | 'stripe-topup';
} {
  if (paymentKind === 'order') {
    return { eventType: 'checkout_succeeded', keyPrefix: 'stripe-checkout' };
  }
  return { eventType: 'topup_succeeded', keyPrefix: 'stripe-topup' };
}
