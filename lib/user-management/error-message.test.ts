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

  it("adds the invalid field when the API includes validation details", () => {
    expect(getUserManagementErrorMessage(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Action and a reason of at least 10 characters are required",
          details: { fieldErrors: { userId: ["Invalid UUID"] } },
        },
      },
      "Unable to update user",
    )).toBe("Action and a reason of at least 10 characters are required (userId: Invalid UUID)");
  });
});
