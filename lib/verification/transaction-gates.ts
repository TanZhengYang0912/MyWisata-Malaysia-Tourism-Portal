export type PhoneVerificationGate =
  | { allowed: true }
  | { allowed: false; code: 'PHONE_VERIFICATION_REQUIRED'; message: string };

export function checkPhoneVerification(phoneVerifiedAt: string | null | undefined): PhoneVerificationGate {
  if (!phoneVerifiedAt) {
    return {
      allowed: false,
      code: 'PHONE_VERIFICATION_REQUIRED',
      message: 'Phone verification is required before booking or purchase.',
    };
  }
  return { allowed: true };
}
