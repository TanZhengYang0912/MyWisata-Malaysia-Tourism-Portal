import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  query: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: mocks.query }) }) }) }) }),
}));

const { GET } = await import("../route");

const actor = { id: "11111111-1111-4111-8111-111111111111" };
const withdrawalId = "22222222-2222-4222-8222-222222222222";

describe("GET /api/wallet/withdrawals/[id]/receipt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: actor } });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("requires an authenticated customer", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not expose another user's withdrawal", async () => {
    mocks.query.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: withdrawalId }) });
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a safe receipt with a masked Stripe reference", async () => {
    mocks.query.mockResolvedValue({
      data: {
        id: withdrawalId,
        user_id: actor.id,
        amount: 70,
        status: "paid",
        created_at: "2026-07-18T02:00:00.000Z",
        updated_at: "2026-07-18T02:05:00.000Z",
        destination_label: "Stripe Connect",
        payout_provider: "stripe_connect",
        stripe_payout_id: "po_1234567890abcdef",
        payout_provider_event_id: null,
        customer_reason: null,
        payout_failure_category: null,
        payout_failure_retryable: null,
      },
      error: null,
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: withdrawalId }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: withdrawalId,
      reference: "WD-22222222",
      amountRm: 70,
      status: "paid",
      destinationLabel: "Stripe Connect",
      payoutReference: "••••••••cdef",
      payoutProvider: "stripe_connect",
    });
    expect(JSON.stringify(body.data)).not.toContain("po_1234567890abcdef");
  });

  it("returns safe TNG proof without exposing the provider payout id or Admin diagnostics", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        state: 'paid',
        provider: 'tng_direct_credit',
        providerPayoutReference: '••••••••cdef',
        event: {
          id: 'tng_evt_safe_001', status: 'paid', amountSen: 7000, currency: 'MYR',
          providerOccurredAt: '2026-07-18T02:04:58.000Z', receivedAt: '2026-07-18T02:05:00.000Z',
          signatureVerified: true, verificationMethod: 'hmac_sha256', ingestionSource: 'tng_mock_webhook', payloadSha256: 'a'.repeat(64),
        },
        moneyMovement: { amountSen: 7000, from: 'reserved_earnings', to: 'withdrawn_earnings' },
        ledger: [],
        delivery: { status: 'delivered', attempts: 1, deliveredAt: '2026-07-18T02:05:00.000Z', lastErrorCode: null, needsReconciliation: false },
        notification: { eventType: 'withdrawal_paid', emailStatus: 'pending', queuedAt: '2026-07-18T02:05:01.000Z', sentAt: null },
      },
      error: null,
    });
    mocks.query.mockResolvedValue({
      data: {
        id: withdrawalId,
        user_id: actor.id,
        amount: 70,
        status: "paid",
        created_at: "2026-07-18T02:00:00.000Z",
        updated_at: "2026-07-18T02:05:00.000Z",
        destination_label: "Touch 'n Go eWallet •••• 2908",
        payout_provider: "tng_direct_credit",
        stripe_payout_id: null,
        payout_provider_event_id: "tng_payout_0123456789abcdef",
        customer_reason: null,
        payout_failure_category: null,
        payout_failure_retryable: null,
      },
      error: null,
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: withdrawalId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      payoutProvider: "tng_direct_credit",
      payoutReference: "••••••••cdef",
      destinationLabel: "Touch 'n Go eWallet •••• 2908",
    });
    expect(JSON.stringify(body.data)).not.toContain("tng_payout_0123456789abcdef");
    expect(body.data.settlementProof).toMatchObject({
      event: {
        id: 'tng_evt_safe_001', amountSen: 7000, signatureVerified: true,
        verificationMethod: 'hmac_sha256', ingestionSource: 'tng_mock_webhook',
      },
      moneyMovement: { from: 'reserved_earnings', to: 'withdrawn_earnings' },
    });
    expect(body.data.settlementProof).not.toHaveProperty('delivery');
    expect(body.data.settlementProof).not.toHaveProperty('notification');
    expect(mocks.rpc).toHaveBeenCalledWith('get_withdrawal_settlement_proof', { p_withdrawal_id: withdrawalId });
  });

  it('explains restored funds and the next step for a failed payout', async () => {
    mocks.query.mockResolvedValue({
      data: {
        id: withdrawalId, user_id: actor.id, amount: 70, status: 'failed',
        created_at: '2026-07-18T02:00:00.000Z', updated_at: '2026-07-18T02:05:00.000Z',
        destination_label: "Touch 'n Go eWallet •••• 2908", payout_provider: 'tng_direct_credit',
        stripe_payout_id: null, payout_provider_event_id: 'tng_payout_0123456789abcdef', customer_reason: null,
        payout_failure_category: 'provider_rejected', payout_failure_retryable: false,
      },
      error: null,
    });

    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: withdrawalId }) });
    const body = await response.json();
    expect(body.data.statusGuidanceCode).toBe('failed');
  });
});
