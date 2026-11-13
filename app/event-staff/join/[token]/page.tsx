'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HumanVerification, useHumanVerification } from '@/components/shared/human-verification';
import { createClient } from '@/lib/supabase/client';

interface LinkInfo { vendorName: string; campaignTitle: string }
type Step = 'details' | 'code';
type Blocked = 'invalid' | 'removed' | null;

const jsonPost = (url: string, body: unknown) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

/** Public join page for an event staff link: verify an email, then join. */
export default function EventStaffJoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { t } = useTranslation('vendor');
  const { t: tAuth } = useTranslation('auth');
  const { user, loading: authLoading } = useAuth();
  const human = useHumanVerification('event_staff_email_send');
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [step, setStep] = useState<Step>('details');
  // null = untouched, so a signed-in user's profile name shows until they edit it.
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generic = t('errors.generic', { ns: 'common' });
  const displayName = (name ?? user?.fullName ?? '').trim();

  useEffect(() => {
    let active = true;
    void fetch(`/api/event-staff/links/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!active) return;
        if (response.ok) setInfo(((await response.json()) as { data: LinkInfo }).data);
        else if (response.status === 404) setBlocked('invalid');
        else setError(generic);
      })
      .catch(() => { if (active) setError(generic); });
    return () => { active = false; };
  }, [token, generic]);

  /** Map a failed response to the page state; returns true when the page is now blocked. */
  async function handleFailure(response: Response) {
    const body = await response.json().catch(() => ({})) as { error?: { code?: string } };
    if (body.error?.code === 'LINK_INVALID') setBlocked('invalid');
    else if (body.error?.code === 'MEMBER_REMOVED') setBlocked('removed');
    else setError(body.error?.code === 'HUMAN_VERIFICATION_FAILED' ? tAuth('humanVerification.required') : generic);
  }

  async function joinNow() {
    const response = await jsonPost('/api/event-staff/join', { token, displayName });
    if (!response.ok) { await handleFailure(response); return false; }
    return true;
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    const captchaToken = human.takeToken();
    if (!captchaToken) { setError(tAuth('humanVerification.required')); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await jsonPost('/api/event-staff/auth/email/send', { token, email, displayName, captchaToken });
      if (!response.ok) await handleFailure(response);
      else setStep('code');
    } catch {
      setError(generic);
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await jsonPost('/api/event-staff/auth/email/verify', { token, email, code });
      if (!response.ok) { await handleFailure(response); return; }
      // Full navigation so the auth provider picks up the session the server just set.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a client-side push would keep the signed-out auth state
      if (await joinNow()) window.location.assign('/event-staff');
    } catch {
      setError(generic);
    } finally {
      setBusy(false);
    }
  }

  async function joinSignedIn() {
    setBusy(true);
    setError(null);
    try {
      if (await joinNow()) router.replace('/event-staff');
    } catch {
      setError(generic);
    } finally {
      setBusy(false);
    }
  }

  async function switchEmail() {
    setBusy(true);
    const { error: signOutError } = await createClient().auth.signOut({ scope: 'local' });
    if (signOutError) { setError(generic); setBusy(false); return; }
    window.location.reload();
  }

  const errorLine = error && <p role="alert" className="text-sm text-destructive">{error}</p>;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
        {blocked ? (
          <p role="alert" className="text-sm text-foreground">{t(blocked === 'invalid' ? 'ui.eventStaff.join.invalidLink' : 'ui.eventStaff.join.removed')}</p>
        ) : !info || authLoading ? (
          error ? errorLine : <Loader2 size={20} className="mx-auto animate-spin text-muted-foreground" aria-label={t('ui.events.loading')} />
        ) : (
          <>
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('ui.eventStaff.join.title')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{info.vendorName} · {info.campaignTitle}</p>
            </div>
            {user ? (
              <>
                <p className="text-sm text-muted-foreground">{t('ui.eventStaff.join.signedInAs', { email: user.email })}</p>
                <label className="block space-y-1 text-sm font-semibold text-foreground">
                  <span>{t('ui.eventStaff.join.nameLabel')}</span>
                  <Input value={name ?? user.fullName ?? ''} maxLength={80} required onChange={(event) => setName(event.target.value)} />
                </label>
                {errorLine}
                <Button type="button" className="w-full" disabled={busy || !displayName} onClick={() => void joinSignedIn()}>{t('ui.eventStaff.join.join')}</Button>
                <button type="button" disabled={busy} onClick={() => void switchEmail()} className="w-full text-sm font-semibold text-primary hover:underline disabled:opacity-50">{t('ui.eventStaff.join.useAnotherEmail')}</button>
              </>
            ) : step === 'details' ? (
              <form onSubmit={(event) => void sendCode(event)} className="space-y-4">
                <label className="block space-y-1 text-sm font-semibold text-foreground">
                  <span>{t('ui.eventStaff.join.nameLabel')}</span>
                  <Input value={name ?? ''} maxLength={80} autoComplete="name" required onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="block space-y-1 text-sm font-semibold text-foreground">
                  <span>{t('ui.eventStaff.join.emailLabel')}</span>
                  <Input type="email" value={email} maxLength={254} autoComplete="email" required onChange={(event) => setEmail(event.target.value)} />
                </label>
                <HumanVerification {...human} />
                {errorLine}
                <Button type="submit" className="w-full" disabled={busy || !displayName || !email.trim()}>{t('ui.eventStaff.join.sendCode')}</Button>
              </form>
            ) : (
              <form onSubmit={(event) => void verifyAndJoin(event)} className="space-y-4">
                <label className="block text-sm font-semibold text-foreground">{t('ui.eventStaff.join.codeLabel')}
                  <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center text-lg tracking-[0.35em] font-normal" />
                </label>
                {errorLine}
                <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{t('ui.eventStaff.join.verifyAndJoin')}</Button>
                <HumanVerification {...human} />
                <button type="button" disabled={busy} onClick={() => void sendCode()} className="w-full text-sm font-semibold text-primary hover:underline disabled:opacity-50">{t('ui.eventStaff.join.resendCode')}</button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
