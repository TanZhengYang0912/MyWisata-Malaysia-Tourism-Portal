import 'server-only';

import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

export type StripePayoutStatus =
  | 'currently_due'
  | 'pending_verification'
  | 'payouts_enabled'
  | 'past_due'
  | 'restricted';

export type StripeConnectStatus = {
  accountId: string;
  accountType: string | null;
  dashboardType: string | null;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  payoutStatus: StripePayoutStatus;
  requirementCounts: {
    currentlyDue: number;
    pastDue: number;
    pendingVerification: number;
  };
  disabledReason: string | null;
};

type StripeControllerShape = {
  stripe_dashboard?: { type?: string | null } | null;
};

export function normalizeConnectAccountStatus(account: Stripe.Account): StripeConnectStatus {
  const controller = account.controller as StripeControllerShape | null | undefined;
  const dashboardType = controller?.stripe_dashboard?.type ?? null;
  const payoutsEnabled = account.payouts_enabled === true;
  const currentlyDue = account.requirements?.currently_due?.length ?? 0;
  const pastDue = account.requirements?.past_due?.length ?? 0;
  const pendingVerification = account.requirements?.pending_verification?.length ?? 0;
  const disabledReason = account.requirements?.disabled_reason ?? null;

  let payoutStatus: StripePayoutStatus;
  if (payoutsEnabled) payoutStatus = 'payouts_enabled';
  else if (pastDue > 0 || disabledReason === 'requirements.past_due') payoutStatus = 'past_due';
  else if (currentlyDue > 0) payoutStatus = 'currently_due';
  else if (pendingVerification > 0 || disabledReason === 'requirements.pending_verification' || disabledReason === 'under_review') {
    payoutStatus = 'pending_verification';
  } else {
    payoutStatus = 'restricted';
  }

  return {
    accountId: account.id,
    accountType: account.type ?? null,
    dashboardType,
    detailsSubmitted: account.details_submitted === true,
    payoutsEnabled,
    chargesEnabled: account.charges_enabled === true,
    payoutStatus,
    requirementCounts: { currentlyDue, pastDue, pendingVerification },
    disabledReason,
  };
}

export async function retrieveConnectAccountStatus(accountId: string): Promise<StripeConnectStatus> {
  const account = await stripe.accounts.retrieve(accountId);
  return normalizeConnectAccountStatus(account);
}
