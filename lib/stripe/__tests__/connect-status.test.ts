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
    });

    await expect(retrieveConnectAccountStatus('acct_enabled')).resolves.toEqual({
      accountId: 'acct_enabled',
      accountType: 'standard',
      dashboardType: 'full',
      detailsSubmitted: true,
      payoutsEnabled: true,
      chargesEnabled: true,
      requiresDashboardAction: false,
    });
  });

  it('marks an incomplete Full Dashboard account as requiring Dashboard action', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'acct_incomplete',
      type: 'standard',
      details_submitted: false,
      payouts_enabled: false,
      charges_enabled: false,
      controller: { stripe_dashboard: { type: 'full' } },
    });

    await expect(retrieveConnectAccountStatus('acct_incomplete')).resolves.toMatchObject({
      requiresDashboardAction: true,
      payoutsEnabled: false,
    });
  });
});
