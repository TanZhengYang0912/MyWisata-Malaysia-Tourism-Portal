import { describe, expect, it } from "vitest";

import { buildAccessControlQuery, focusTargetForAuditEvent } from "@/components/admin/access-control/types";

describe("Access Control filter helpers", () => {
  it("omits empty filters and encodes meaningful values", () => {
    expect(buildAccessControlQuery({
      page: 2,
      pageSize: 25,
      search: "  affiliate full  ",
      status: "active",
      capabilityKey: "",
    })).toBe("page=2&pageSize=25&search=affiliate+full&status=active");
  });

  it("maps linked audit entities back to their owning tab", () => {
    expect(focusTargetForAuditEvent("entitlement_capability", "cap-1")).toEqual({ tab: "capabilities", id: "cap-1" });
    expect(focusTargetForAuditEvent("entitlement_policy_version", "version-1")).toEqual({ tab: "policies", id: "version-1" });
    expect(focusTargetForAuditEvent("entitlement_assignment", "assignment-1")).toEqual({ tab: "assignments", id: "assignment-1" });
    expect(focusTargetForAuditEvent("catalogue_review", "review-1")).toBeNull();
  });
});
