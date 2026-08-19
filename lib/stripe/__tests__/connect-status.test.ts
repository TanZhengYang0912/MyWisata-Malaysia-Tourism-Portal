import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/stripe', () => ({
  stripe: { accounts: { retrieve: mocks.retrieve } },
}));

import { retrieveConnectAccountStatus } from '../connect-status';

describe('retrieveConnectAccountStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes an enabled Standard Full Dashboard account', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'acct_enabled',
      type: 'standard',
      details_submitted: true,
      payouts_enabled: true,
      charges_enabled: true,
      controller: { stripe_dashboard: { type: 'full' } },
      requirements: {
        currently_due: [],
        past_due: [],
        pending_verification: [],
        disabled_reason: null,
      },
    });

    await expect(retrieveConnectAccountStatus('acct_enabled')).resolves.toEqual({
      accountId: 'acct_enabled',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      payoutStatus: 'payouts_enabled',
      requirementCounts: {
        currentlyDue: 0,
        pastDue: 0,
        pendingVerification: 0,
      },
      disabledReason: null,
    });
  });

  it('marks outstanding requirements as currently due', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'acct_incomplete',
      type: 'standard',
      details_submitted: false,
      payouts_enabled: false,
      charges_enabled: false,
      controller: { stripe_dashboard: { type: 'full' } },
      requirements: {
        currently_due: ['external_account'],
        past_due: [],
        pending_verification: [],
        disabled_reason: null,
      },
    });

    await expect(retrieveConnectAccountStatus('acct_incomplete')).resolves.toMatchObject({
      payoutStatus: 'currently_due',
      payoutsEnabled: false,
      requirementCounts: { currentlyDue: 1, pastDue: 0, pendingVerification: 0 },
    });
  });

  it('reports pending verification without asking the customer for action', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'acct_pending',
      type: 'standard',
      details_submitted: true,
      payouts_enabled: false,
      charges_enabled: false,
      controller: { stripe_dashboard: { type: 'full' } },
      requirements: {
        currently_due: [],
        past_due: [],
        pending_verification: ['individual.verification.document'],
        disabled_reason: 'requirements.pending_verification',
      },
    });

    await expect(retrieveConnectAccountStatus('acct_pending')).resolves.toMatchObject({
      payoutStatus: 'pending_verification',
      requirementCounts: { currentlyDue: 0, pastDue: 0, pendingVerification: 1 },
    });
  });

  it('prioritizes past-due restrictions over currently-due fields', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'acct_past_due',
      type: 'standard',
      details_submitted: true,
      payouts_enabled: false,
      charges_enabled: false,
      controller: { stripe_dashboard: { type: 'full' } },
      requirements: {
        currently_due: ['external_account'],
        past_due: ['external_account'],
        pending_verification: [],
        disabled_reason: 'requirements.past_due',
      },
    });

    await expect(retrieveConnectAccountStatus('acct_past_due')).resolves.toMatchObject({
      payoutStatus: 'past_due',
      disabledReason: 'requirements.past_due',
    });
  });

  it('reports other disabled reasons as restricted', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'acct_restricted',
      type: 'standard',
      details_submitted: true,
      payouts_enabled: false,
      charges_enabled: false,
      controller: { stripe_dashboard: { type: 'full' } },
      requirements: {
        currently_due: [],
        past_due: [],
        pending_verification: [],
        disabled_reason: 'rejected.other',
      },
    });

    await expect(retrieveConnectAccountStatus('acct_restricted')).resolves.toMatchObject({
      payoutStatus: 'restricted',
      disabledReason: 'rejected.other',
    });
  });
});
