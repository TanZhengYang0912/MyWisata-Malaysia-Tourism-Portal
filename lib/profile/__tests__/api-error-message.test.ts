import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "@/lib/profile/api-error-message";

describe("API error message extraction", () => {
  it("uses the server message for a rejected bio", () => {
    expect(
      apiErrorMessage(
        { error: { code: "BIO_CONTENT_REJECTED", message: "Your bio contains content that violates community guidelines" } },
        "Unable to save bio",
      ),
    ).toBe("Your bio contains content that violates community guidelines");
  });

  it("uses the server message when moderation is unavailable", () => {
    expect(
      apiErrorMessage(
        { data: null, error: { code: "MODERATION_UNAVAILABLE", message: "Bio review service is temporarily unavailable — try again shortly" } },
        "Unable to save bio",
      ),
    ).toBe("Bio review service is temporarily unavailable — try again shortly");
  });

  it("falls back when the response has no usable message", () => {
    expect(apiErrorMessage({ error: { code: "UNKNOWN" } }, "Unable to save bio")).toBe("Unable to save bio");
  });
});
