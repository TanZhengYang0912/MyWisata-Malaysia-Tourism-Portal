import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const CREDENTIAL_TTL_SECONDS = 5 * 60;

export type WalletModerationCredentialClaims = {
  version: 1;
  actorId: string;
  withdrawalId: string;
  action: 'reject';
  reasonCategory: string;
  reasonSha256: string;
  verdict: 'clear' | 'advisory';
  issuedAt: number;
  expiresAt: number;
};

export type WalletModerationCredentialInput = {
  actorId: string;
  withdrawalId: string;
  action: 'reject';
  reasonCategory: string;
  reason: string;
  verdict: 'clear' | 'advisory';
};

export type WalletModerationCredentialExpected = Omit<WalletModerationCredentialInput, 'verdict'>;
export type WalletModerationCredentialVerification =
  | { valid: true; claims: WalletModerationCredentialClaims }
  | { valid: false; reason: 'malformed' | 'signature' | 'claims' | 'expired' | 'mismatch' };

export function walletReasonSha256(reason: string) {
  return createHash('sha256').update(reason.trim(), 'utf8').digest('hex');
}

export function walletModerationSecret() {
  const secret = process.env.WALLET_MODERATION_REVIEW_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('wallet_moderation_secret_invalid');
  return secret;
}

function hmac(value: string, secret: string) {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

export function signWalletModerationCredential(
  input: WalletModerationCredentialInput,
  secret: string = walletModerationSecret(),
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (Buffer.byteLength(secret.trim(), 'utf8') < 32) throw new Error('wallet_moderation_secret_invalid');
  const claims: WalletModerationCredentialClaims = {
    version: 1,
    actorId: input.actorId,
    withdrawalId: input.withdrawalId,
    action: input.action,
    reasonCategory: input.reasonCategory,
    reasonSha256: walletReasonSha256(input.reason),
    verdict: input.verdict,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + CREDENTIAL_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signingInput = `v1.${payload}`;
  return `${signingInput}.${hmac(signingInput, secret)}`;
}

export function verifyWalletModerationCredential(
  token: string,
  expectedClaims: WalletModerationCredentialExpected,
  secret: string = walletModerationSecret(),
  nowSeconds: number = Math.floor(Date.now() / 1000),
): WalletModerationCredentialVerification {
  if (Buffer.byteLength(secret.trim(), 'utf8') < 32) throw new Error('wallet_moderation_secret_invalid');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) return { valid: false, reason: 'malformed' };

  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSignature = Buffer.from(hmac(signingInput, secret), 'utf8');
  const receivedSignature = Buffer.from(parts[2], 'utf8');
  if (expectedSignature.length !== receivedSignature.length || !timingSafeEqual(expectedSignature, receivedSignature)) {
    return { valid: false, reason: 'signature' };
  }

  let claims: WalletModerationCredentialClaims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as WalletModerationCredentialClaims;
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (
    typeof claims !== 'object' || claims === null ||
    claims.version !== 1 ||
    typeof claims.actorId !== 'string' ||
    typeof claims.withdrawalId !== 'string' ||
    claims.action !== 'reject' ||
    typeof claims.reasonCategory !== 'string' ||
    !/^[a-f0-9]{64}$/.test(claims.reasonSha256) ||
    (claims.verdict !== 'clear' && claims.verdict !== 'advisory') ||
    !Number.isInteger(claims.issuedAt) ||
    !Number.isInteger(claims.expiresAt) ||
    claims.issuedAt > nowSeconds ||
    claims.expiresAt <= claims.issuedAt ||
    claims.expiresAt > claims.issuedAt + CREDENTIAL_TTL_SECONDS
  ) {
    return { valid: false, reason: 'claims' };
  }
  if (nowSeconds >= claims.expiresAt) return { valid: false, reason: 'expired' };
  if (
    claims.actorId !== expectedClaims.actorId ||
    claims.withdrawalId !== expectedClaims.withdrawalId ||
    claims.action !== expectedClaims.action ||
    claims.reasonCategory !== expectedClaims.reasonCategory ||
    claims.reasonSha256 !== walletReasonSha256(expectedClaims.reason)
  ) {
    return { valid: false, reason: 'mismatch' };
  }
  return { valid: true, claims };
}
