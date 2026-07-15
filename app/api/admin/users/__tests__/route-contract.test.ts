import { describe, expect, it } from "vitest";
import { getUserManagementEmailType } from "@/lib/user-management/email";

describe("user management API contracts", () => {
  it("maps account status actions to account email events", () => {
    expect(getUserManagementEmailType("suspend")).toBe("account_suspended");
    expect(getUserManagementEmailType("unsuspend")).toBe("account_unsuspended");
    expect(getUserManagementEmailType("soft_delete")).toBe("account_deleted");
    expect(getUserManagementEmailType("restore")).toBe("account_restored");
  });

  it("keeps Bio reset in-app only", () => {
    expect(getUserManagementEmailType("clear_bio_restriction")).toBeNull();
  });
});
