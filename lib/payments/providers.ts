import { createHmac } from 'node:crypto';

export const SIMULATOR_CHECKOUT_PROVIDERS = [
  'tng_ewallet_simulator',
  'grabpay_simulator',
  'bank_transfer_simulator',
] as const;

export type SimulatorCheckoutProvider = typeof SIMULATOR_CHECKOUT_PROVIDERS[number];
export type CheckoutProviderName = 'stripe' | 'platform_wallet' | 'platform' | 'toyyibpay' | SimulatorCheckoutProvider;

export function isSimulatorCheckoutProvider(value: unknown): value is SimulatorCheckoutProvider {
  return typeof value === 'string'
    && (SIMULATOR_CHECKOUT_PROVIDERS as readonly string[]).includes(value);
}

export function resolveCheckoutProvider(
  paymentMethod: string,
  requestedProvider?: string,
): CheckoutProviderName {
  const method = paymentMethod.trim().toLowerCase();
  const provider = requestedProvider?.trim().toLowerCase();

  if (method === 'free_reservation') {
    if (!provider || provider === 'platform') return 'platform';
  }
  if (method === 'stripe_card' || method === 'wallet_split') {
    if (!provider || provider === 'stripe') return 'stripe';
  }
  if (method === 'wallet') {
    if (!provider || provider === 'platform_wallet') return 'platform_wallet';
  }
  if (method === 'ewallet') {
    if (provider === 'tng_ewallet_simulator' || provider === 'grabpay_simulator') return provider;
  }
  if (method === 'bank_transfer' && provider === 'bank_transfer_simulator') {
    return provider;
  }
  if (method === 'bank_transfer' && provider === 'toyyibpay') {
    return provider;
  }

  throw new Error('payment_provider_mismatch');
}

export function createSimulatorPaymentSession(input: {
  checkoutSessionId: string;
  provider: SimulatorCheckoutProvider;
  expiresAt: string;
  secret: string;
}): { providerPaymentId: string; actionUrl: string; expiresAt: string } {
  const secret = input.secret.trim();
  if (!secret) throw new Error('payment_simulator_not_configured');
  if (!isSimulatorCheckoutProvider(input.provider)) throw new Error('payment_provider_mismatch');

  const digest = createHmac('sha256', secret)
    .update(`${input.checkoutSessionId}:${input.provider}`)
    .digest('hex')
    .slice(0, 40);

  return {
    providerPaymentId: `sim_pay_${digest}`,
    actionUrl: `/customer/checkout/simulator/${input.checkoutSessionId}`,
    expiresAt: input.expiresAt,
  };
}
