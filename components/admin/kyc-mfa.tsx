"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { safeKycReviewNext } from '@/lib/auth/safe-next';
import { safeStaffVerificationNext } from '@/lib/auth/staff-route-boundaries';
import { AuthPageShell } from '@/components/shared/auth-page-shell';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';

// The real code field sits invisibly over the six display boxes. It must stay hidden while
// disabled too, or Input's `disabled:opacity-50` shows the raw digits over the first box.
export const STAFF_CODE_INPUT_CLASS = 'absolute inset-0 h-full w-full cursor-text opacity-0 disabled:opacity-0';

export function KycMfa({ next, available = true, scope = 'kyc' }: { next: string; available?: boolean; scope?: 'kyc' | 'staff' }) {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const db = useMemo(() => createClient(), []);
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (scope === 'staff' && factorId && !busy) codeInput.current?.focus();
  }, [scope, factorId, busy]);

  async function start() {
    if (busy || !available) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: listError } = await db.auth.mfa.listFactors();
      if (listError || !data) throw new Error();
      const verified = data.totp.find(factor => factor.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setQr(null);
        setEnrolling(false);
      } else {
        // Retry only this flow's abandoned, unverified factors.
        for (const factor of data.all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified' && [`${BRAND_NAME} KYC`, 'MyLawatan KYC'].includes(factor.friendly_name ?? ''))) {
          const { error: cleanupError } = await db.auth.mfa.unenroll({ factorId: factor.id });
          if (cleanupError) throw new Error();
        }
        const { data: enrollment, error: enrollError } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `${BRAND_NAME} KYC`, issuer: BRAND_NAME });
        if (enrollError || !enrollment || enrollment.type !== 'totp' || !enrollment.totp.qr_code.startsWith('data:image/svg+xml;')) throw new Error();
        setFactorId(enrollment.id);
        setQr(enrollment.totp.qr_code);
        setEnrolling(true);
      }
      setCode('');
    } catch { setError(t('kyc.mfa.setupError')); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy || !factorId || !/^[0-9]{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await db.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) throw new Error();
      const { data, error: claimsError } = await db.auth.getClaims();
      if (claimsError || data?.claims.aal !== 'aal2') throw new Error();
      setQr(null);
      setCode('');
      setFactorId('');
      setEnrolling(false);
      if (scope === 'staff') {
        // A full navigation reloads the provider's previously AAL1 projection.
        window.location.assign(safeStaffVerificationNext(next));
      } else {
        router.replace(safeKycReviewNext(next));
        router.refresh();
      }
    } catch {
      setCode('');
      setError(t('kyc.mfa.verifyError'));
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      if (enrolling && factorId) {
        const { error: cleanupError } = await db.auth.mfa.unenroll({ factorId });
        if (cleanupError) throw new Error();
      }
      setQr(null);
      setCode('');
      setFactorId('');
      setEnrolling(false);
      setError(null);
    } catch { setError(t('kyc.mfa.cancelError')); }
    finally { setBusy(false); }
  }

  const staff = scope === 'staff';
  const primaryClass = staff ? 'h-12 w-full rounded-xl text-sm font-semibold shadow-sm sm:text-base' : undefined;
  const content = (
      <section className={staff ? 'space-y-5' : 'max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6'}>
        {(!available || error) && <p role="alert" className={staff ? 'rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive sm:text-sm' : 'text-sm text-destructive'}>{error ?? t('kyc.mfa.setupError')}</p>}
        {!factorId ? <Button className={primaryClass} disabled={busy || !available} onClick={() => void start()}>{t(busy ? 'kyc.mfa.working' : 'kyc.mfa.start')}</Button> : (
          <form onSubmit={verify} className="space-y-4">
            {qr && <>
              <p className="text-sm text-muted-foreground">{t('kyc.mfa.scan')}</p>
              {/* The QR is held in memory only and never sent to an external image service. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={t('kyc.mfa.qrAlt')} className={`h-56 w-56 max-w-full rounded-xl bg-white p-3${staff ? ' mx-auto' : ''}`} referrerPolicy="no-referrer" />
            </>}
            <label htmlFor="kyc-mfa-code" className={staff ? 'block text-xs font-semibold uppercase tracking-wider text-muted-foreground' : 'block text-sm font-semibold'}>{t('kyc.mfa.code')}</label>
            <div className={staff ? 'relative rounded-xl focus-within:ring-4 focus-within:ring-primary/10' : undefined}>
              {staff && <div aria-hidden="true" className="grid grid-cols-6 gap-2">
                {Array.from({ length: 6 }, (_, index) => <span key={index} className={`flex h-12 min-w-0 items-center justify-center rounded-xl border bg-secondary/40 text-xl font-bold ${index === Math.min(code.length, 5) ? 'border-primary' : 'border-border'}${busy ? ' opacity-50' : ''}`}>{code[index] ?? ''}</span>)}
              </div>}
              <Input ref={codeInput} id="kyc-mfa-code" className={staff ? STAFF_CODE_INPUT_CLASS : undefined} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} />
            </div>
            <div className={staff ? 'flex flex-col gap-3' : 'flex gap-3'}>
              <Button type="submit" className={primaryClass} disabled={busy || code.length !== 6}>{t(busy ? 'kyc.mfa.working' : 'kyc.mfa.verify')}</Button>
              <Button type="button" className={staff ? 'h-12 w-full rounded-xl' : undefined} variant="outline" disabled={busy} onClick={() => void cancel()}>{t('kyc.mfa.cancel')}</Button>
            </div>
          </form>
        )}
        <p className={staff ? 'border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground' : 'text-sm text-muted-foreground'}>{t('kyc.mfa.recovery')}</p>
      </section>
  );
  if (staff) return <AuthPageShell title={t('staffMfa.title')} description={t('staffMfa.description')}>{content}</AuthPageShell>;
  return <AdminPageShell><AdminPageHeader eyebrow={<><ShieldCheck size={18} /> {t('kyc.eyebrow')}</>} title={t('kyc.mfa.title')} description={t('kyc.mfa.description')} />{content}</AdminPageShell>;
}
