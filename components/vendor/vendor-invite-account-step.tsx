'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import { buildGoogleInvitationCallbackUrl } from '@/components/vendor/vendor-invite-wizard-state';

type AccountStepState = 'choose' | 'email-code' | 'busy' | 'mismatch';

type VendorInviteAccountStepProps = {
  token: string;
  account: VendorInvitePreview['account'];
  onContinue: () => void;
  onReload: () => Promise<void>;
};

type ApiResponse = { error?: { message?: string } | null };

async function readError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as ApiResponse | null;
  return body?.error?.message ?? fallback;
}

export function VendorInviteAccountStep({ token, account, onContinue, onReload }: VendorInviteAccountStepProps) {
  const [state, setState] = useState<AccountStepState>('choose');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/vendor-invite/auth/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Unable to send a sign-in code. Please try again.'));
      setState('email-code');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send a sign-in code. Please try again.');
      setState('choose');
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setState('busy');
    setError(null);
    try {
      const response = await fetch('/api/vendor-invite/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, code }),
      });
      if (!response.ok) throw new Error(await readError(response, 'That code is invalid or has expired.'));
      await onReload();
      setCode('');
      setState('choose');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That code is invalid or has expired.');
      setState('email-code');
    }
  }

  async function continueWithGoogle() {
    setState('busy');
    setError(null);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: buildGoogleInvitationCallbackUrl(window.location.origin, token) },
    });
    if (oauthError) {
      setError('Unable to continue with Google. Please try again.');
      setState('choose');
    }
  }

  async function switchAccount() {
    setState('busy');
    setError(null);
    const { error: signOutError } = await createClient().auth.signOut({ scope: 'local' });
    if (signOutError) {
      setError('Unable to switch accounts. Please try again.');
      setState('mismatch');
      return;
    }
    await onReload();
    setState('choose');
  }

  if (account.authenticated && !account.emailMatched) {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-900/70 dark:bg-amber-950/20">
        <h2 className="text-xl font-bold text-foreground">Use the invited account</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">This invitation was sent to {account.maskedInviteEmail}. Switch accounts to continue; private invitation prefill stays locked until the email matches.</p>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <button type="button" onClick={() => void switchAccount()} disabled={state === 'busy'} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{state === 'busy' ? 'Switching…' : 'Switch account'}</button>
      </section>
    );
  }

  if (state === 'email-code' || state === 'busy' && code) {
    return (
      <form onSubmit={verifyCode} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Check your email</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the six-digit code sent to the email address on this invitation.</p>
        </div>
        <label className="block text-sm font-semibold text-foreground">6-digit email code
          <input aria-label="6-digit email code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center text-lg tracking-[0.35em] font-normal" />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={state === 'busy'} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{state === 'busy' ? 'Verifying…' : 'Verify email code'}</button>
        <button type="button" onClick={() => void sendCode()} disabled={state === 'busy'} className="w-full text-sm font-semibold text-primary hover:underline disabled:opacity-50">Send a new code</button>
      </form>
    );
  }

  if (account.emailMatched) {
    return (
      <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-6">
        <h2 className="text-xl font-bold text-foreground">Email confirmed</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">This account matches the invitation. Continue to review the Vendor and first outlet details.</p>
        <button type="button" onClick={onContinue} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Continue</button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Confirm your account</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the email address that received this invitation. No password is needed.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" onClick={() => void sendCode()} disabled={state === 'busy'} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{state === 'busy' ? 'Sending…' : 'Send 6-digit email code'}</button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <button type="button" onClick={() => void continueWithGoogle()} disabled={state === 'busy'} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50">Continue with Google</button>
    </section>
  );
}
