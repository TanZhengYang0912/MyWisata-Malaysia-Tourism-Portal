import 'server-only';

import { stripe } from '@/lib/stripe';

export type StripeConnectStatus = {
  accountId: string;
  accountType: string | null;
  dashboardType: string | null;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requiresDashboardAction: boolean;
};

type StripeControllerShape = {
  stripe_dashboard?: { type?: string | null } | null;
};

export async function retrieveConnectAccountStatus(accountId: string): Promise<StripeConnectStatus> {
  const account = await stripe.accounts.retrieve(accountId);
  const controller = account.controller as StripeControllerShape | null | undefined;
  const dashboardType = controller?.stripe_dashboard?.type ?? null;
  const payoutsEnabled = account.payouts_enabled === true;

  return {
    accountId: account.id,
    accountType: account.type ?? null,
    dashboardType,
    detailsSubmitted: account.details_submitted === true,
    payoutsEnabled,
    chargesEnabled: account.charges_enabled === true,
    requiresDashboardAction: dashboardType === 'full' && !payoutsEnabled,
  };
}
