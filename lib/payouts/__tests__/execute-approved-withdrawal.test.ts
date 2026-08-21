import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  createTngPayout: vi.fn(),
  tngConfigured: vi.fn(),
  accountsRetrieve: vi.fn(),
  transfersCreate: vi.fn(),
  transfersRetrieve: vi.fn(),
  payoutsCreate: vi.fn(),
  payoutsRetrieve: vi.fn(),
  enqueueEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@/lib/payouts/providers/tng-direct-credit', () => ({
  createTngDirectCreditProvider: () => ({
    isConfigured: mocks.tngConfigured,
    createPayout: mocks.createTngPayout,
  }),
}));
vi.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: { retrieve: mocks.accountsRetrieve },
    transfers: { create: mocks.transfersCreate, retrieve: mocks.transfersRetrieve },
    payouts: { create: mocks.payoutsCreate, retrieve: mocks.payoutsRetrieve },
  },
}));
vi.mock('@/lib/email/events', () => ({ enqueueWithdrawalEmail: mocks.enqueueEmail }));
vi.mock('@/lib/payouts/fees', () => ({ payoutFeeSen: () => 25 }));

import { executeApprovedWithdrawalPayout } from '../execute-approved-withdrawal';

const withdrawalId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function queryResult(data: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error: null }) }),
    }),
  };
}

describe('executeApprovedWithdrawalPayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'start_withdrawal_payout_attempt'
      ? { data: { acquired: true, started_at: new Date().toISOString() }, error: null }
      : name === 'start_tng_mock_payout'
      ? { data: { outbox_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', available_at: '2026-08-21T05:00:03.000Z' }, error: null }
      : { data: {}, error: null }));
    mocks.enqueueEmail.mockResolvedValue(undefined);
    mocks.tngConfigured.mockReturnValue(true);
  });

  it('starts a TNG mock payout and persists the provider event id', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: null })
      : queryResult({
          status: 'approved',
          payout_provider: 'tng_direct_credit',
          destination_provider_reference: 'tng_dest_0123456789abcdef',
          stripe_transfer_id: null,
          stripe_payout_id: null,
          updated_at: new Date().toISOString(),
        }));
    mocks.createTngPayout.mockResolvedValue({
      status: 'processing',
      providerEventId: 'tng_payout_0123456789abcdef',
      failure: null,
    });

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 50 });

    expect(result).toMatchObject({
      ok: true,
      data: {
        provider: 'tng_direct_credit',
        status: 'processing',
        callbackJobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        callbackAvailableAt: '2026-08-21T05:00:03.000Z',
      },
    });
    expect(mocks.createTngPayout).toHaveBeenCalledWith({
      withdrawalId,
      amountSen: 5_000,
      providerReference: 'tng_dest_0123456789abcdef',
      idempotencyKey: `wr-${withdrawalId}-tng`,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('start_tng_mock_payout', {
      p_withdrawal_id: withdrawalId,
      p_provider_payout_id: 'tng_payout_0123456789abcdef',
      p_available_at: expect.any(String),
      p_outcome: 'paid',
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_tng_payout', expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalledWith('mark_provider_withdrawal_processing', expect.anything());
  });

  it('preserves the Stripe transfer and payout path', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: 'acct_test' })
      : queryResult({
          status: 'approved',
          payout_provider: 'stripe_connect',
          destination_provider_reference: 'acct_test',
          stripe_transfer_id: null,
          stripe_payout_id: null,
          updated_at: new Date().toISOString(),
        }));
    mocks.accountsRetrieve.mockResolvedValue({ payouts_enabled: true });
    mocks.transfersCreate.mockResolvedValue({ id: 'tr_test' });
    mocks.payoutsCreate.mockResolvedValue({ id: 'po_test' });

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 70 });

    expect(result).toMatchObject({
      ok: true,
      data: { provider: 'stripe_connect', status: 'processing', transfer_id: 'tr_test', payout_id: 'po_test' },
    });
    expect(mocks.rpc).toHaveBeenCalledWith('record_stripe_transfer', expect.any(Object));
    expect(mocks.rpc).toHaveBeenCalledWith('record_stripe_payout', {
      p_withdrawal_id: withdrawalId,
      p_payout_id: 'po_test',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('record_withdrawal_payout_fee', { p_withdrawal_id: withdrawalId, p_fee_sen: 25 });
    expect(mocks.rpc).toHaveBeenCalledWith('mark_withdrawal_processing', {
      p_withdrawal_id: withdrawalId,
      p_transfer_id: 'tr_test',
      p_payout_id: 'po_test',
    });
    const rpcNames = mocks.rpc.mock.calls.map(([name]) => name);
    expect(rpcNames.indexOf('record_stripe_payout')).toBeLessThan(rpcNames.indexOf('record_withdrawal_payout_fee'));
  });

  it('blocks retry when Stripe created a payout but its id could not be recorded', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: 'acct_test' })
      : queryResult({
          status: 'approved', payout_provider: 'stripe_connect', destination_provider_reference: 'acct_test',
          stripe_transfer_id: 'tr_test', stripe_payout_id: null, updated_at: new Date().toISOString(),
        }));
    mocks.accountsRetrieve.mockResolvedValue({ payouts_enabled: true });
    mocks.transfersRetrieve.mockResolvedValue({ id: 'tr_test' });
    mocks.payoutsCreate.mockResolvedValue({ id: 'po_created' });
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'record_stripe_payout'
      ? { data: null, error: { message: 'database unavailable' } }
      : { data: {}, error: null }));

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 70 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = await result.response.json();
    expect(body.error).toMatchObject({ code: 'PAYOUT_STATE_FAILED', details: { retryable: false } });
    expect(mocks.rpc).toHaveBeenCalledWith('record_withdrawal_execution_failure', expect.objectContaining({
      p_withdrawal_id: withdrawalId,
      p_retryable: false,
    }));
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_withdrawal_payout_fee', expect.anything());
  });

  it('allows database finalization retry after the Stripe payout id was safely recorded', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: 'acct_test' })
      : queryResult({
          status: 'approved', payout_provider: 'stripe_connect', destination_provider_reference: 'acct_test',
          stripe_transfer_id: 'tr_test', stripe_payout_id: 'po_test', updated_at: new Date(Date.now() - 48 * 3_600_000).toISOString(),
        }));
    mocks.transfersRetrieve.mockResolvedValue({ id: 'tr_test' });
    mocks.payoutsRetrieve.mockResolvedValue({ id: 'po_test' });

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 70 });

    expect(result).toMatchObject({ ok: true, data: { payout_id: 'po_test', status: 'processing' } });
    expect(mocks.payoutsCreate).not.toHaveBeenCalled();
  });

  it('uses the immutable payout-attempt timestamp to block retries after 24 hours', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: 'acct_test' })
      : queryResult({
          status: 'approved', payout_provider: 'stripe_connect', destination_provider_reference: 'acct_test',
          stripe_transfer_id: 'tr_test', stripe_payout_id: null, updated_at: new Date().toISOString(),
        }));
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'start_withdrawal_payout_attempt'
      ? { data: { started_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }, error: null }
      : { data: {}, error: null }));

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 70 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = await result.response.json();
    expect(body.error).toMatchObject({ code: 'IDEMPOTENCY_WINDOW_EXPIRED', details: { retryable: false } });
    expect(mocks.payoutsCreate).not.toHaveBeenCalled();
  });

  it('does not call a provider when another execution owns the database claim', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: 'acct_test' })
      : queryResult({
          status: 'approved', payout_provider: 'stripe_connect', destination_provider_reference: 'acct_test',
          stripe_transfer_id: null, stripe_payout_id: null, updated_at: new Date().toISOString(),
        }));
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'start_withdrawal_payout_attempt'
      ? { data: { acquired: false, started_at: new Date().toISOString() }, error: null }
      : { data: {}, error: null }));

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 70 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(409);
    expect(mocks.transfersCreate).not.toHaveBeenCalled();
    expect(mocks.payoutsCreate).not.toHaveBeenCalled();
  });

  it('fails closed when an unsafe provider result cannot be persisted', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: 'acct_test' })
      : queryResult({
          status: 'approved', payout_provider: 'stripe_connect', destination_provider_reference: 'acct_test',
          stripe_transfer_id: 'tr_test', stripe_payout_id: null, updated_at: new Date().toISOString(),
        }));
    mocks.transfersRetrieve.mockResolvedValue({ id: 'tr_test' });
    mocks.payoutsCreate.mockRejectedValue(new Error('connection reset after request'));
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'start_withdrawal_payout_attempt') return Promise.resolve({ data: { acquired: true, started_at: new Date().toISOString() }, error: null });
      if (name === 'record_withdrawal_execution_failure') return Promise.resolve({ data: null, error: { message: 'database unavailable' } });
      return Promise.resolve({ data: {}, error: null });
    });

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 70 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = await result.response.json();
    expect(body.error).toMatchObject({ code: 'RECONCILIATION_LOCKED', details: { retryable: false } });
    expect(mocks.rpc).not.toHaveBeenCalledWith('clear_withdrawal_payout_claim', expect.anything());
  });

  it('marks a TNG state persistence failure as unsafe to retry', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: null })
      : queryResult({
          status: 'approved', payout_provider: 'tng_direct_credit', destination_provider_reference: 'tng_dest_opaque',
          stripe_transfer_id: null, stripe_payout_id: null, updated_at: new Date().toISOString(),
        }));
    mocks.createTngPayout.mockResolvedValue({ status: 'processing', providerEventId: 'tng_payout_opaque', failure: null });
    mocks.rpc.mockImplementation((name: string) => Promise.resolve(name === 'start_tng_mock_payout'
      ? { data: null, error: { message: 'database unavailable' } }
      : { data: {}, error: null }));

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 50 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = await result.response.json();
    expect(body.error).toMatchObject({ code: 'PROCESSING_STATE_FAILED', details: { retryable: false } });
  });

  it('resumes TNG database finalization from a safely recorded provider payout id', async () => {
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? queryResult({ stripe_connect_account_id: null })
      : queryResult({
          status: 'approved', payout_provider: 'tng_direct_credit', destination_provider_reference: 'tng_dest_opaque',
          payout_provider_event_id: 'tng_payout_recorded', stripe_transfer_id: null, stripe_payout_id: null,
          updated_at: new Date().toISOString(),
        }));

    const result = await executeApprovedWithdrawalPayout({ withdrawalId, userId, amountRm: 50 });

    expect(result).toMatchObject({
      ok: true,
      data: {
        provider: 'tng_direct_credit',
        status: 'processing',
        callbackJobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    });
    expect(mocks.createTngPayout).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('start_tng_mock_payout', {
      p_withdrawal_id: withdrawalId,
      p_provider_payout_id: 'tng_payout_recorded',
      p_available_at: expect.any(String),
      p_outcome: 'paid',
    });
  });
});
