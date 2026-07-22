export type PayoutDestinationType = 'bank_account' | 'e_wallet';
export type PayoutDestinationStatus = 'pending' | 'verified' | 'disabled' | 'failed';

export type PayoutDestination = {
  id: string;
  type: PayoutDestinationType;
  provider: string;
  displayLabel: string;
  status: PayoutDestinationStatus;
  isDefault: boolean;
};

export type SplitPayment = {
  walletAmountSen: number;
  externalAmountSen: number;
  externalMethod: 'card' | 'online_banking' | 'provider_wallet';
};

export function getPayoutDestinationCapabilities() {
  return {
    bank_account: { enabled: true, provider: 'stripe_connect' },
    e_wallet: {
      enabled: Boolean(process.env.TNG_DIRECT_CREDIT_MERCHANT_ID && process.env.TNG_DIRECT_CREDIT_API_KEY),
      provider: 'tng_direct_credit',
    },
  } as const;
}

export function selectDefaultPayoutDestination(destinations: PayoutDestination[]): PayoutDestination | null {
  return destinations.find((destination) => destination.isDefault && destination.status === 'verified')
    ?? destinations.find((destination) => destination.status === 'verified')
    ?? null;
}

export function calculateWalletSplit(
  totalAmountSen: number,
  walletAvailableSen: number,
  externalMethod: SplitPayment['externalMethod'],
  externalMethods: string[] = [externalMethod],
): SplitPayment {
  if (!Number.isSafeInteger(totalAmountSen) || totalAmountSen <= 0) throw new Error('invalid_total');
  if (!Number.isSafeInteger(walletAvailableSen) || walletAvailableSen < 0) throw new Error('invalid_wallet_balance');
  if (externalMethods.length !== 1 || externalMethods[0] !== externalMethod) throw new Error('one_external_method_required');
  const walletAmountSen = Math.min(totalAmountSen, walletAvailableSen);
  return { walletAmountSen, externalAmountSen: totalAmountSen - walletAmountSen, externalMethod };
}
