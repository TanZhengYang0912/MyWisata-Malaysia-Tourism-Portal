import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
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

  it("returns a safe TNG receipt without exposing its provider event id", async () => {
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
    expect(body.data.statusGuidance).toEqual({
      title: 'Payout failed — funds restored',
      message: 'The reserved amount has been returned to your available earnings. Check your payout destination before submitting a new withdrawal, or contact Support if the details are correct.',
    });
  });
});
