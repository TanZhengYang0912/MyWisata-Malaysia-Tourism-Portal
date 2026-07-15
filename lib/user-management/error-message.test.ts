import { describe, expect, it } from "vitest";
import { getUserManagementErrorMessage } from "./error-message";

describe("getUserManagementErrorMessage", () => {
  it("returns the server reason instead of hiding it behind a generic fallback", () => {
    expect(getUserManagementErrorMessage(
      { error: { code: "CONTENT_REJECTED", message: "This reason contains disallowed content" } },
      "Unable to update user",
    )).toBe("This reason contains disallowed content");
  });

  it("uses the fallback when a response has no readable error message", () => {
    expect(getUserManagementErrorMessage({ error: { code: "UNKNOWN" } }, "Unable to update user")).toBe("Unable to update user");
    expect(getUserManagementErrorMessage(null, "Unable to update user")).toBe("Unable to update user");
  });
});
