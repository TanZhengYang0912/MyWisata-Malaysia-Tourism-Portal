import { describe, expect, it } from "vitest";
import { sendOtpSchema, verifyOtpSchema } from "@/lib/validation/phone-schemas";

describe("phone OTP schemas", () => {
  it("canonicalizes a valid formatted international phone number", () => {
    expect(sendOtpSchema.parse({ phone: "+60 17-714 3951" })).toEqual({
      phone: "+60177143951",
    });
  });

  it("rejects an impossible international phone number", () => {
    expect(() => verifyOtpSchema.parse({ phone: "+601", code: "123456" })).toThrow(
      "Enter a valid international phone number",
    );
  });

  it("keeps the OTP digits-only requirement", () => {
    expect(() => verifyOtpSchema.parse({ phone: "+12025550142", code: "12ab56" })).toThrow(
      "Code must be digits only",
    );
  });
});
