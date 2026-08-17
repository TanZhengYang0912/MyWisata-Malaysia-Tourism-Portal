'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('vendor');
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
      if (!response.ok) throw new Error(await readError(response, t('invite.errors.sendCode')));
      setState('email-code');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('invite.errors.sendCode'));
      setState('choose');
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError(t('invite.errors.invalidCode'));
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
      if (!response.ok) throw new Error(await readError(response, t('invite.errors.expiredCode')));
      await onReload();
      setCode('');
      setState('choose');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('invite.errors.expiredCode'));
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
      setError(t('invite.errors.google'));
      setState('choose');
    }
  }

  async function switchAccount() {
    setState('busy');
    setError(null);
    const { error: signOutError } = await createClient().auth.signOut({ scope: 'local' });
    if (signOutError) {
      setError(t('invite.errors.switchAccount'));
      setState('mismatch');
      return;
    }
    await onReload();
    setState('choose');
  }

  if (account.authenticated && !account.emailMatched) {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 dark:border-amber-900/70 dark:bg-amber-950/20">
        <h2 className="text-xl font-bold text-foreground">{t('invite.account.useInvitedAccount')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('invite.account.mismatch', { email: account.maskedInviteEmail })}</p>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <button type="button" onClick={() => void switchAccount()} disabled={state === 'busy'} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{state === 'busy' ? t('invite.account.switching') : t('invite.account.switch')}</button>
      </section>
    );
  }

  if (state === 'email-code' || state === 'busy' && code) {
    return (
      <form onSubmit={verifyCode} className="space-y-4 rounded-2xl border border-border bg-card p-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t('invite.account.checkEmail')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('invite.account.codeDescription')}</p>
        </div>
        <label className="block text-sm font-semibold text-foreground">{t('invite.account.emailCodeLabel')}
          <input aria-label={t('invite.account.emailCodeLabel')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center text-lg tracking-[0.35em] font-normal" />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={state === 'busy'} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{state === 'busy' ? t('invite.account.verifying') : t('invite.account.verifyEmailCode')}</button>
        <button type="button" onClick={() => void sendCode()} disabled={state === 'busy'} className="w-full text-sm font-semibold text-primary hover:underline disabled:opacity-50">{t('invite.account.sendNewCode')}</button>
      </form>
    );
  }

  if (account.emailMatched) {
    return (
      <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-6">
        <h2 className="text-xl font-bold text-foreground">{t('invite.account.emailConfirmed')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('invite.account.emailMatchedDescription')}</p>
        <button type="button" onClick={onContinue} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{t('invite.actions.continue')}</button>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{t('invite.account.confirmAccount')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('invite.account.confirmDescription')}</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="button" onClick={() => void sendCode()} disabled={state === 'busy'} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{state === 'busy' ? t('invite.account.sending') : t('invite.account.sendCode')}</button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t('invite.account.or')}<span className="h-px flex-1 bg-border" /></div>
      <button type="button" onClick={() => void continueWithGoogle()} disabled={state === 'busy'} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50">{t('invite.actions.continueWithGoogle')}</button>
    </section>
  );
}
