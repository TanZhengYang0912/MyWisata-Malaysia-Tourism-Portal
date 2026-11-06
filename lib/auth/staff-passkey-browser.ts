"use client";

import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

export type StaffPasskeyRequest = {
  operation: 'register' | 'login' | 'manage' | 'approve' | 'retry-payout' | 'fraud-override' | 'jit-activate';
  label?: string; grant?: string; withdrawalId?: string; expectedVersion?: string; payload?: Record<string, unknown>;
};

export async function runStaffPasskey(input: StaffPasskeyRequest): Promise<{ registered: boolean; proofId: string | null }> {
  if (!window.PublicKeyCredential || !window.isSecureContext) throw new Error('STAFF_PASSKEY_UNSUPPORTED');
  const response = await fetch('/api/auth/staff-passkey/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const body = await response.json();
  if (!response.ok || !body.data?.challengeId || !body.data.options) throw new Error(body.error?.code ?? 'STAFF_PASSKEY_UNAVAILABLE');
  const credential = input.operation === 'register'
    ? await startRegistration({ optionsJSON: body.data.options as PublicKeyCredentialCreationOptionsJSON })
    : await startAuthentication({ optionsJSON: body.data.options as PublicKeyCredentialRequestOptionsJSON });
  const verification = await fetch('/api/auth/staff-passkey/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: body.data.challengeId, credential }) });
  const result = await verification.json();
  if (!verification.ok || !result.data) throw new Error(result.error?.code ?? 'STAFF_PASSKEY_FAILED');
  if (['approve', 'retry-payout', 'fraud-override', 'jit-activate'].includes(input.operation) && typeof result.data.proofId !== 'string') throw new Error('STAFF_PASSKEY_FAILED');
  return result.data;
}
