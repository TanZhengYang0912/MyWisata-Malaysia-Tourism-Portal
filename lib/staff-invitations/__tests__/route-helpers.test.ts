import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock("@/lib/email/sender", () => ({ sendStaffInvitationEmail: mocks.sendEmail }));

import { deliverPreparedInvitation } from "@/lib/staff-invitations/route-helpers";

const prepared = {
  id: "22222222-2222-4222-8222-222222222222",
  invited_email: "staff@example.com",
  role_name: "KYC Reviewer",
  permission_keys: ["admin.kyc.review"],
  status: "pending" as const,
  delivery_status: "sending" as const,
  expires_at: "2026-10-20T04:30:00.000Z",
};

function database() {
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from: vi.fn(),
  };
}

describe("staff invitation email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://mywisata.test";
    mocks.sendEmail.mockResolvedValue({ id: "message-1" });
  });

  it("sends the English invitation without reading a recipient language", async () => {
    const db = database();

    const result = await deliverPreparedInvitation(db as unknown as SupabaseClient, prepared, "secret-token", "a".repeat(64));

    expect(result.sent).toBe(true);
    expect(db.from).not.toHaveBeenCalledWith("users");
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "staff@example.com", roleName: "KYC Reviewer" }));
    expect(mocks.sendEmail.mock.calls[0][0]).not.toHaveProperty("locale");
  });
});
