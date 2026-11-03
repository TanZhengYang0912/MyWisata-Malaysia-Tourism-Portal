export const DEMO_SIGN_IN_CAPTCHA_FAILED_CODE = "captcha_failed";
export const DEMO_SIGN_IN_FAILED_CODE = "sign_in_failed";

export class DemoSignInCaptchaError extends Error {
  constructor() {
    super(DEMO_SIGN_IN_CAPTCHA_FAILED_CODE);
    this.name = "DemoSignInCaptchaError";
  }
}

export function getDemoSignInErrorMessage(
  error: unknown,
  captchaErrorMessage: string,
  genericErrorMessage: string,
): string {
  return error instanceof DemoSignInCaptchaError ? captchaErrorMessage : genericErrorMessage;
}
