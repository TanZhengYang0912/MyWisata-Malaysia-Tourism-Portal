export type CustomerWalletBlockerCode =
  | 'phone_verification_required'
  | 'kyc_required'
  | 'minimum_balance_required'
  | 'payout_destination_required'
  | 'payout_destination_cooldown'
  | 'payout_provider_required';

export type CustomerWalletNextAction =
  | 'verify_phone'
  | 'complete_kyc'
  | 'earn_minimum'
  | 'add_payout_destination'
  | 'wait_destination_cooldown'
  | 'complete_payout_setup'
  | 'withdraw';

export type CustomerDestinationSummary = {
  id: string;
  type: 'bank_account' | 'e_wallet';
  provider: string;
  displayLabel: string;
  status: 'pending' | 'verified' | 'disabled' | 'failed';
};

type DestinationInput = CustomerDestinationSummary & {
  cooldownUntil: string | null;
  updatedAt: string | null;
};

export type CustomerWalletCapabilities = {
  canWithdraw: boolean;
  blockerCode: CustomerWalletBlockerCode | null;
  nextAction: CustomerWalletNextAction;
  destinationSummary: CustomerDestinationSummary | null;
  lastProviderCheckAt: string | null;
};

export function deriveCustomerWalletCapabilities(input: {
  phoneVerified: boolean;
  kycStatus: string | null;
  availableEarningsSen: number;
  minimumWithdrawalSen: number;
  stripePayoutsEnabled: boolean;
  destination: DestinationInput | null;
}): CustomerWalletCapabilities {
  const destinationSummary = input.destination ? {
    id: input.destination.id,
    type: input.destination.type,
    provider: input.destination.provider,
    displayLabel: input.destination.displayLabel,
    status: input.destination.status,
  } : null;
  const lastProviderCheckAt = input.destination?.updatedAt ?? null;
  const blocked = (blockerCode: CustomerWalletBlockerCode, nextAction: CustomerWalletNextAction): CustomerWalletCapabilities => ({
    canWithdraw: false,
    blockerCode,
    nextAction,
    destinationSummary,
    lastProviderCheckAt,
  });

  if (!input.phoneVerified) return blocked('phone_verification_required', 'verify_phone');
  if (input.kycStatus !== 'approved') return blocked('kyc_required', 'complete_kyc');
  if (input.availableEarningsSen < input.minimumWithdrawalSen) return blocked('minimum_balance_required', 'earn_minimum');
  if (!input.destination || input.destination.status !== 'verified') {
    return blocked('payout_destination_required', 'add_payout_destination');
  }
  if (input.destination.cooldownUntil && new Date(input.destination.cooldownUntil).getTime() > Date.now()) {
    return blocked('payout_destination_cooldown', 'wait_destination_cooldown');
  }
  if (input.destination.type === 'bank_account' && !input.stripePayoutsEnabled) {
    return blocked('payout_provider_required', 'complete_payout_setup');
  }
  return {
    canWithdraw: true,
    blockerCode: null,
    nextAction: 'withdraw',
    destinationSummary,
    lastProviderCheckAt,
  };
}
