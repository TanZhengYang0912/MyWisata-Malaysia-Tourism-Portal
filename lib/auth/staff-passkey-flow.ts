import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AuthenticationResponseJSON, RegistrationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';
import { passwordSessionClaims, staffAssurance } from './staff-assurance';
import { staffPasskeyConfig } from './staff-passkey-config';
import { authenticationOptions, registrationOptions, verifyStaffAuthentication, verifyStaffRegistration } from './staff-passkey';

const challengeSchema = z.object({
  operation: z.enum(['register', 'login', 'manage', 'approve', 'retry-payout', 'fraud-override']),
  label: z.string().trim().min(1).max(80).optional(),
  grant: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/).optional(),
  withdrawalId: z.string().uuid().optional(),
  expectedVersion: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).strict();
const verifySchema = z.object({ challengeId: z.string().uuid(), credential: z.record(z.string(), z.unknown()) }).strict();
const revokeSchema = z.object({ credentialId: z.string().min(1).max(2048) }).strict();
const financialPayloadSchema = z.object({ note: z.string().trim().min(10).max(500), reasonCategory: z.string().trim().min(1).max(100) }).strict();
const riskPayloadSchema = z.object({ reason: z.string().trim().min(10).max(500), reasonCategory: z.string().trim().min(1).max(100) }).strict();
type CredentialRecord = { id: string; label: string; publicKey: string; counter: number; transports: WebAuthnCredential['transports']; userHandle: string };

class PasskeyError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

function noStore(response: Response) {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export function passkeyFailure(error: unknown): Response {
  return noStore(error instanceof PasskeyError
    ? apiFail(error.code, 'Staff Passkey verification could not be completed', error.status)
    : apiFail('STAFF_PASSKEY_UNAVAILABLE', 'Staff Passkey verification is unavailable', 503));
}

function requireOrigin(request: Request) {
  const config = staffPasskeyConfig();
  if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new PasskeyError('STAFF_PASSKEY_ORIGIN_DENIED', 403);
  return config;
}

async function identity(requirePassword: boolean) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new PasskeyError('UNAUTHORIZED', 401);
  const { data, error: claimsError } = await db.auth.getClaims();
  if (claimsError || !data?.claims || data.claims.sub !== user.id) throw new PasskeyError('STAFF_PASSKEY_UNAVAILABLE', 503);
  const status = await staffAssurance(db);
  if (!status.required) throw new PasskeyError('FORBIDDEN', 403);
  const session = passwordSessionClaims(data.claims);
  if (requirePassword && (!session || !status.passwordAuthenticated)) throw new PasskeyError('STAFF_PASSWORD_REQUIRED', 403);
  return { db, user, status, session };
}

async function serviceRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createServiceClient().rpc(name, args);
  if (error) {
    const message = error.message ?? '';
    if (/passkey_rate_limited/.test(message)) throw new PasskeyError('STAFF_PASSKEY_RATE_LIMITED', 429);
    if (/enrollment_grant_required|enrollment_required/.test(message)) throw new PasskeyError('STAFF_PASSKEY_ENROLLMENT_REQUIRED', 403);
    if (/password_session_required|staff_passkey_required|fresh_passkey_required/.test(message)) throw new PasskeyError('STAFF_PASSKEY_REQUIRED', 403);
    if (/challenge_unavailable|credential_unavailable|withdrawal_changed|withdrawal_not_authorizable|last_credential|too_many_credentials/.test(message)) throw new PasskeyError('STAFF_PASSKEY_RETRY_REQUIRED', 409);
    if (/withdrawal_permission_required|super_admin_required/.test(message)) throw new PasskeyError('FORBIDDEN', 403);
    throw new PasskeyError('STAFF_PASSKEY_UNAVAILABLE', 503);
  }
  return data;
}

async function records(userId: string): Promise<CredentialRecord[]> {
  const data = await serviceRpc('staff_passkey_credentials', { p_user_id: userId });
  if (!Array.isArray(data)) throw new PasskeyError('STAFF_PASSKEY_UNAVAILABLE', 503);
  return data;
}

export async function staffCredentialList() {
  try {
    const { user, status } = await identity(false);
    const credentials = await records(user.id);
    return noStore(apiOk({ ...status, credentials: credentials.map(({ id, label }) => ({ id, label })) }));
  } catch (error) { return passkeyFailure(error); }
}

export async function staffCredentialRevoke(request: Request) {
  try {
    requireOrigin(request);
    const parsed = await parseBody(request, revokeSchema, { maxBytes: 4096 });
    if (!parsed.ok) return noStore(parsed.response);
    const { user, session } = await identity(true);
    await serviceRpc('revoke_staff_passkey_credential', { p_user_id: user.id, p_session_id: session!.sessionId, p_credential_id: parsed.data.credentialId });
    return noStore(apiOk({ revoked: true }));
  } catch (error) { return passkeyFailure(error); }
}

export async function staffPasskeyChallenge(request: Request) {
  try {
    const config = requireOrigin(request);
    const parsed = await parseBody(request, challengeSchema, { maxBytes: 8192 });
    if (!parsed.ok) return noStore(parsed.response);
    const { user, session } = await identity(true);
    const { operation, grant, label, withdrawalId, expectedVersion } = parsed.data;
    let payload: Record<string, unknown> = {};
    if (['approve', 'retry-payout', 'fraud-override'].includes(operation)) {
      if (!withdrawalId || !expectedVersion) throw new PasskeyError('VALIDATION_FAILED', 422);
      const payloadResult = (operation === 'fraud-override' ? riskPayloadSchema : financialPayloadSchema).safeParse(parsed.data.payload);
      if (!payloadResult.success) throw new PasskeyError('VALIDATION_FAILED', 422);
      payload = payloadResult.data;
      const reason = operation === 'fraud-override' ? payload.reason : payload.note;
      if (!walletReasonSchema.safeParse({ action: operation === 'fraud-override' ? 'fraud_override' : 'approve', reason, reasonCategory: payload.reasonCategory }).success) throw new PasskeyError('VALIDATION_FAILED', 422);
    } else if (withdrawalId || expectedVersion || parsed.data.payload) throw new PasskeyError('VALIDATION_FAILED', 422);
    const credentials = await records(user.id);
    const userHandle = credentials[0]?.userHandle ?? randomBytes(32).toString('base64url');
    const options = operation === 'register'
      ? await registrationOptions(config, `${BRAND_NAME} staff`, userHandle, credentials)
      : await authenticationOptions(config, credentials);
    const context = await serviceRpc('begin_staff_passkey_challenge', {
      p_user_id: user.id, p_session_id: session!.sessionId, p_operation: operation,
      p_challenge: options.challenge, p_user_handle: userHandle, p_label: label ?? 'Passkey',
      p_withdrawal_id: withdrawalId ?? null, p_payload: payload,
      p_grant_hash: grant ? createHash('sha256').update(grant).digest('hex') : null,
      p_expected_version: expectedVersion ?? null,
    });
    if (!context?.id) throw new PasskeyError('STAFF_PASSKEY_UNAVAILABLE', 503);
    if ('user' in options) options.user.id = context.userHandle;
    return noStore(apiOk({ challengeId: context.id, options }));
  } catch (error) { return passkeyFailure(error); }
}

export async function staffPasskeyVerify(request: Request) {
  try {
    const config = requireOrigin(request);
    const parsed = await parseBody(request, verifySchema, { maxBytes: 98304 });
    if (!parsed.ok) return noStore(parsed.response);
    const { user, session } = await identity(true);
    const context = await serviceRpc('claim_staff_passkey_challenge', { p_user_id: user.id, p_session_id: session!.sessionId, p_challenge_id: parsed.data.challengeId });
    const response = parsed.data.credential;
    let credentialId: string; let publicKey: string | null = null; let counter: number; let previousCounter = 0;
    let transports: WebAuthnCredential['transports'] = []; let deviceType: string; let backedUp: boolean;
    try {
      if (context.operation === 'register') {
        const result = await verifyStaffRegistration(config, context.challenge, response as unknown as RegistrationResponseJSON);
        if (!result.verified || !result.registrationInfo?.userVerified) throw new Error();
        const info = result.registrationInfo;
        credentialId = info.credential.id; publicKey = Buffer.from(info.credential.publicKey).toString('base64url'); counter = info.credential.counter;
        transports = info.credential.transports ?? []; deviceType = info.credentialDeviceType; backedUp = info.credentialBackedUp;
      } else {
        const stored = (await records(user.id)).find(item => item.id === response.id);
        if (!stored) throw new Error();
        const assertion = response as unknown as AuthenticationResponseJSON;
        if (assertion.response.userHandle && assertion.response.userHandle !== stored.userHandle) throw new Error();
        const result = await verifyStaffAuthentication(config, context.challenge, assertion, { id: stored.id, publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')), counter: stored.counter, transports: stored.transports });
        if (!result.verified || !result.authenticationInfo.userVerified) throw new Error();
        credentialId = stored.id; previousCounter = stored.counter; counter = result.authenticationInfo.newCounter;
        transports = stored.transports; deviceType = result.authenticationInfo.credentialDeviceType; backedUp = result.authenticationInfo.credentialBackedUp;
      }
    } catch { throw new PasskeyError('STAFF_PASSKEY_FAILED', 400); }
    const result = await serviceRpc('finish_staff_passkey_challenge', {
      p_user_id: user.id, p_session_id: session!.sessionId, p_challenge_id: context.id, p_reservation_token: context.reservation_token,
      p_credential_id: credentialId, p_public_key: publicKey, p_counter: counter, p_previous_counter: previousCounter,
      p_transports: transports ?? [], p_device_type: deviceType, p_backed_up: backedUp,
    });
    return noStore(apiOk(result));
  } catch (error) { return passkeyFailure(error); }
}
