export function isEmailVerified(authConfirmedAt: string | null | undefined, profileVerifiedAt: string | null | undefined): boolean {
  return Boolean(authConfirmedAt ?? profileVerifiedAt);
}
