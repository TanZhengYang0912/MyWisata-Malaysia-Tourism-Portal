import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  listAssignments: vi.fn(),
}));

vi.mock("@/lib/entitlements/admin-guard", () => ({ requireAccessControlSuperAdmin: mocks.guard }));
vi.mock("@/lib/entitlements/admin", () => ({ listAccessControlAssignments: mocks.listAssignments }));

import { GET } from "@/app/api/admin/access-control/assignments/route";

describe("Assignment subject display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue({ response: null });
    mocks.listAssignments.mockResolvedValue({
      items: [{
        id: "assignment-1",
        subject_type: "user",
        subject_id: "11111111-1111-4111-8111-111111111111",
        subject_full_name: "Alex Tan",
        subject_display_name: null,
        subject_email: "alex@example.com",
        capability_key: "recommendation.submit",
        effect: "allow",
        starts_at: "2026-10-01T00:00:00Z",
      }],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns the readable identity included by the paginated assignment query", async () => {
    const response = await GET(new Request("http://localhost/api/admin/access-control/assignments?page=1&pageSize=25"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.listAssignments).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 25 }));
    expect(body.data.items[0]).toMatchObject({ subjectName: "Alex Tan", subjectEmail: "alex@example.com" });
  });

  it("does not query assignments when authorization fails", async () => {
    mocks.guard.mockResolvedValue({ response: new Response(null, { status: 403 }) });

    expect((await GET(new Request("http://localhost/api/admin/access-control/assignments"))).status).toBe(403);
    expect(mocks.listAssignments).not.toHaveBeenCalled();
  });
});
