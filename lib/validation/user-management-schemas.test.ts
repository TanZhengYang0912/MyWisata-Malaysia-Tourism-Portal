import { describe, expect, it } from "vitest";
import { userManagementActionSchema } from "./user-management-schemas";

describe("userManagementActionSchema", () => {
  it("accepts the PostgreSQL UUID format used by seeded demo users", () => {
    const result = userManagementActionSchema.safeParse({
      userId: "aaaaaaaa-0000-0000-0000-000000000005",
      action: "suspend",
      reason: "A sufficiently long reason",
    });

    expect(result.success).toBe(true);
  });
});
