import { isTngMockPayoutEnabled, type TngPayoutEnvironment } from './tng-config';

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

export function getPayoutDestinationCapabilities(environment: TngPayoutEnvironment = process.env) {
  return {
    bank_account: { enabled: true, provider: 'stripe_connect' },
    e_wallet: {
      enabled: isTngMockPayoutEnabled(environment),
      provider: 'tng_direct_credit',
    },
  } as const;
}

const TNG_IDENTIFIER_ERROR = 'Enter a Malaysian mobile number or a valid DuitNow ID (6–32 letters/numbers with at least 4 digits).';

export function normalizeTngDestinationIdentifier(input: string):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  const trimmed = input.trim();
  const compact = trimmed.replace(/[\s()-]/g, '');
  const localMobile = /^01\d{8,9}$/.test(compact);
  const internationalMobile = /^\+601\d{8,9}$/.test(compact);

  if (localMobile || internationalMobile) {
    return { ok: true, value: localMobile ? `+60${compact.slice(1)}` : compact };
  }

  const duitNow = compact.toUpperCase();
  if (/^[A-Z0-9-]{6,32}$/.test(duitNow) && /(?:.*\d){4}/.test(duitNow)) {
    return { ok: true, value: duitNow };
  }

  return { ok: false, message: TNG_IDENTIFIER_ERROR };
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
