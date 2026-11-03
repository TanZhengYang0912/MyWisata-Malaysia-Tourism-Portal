import { describe, expect, it } from "vitest";
import { DemoSignInCaptchaError, getDemoSignInErrorMessage } from "../demo-signin-error";

describe("demo sign-in error mapping", () => {
  it("shows the security verification message only for the known CAPTCHA failure code", () => {
    expect(getDemoSignInErrorMessage(new DemoSignInCaptchaError(), "Retry verification", "Unable to sign in"))
      .toBe("Retry verification");
  });

  it("keeps other provider details out of the user-facing error", () => {
    expect(getDemoSignInErrorMessage(new Error("private provider detail"), "Retry verification", "Unable to sign in"))
      .toBe("Unable to sign in");
  });
});
