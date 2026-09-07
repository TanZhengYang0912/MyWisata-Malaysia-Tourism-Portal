import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireGovernance: vi.fn(),
  createServiceClient: vi.fn(),
  serviceFrom: vi.fn(),
  rpc: vi.fn(),
  sendEmail: vi.fn(),
  createToken: vi.fn(),
}));

vi.mock("@/lib/staff-permissions/server", () => ({
  requireStaffRoleManagementSuperAdmin: mocks.requireGovernance,
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/email/sender", () => ({ sendStaffInvitationEmail: mocks.sendEmail }));
vi.mock("@/lib/staff-invitations/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/staff-invitations/server")>();
  return { ...actual, createStaffInvitationToken: mocks.createToken };
});

import * as invitationsRoute from "@/app/api/admin/access-control/staff-invitations/route";
import { POST as resend } from "@/app/api/admin/access-control/staff-invitations/[invitationId]/resend/route";
import { POST as revoke } from "@/app/api/admin/access-control/staff-invitations/[invitationId]/revoke/route";

const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const ROLE_ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "a".repeat(64);
const PREPARED = {
  id: INVITATION_ID,
  invited_email: "staff@example.com",
  role_name: "Wallet Reviewer",
  permission_keys: ["admin.withdrawal.approve"],
  status: "pending",
  delivery_status: "sending",
  expires_at: "2026-09-13T04:30:00.000Z",
};

function request(path: string, body: Record<string, unknown>) {
  return new Request(`https://mywisata.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listQuery(data: unknown[]) {
  const result = { data, error: null };
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

describe("staff invitation administration routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://mywisata.test";
    mocks.requireGovernance.mockResolvedValue({
      db: { rpc: mocks.rpc },
      user: { id: "11111111-1111-4111-8111-111111111111" },
      response: null,
    });
    mocks.createServiceClient.mockReturnValue({ from: mocks.serviceFrom });
    mocks.serviceFrom.mockReturnValue(listQuery([]));
    mocks.createToken.mockReturnValue(TOKEN);
    mocks.sendEmail.mockResolvedValue({ id: "message-1" });
    mocks.rpc
      .mockResolvedValueOnce({ data: PREPARED, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
  });

  it("guards before parsing, service access, or SMTP", async () => {
    mocks.requireGovernance.mockResolvedValue({
      db: { rpc: mocks.rpc },
      user: null,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });

    const response = await invitationsRoute.POST(request("/api/admin/access-control/staff-invitations", {}));

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("prepares, emails, finalizes, and never returns the token or URL", async () => {
    const response = await invitationsRoute.POST(request("/api/admin/access-control/staff-invitations", {
      email: " STAFF@Example.com ",
      staffRoleId: ROLE_ID,
      locale: "en",
      reason: "New employee requires wallet review access",
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.rpc.mock.calls[0][0]).toBe("prepare_staff_invitation");
    expect(mocks.rpc.mock.calls[1]).toEqual(["finalize_staff_invitation_delivery", expect.objectContaining({
      p_invitation_id: INVITATION_ID,
      p_succeeded: true,
    })]);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "staff@example.com",
      roleName: "Wallet Reviewer",
    }));
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(JSON.stringify(body)).not.toContain("staff-invitations/");
  });

  it("records failed delivery without exposing the SMTP error", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("auth=secret SMTP unavailable"));

    const response = await invitationsRoute.POST(request("/api/admin/access-control/staff-invitations", {
      email: "staff@example.com",
      staffRoleId: ROLE_ID,
      reason: "New employee requires wallet review access",
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.rpc.mock.calls[1]).toEqual(["finalize_staff_invitation_delivery", expect.objectContaining({
      p_succeeded: false,
    })]);
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("rotates resend links and supports governed revocation", async () => {
    const resent = await resend(request(`/api/admin/access-control/staff-invitations/${INVITATION_ID}/resend`, {
      locale: "zh-CN",
    }), { params: Promise.resolve({ invitationId: INVITATION_ID }) });
    expect(resent.status).toBe(200);
    expect(mocks.rpc.mock.calls[0][0]).toBe("prepare_staff_invitation_resend");

    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const revoked = await revoke(request(`/api/admin/access-control/staff-invitations/${INVITATION_ID}/revoke`, {
      reason: "Employee no longer requires the invitation",
    }), { params: Promise.resolve({ invitationId: INVITATION_ID }) });
    expect(revoked.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_staff_invitation", {
      p_invitation_id: INVITATION_ID,
      p_reason: "Employee no longer requires the invitation",
    });
  });

  it("lists only safe invitation summaries", async () => {
    mocks.serviceFrom.mockReturnValue(listQuery([{
      ...PREPARED,
      send_attempt_count: 1,
      token_hash: "must-not-leak",
      reason: "must-not-leak",
    }]));
    const response = await invitationsRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.invitations[0]).toMatchObject({ invitedEmail: "staff@example.com" });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });
});
