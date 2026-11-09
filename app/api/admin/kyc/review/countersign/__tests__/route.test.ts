import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireKycReviewer: vi.fn(),
  createServiceClient: vi.fn(),
  issueTicket: vi.fn(),
}));

vi.mock("@/lib/kyc/reviewer-auth", () => ({ requireKycReviewer: mocks.requireKycReviewer }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/kyc/service-operation-ticket", () => ({ issueKycServiceOperationTicket: mocks.issueTicket }));

import { POST } from "../route";

describe("POST /api/admin/kyc/review/countersign", () => {
  const db = { rpc: vi.fn() };
  const service = { rpc: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireKycReviewer.mockResolvedValue({ db, user: { id: "reviewer-1" }, response: null });
    mocks.createServiceClient.mockReturnValue(service);
    mocks.issueTicket.mockResolvedValue({ ticketId: "ticket-1", reviewVersion: 7, evidenceRevision: "evidence-v7" });
    service.rpc.mockResolvedValue({ data: "evidence-v7", error: null });
    db.rpc.mockResolvedValue({ data: null, error: null });
    vi.stubEnv("KYC_REVIEW_CONFIRMATION_TTL_SECONDS", "300");
  });

  it("authorizes the revision read with a one-time authenticated ticket", async () => {
    const response = await POST(new Request("http://localhost/api/admin/kyc/review/countersign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 7,
        secondaryReviewerId: "22222222-2222-4222-8222-222222222222",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.issueTicket).toHaveBeenCalledWith(db, {
      submissionId: "11111111-1111-4111-8111-111111111111",
      action: "evidence.revision",
      expectedVersion: 7,
    });
    expect(service.rpc).toHaveBeenCalledWith("get_kyc_evidence_revision_v2", {
      p_ticket_id: "ticket-1",
      p_submission_id: "11111111-1111-4111-8111-111111111111",
      p_review_version: 7,
    });
    expect(service.rpc).not.toHaveBeenCalledWith("get_kyc_evidence_revision", expect.anything());
    expect(db.rpc).toHaveBeenCalledWith("authorize_kyc_countersign", expect.objectContaining({
      p_submission_id: "11111111-1111-4111-8111-111111111111",
      p_expected_version: 7,
      p_evidence_revision: "evidence-v7",
    }));
  });
});
