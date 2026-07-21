type AuthIdentity = {
  provider?: string | null;
  identity_data?: { email_verified?: unknown } | null;
};

export function isEmailVerified(
  authConfirmedAt: string | null | undefined,
  profileVerifiedAt: string | null | undefined,
  identities: readonly AuthIdentity[] | null | undefined = [],
): boolean {
  const verifiedGoogleIdentity = (identities ?? []).some((identity) =>
    identity.provider === 'google' && identity.identity_data?.email_verified === true,
  );
  return Boolean(authConfirmedAt ?? profileVerifiedAt) || verifiedGoogleIdentity;
}
