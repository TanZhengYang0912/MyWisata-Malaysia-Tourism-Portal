'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InternationalPhoneInput } from '@/components/profile/international-phone-input';
import {
  requestPhoneOtp,
  resolveOutletContactPhone,
  resolvePhoneVerificationPhase,
  verifyPhoneOtp,
  type PhoneVerificationPhase,
} from '@/components/vendor/vendor-invite-phone-state';
import type { VendorInviteDraft } from '@/components/vendor/vendor-invite-wizard-state';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';

type VendorInviteOtpDigitsProps = {
  digits: string[];
  disabled: boolean;
  onChange: (index: number, digit: string) => void;
};

export function VendorInviteOtpDigits({ digits, disabled, onChange }: VendorInviteOtpDigitsProps) {
  const { t } = useTranslation('vendor');
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function updateDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    onChange(index, digit);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  }

  return (
    <div className="flex gap-2" aria-label={t('invite.phone.codeLabel')}>
      {Array.from({ length: 6 }, (_, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          value={digits[index] ?? ''}
          onChange={(event) => updateDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={t('invite.phone.otpDigit', { index: index + 1 })}
          className="h-12 w-11 rounded-xl border border-border bg-background text-center text-lg font-semibold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60"
        />
      ))}
    </div>
  );
}

type VendorInvitePhoneStepProps = {
  preview: VendorInvitePreview;
  draft: VendorInviteDraft;
  submitting: boolean;
  forceUnverified?: boolean;
  claimError?: string | null;
  onBack: () => void;
  onUpdateContactPhone: (phone: string) => void;
  onUpdateAuthorized?: (authorized: boolean) => void;
  onVerified: () => Promise<void>;
  onSubmit: () => Promise<void>;
};

function phoneOtpError(
  t: (key: string) => string,
  phase: 'send' | 'verify',
  code: string,
  status: number,
) {
  if (code === 'PHONE_ALREADY_CLAIMED') return t('invite.errors.phoneAlreadyClaimed');
  if (code === 'RATE_LIMITED' || status === 429) return t('invite.errors.phoneRateLimited');
  if (phase === 'verify' && (code === 'OTP_INVALID' || code === 'VALIDATION_FAILED' || status === 422)) return t('invite.errors.phoneInvalidCode');
  if (phase === 'send' && (code === 'INVALID_PHONE' || code === 'VALIDATION_FAILED' || status === 422)) return t('invite.errors.phoneInvalidNumber');
  if (status >= 500 || code === 'VERIFICATION_UNAVAILABLE' || code === 'TWILIO_ERROR' || code === 'DB_ERROR') return t('invite.errors.phoneUnavailable');
  return phase === 'verify' ? t('invite.errors.phoneVerifyFallback') : t('invite.errors.phoneSendFallback');
}

export function VendorInvitePhoneStep({
  preview,
  draft,
  submitting,
  forceUnverified = false,
  claimError,
  onBack,
  onUpdateContactPhone,
  onUpdateAuthorized = () => undefined,
  onVerified,
  onSubmit,
}: VendorInvitePhoneStepProps) {
  const { t } = useTranslation('vendor');
  const [personalMobile, setPersonalMobile] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [phonePhase, setPhonePhase] = useState<PhoneVerificationPhase>(
    preview.account.phoneVerified ? 'verified' : 'enter',
  );
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [useForOutlet, setUseForOutlet] = useState(false);
  const previousOutletContactRef = useRef(draft.contactPhone);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const resolvedPhonePhase = resolvePhoneVerificationPhase(
    preview.account.phoneVerified,
    phonePhase,
    forceUnverified,
  );
  const mobileVerified = resolvedPhonePhase === 'verified';
  const categoryName = preview.categories.find((category) => category.id === draft.categoryId)?.name ?? t('invite.phone.categoryUnavailable');

  function resendLabel() {
    if (resendSeconds <= 0) return t('invite.phone.resendOtp');
    const minutes = Math.floor(resendSeconds / 60);
    return t('invite.phone.resendIn', { minutes, seconds: String(resendSeconds % 60).padStart(2, '0') });
  }

  function updatePersonalMobile(value: string) {
    setPersonalMobile(value);
    setPhoneError(null);
    if (useForOutlet) onUpdateContactPhone(resolveOutletContactPhone(true, value, previousOutletContactRef.current));
  }

  async function sendOtp() {
    if (mobileVerified || phoneBusy || resendSeconds > 0) return;
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const result = await requestPhoneOtp(fetch, personalMobile);
      if (!result.ok) {
        setPhoneError(phoneOtpError(t, 'send', result.code, result.status));
        return;
      }
      setOtpDigits(['', '', '', '', '', '']);
      setPhonePhase('code');
      setResendSeconds(60);
    } catch {
      setPhoneError(phoneOtpError(t, 'send', '', 503));
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyOtp() {
    if (phoneBusy || otpDigits.some((digit) => !digit)) return;
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const result = await verifyPhoneOtp(fetch, personalMobile, otpDigits);
      if (!result.ok) {
        setPhoneError(phoneOtpError(t, 'verify', result.code, result.status));
        return;
      }
      setPhonePhase('verified');
      await onVerified();
    } catch {
      setPhoneError(phoneOtpError(t, 'verify', '', 503));
    } finally {
      setPhoneBusy(false);
    }
  }

  function updateOutletOptIn(checked: boolean) {
    setUseForOutlet(checked);
    onUpdateContactPhone(resolveOutletContactPhone(checked, personalMobile, previousOutletContactRef.current));
  }

  if (!mobileVerified) {
    return (
      <section className="space-y-5 rounded-2xl border border-border bg-card p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('invite.phone.accountSecurity')}</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">{t('invite.phone.verifyMobile')}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('invite.phone.mobileDescription')}</p>
        </div>

        <div>
          <label htmlFor="vendor-invite-personal-mobile" className="text-sm font-semibold text-foreground">{t('invite.phone.personalMobile')}</label>
          <div className="mt-1">
            <InternationalPhoneInput
              id="vendor-invite-personal-mobile"
              value={personalMobile}
              onChange={updatePersonalMobile}
              disabled={phoneBusy}
              error={Boolean(phoneError)}
            />
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={useForOutlet}
            onChange={(event) => updateOutletOptIn(event.target.checked)}
            disabled={phoneBusy}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span><span className="font-semibold">{t('invite.phone.useAsOutletContact')}</span><span className="block text-xs text-muted-foreground">{t('invite.phone.outletContactDescription')}</span></span>
        </label>

        {resolvedPhonePhase === 'code' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">{t('invite.phone.enterCode')}</p>
            <VendorInviteOtpDigits
              digits={otpDigits}
              disabled={phoneBusy}
              onChange={(index, digit) => setOtpDigits((current) => current.map((value, position) => position === index ? digit : value))}
            />
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => void verifyOtp()} disabled={phoneBusy || otpDigits.some((digit) => !digit)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{t('invite.phone.verifyOtp')}</button>
              <button type="button" onClick={() => void sendOtp()} disabled={phoneBusy || resendSeconds > 0} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">{resendLabel()}</button>
            </div>
          </div>
        )}

        {phoneError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{phoneError}</p>}
        {claimError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{claimError}</p>}

        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={onBack} disabled={phoneBusy} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">{t('invite.actions.back')}</button>
          {resolvedPhonePhase === 'enter' && <button type="button" onClick={() => void sendOtp()} disabled={phoneBusy || !personalMobile} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{t('invite.phone.sendOtp')}</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('invite.phone.finalReview')}</p>
        <h2 className="mt-2 text-xl font-bold text-foreground">{t('invite.phone.reviewApplication')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('invite.phone.reviewDescription')}</p>
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-muted-foreground">{t('invite.phone.ownerAccount')}</dt><dd className="mt-1 text-foreground">{t('invite.phone.signedInInvitationEmail')}</dd><dd className="mt-1 font-semibold text-green-700">{t('invite.phone.mobileVerified')} {preview.account.maskedVerifiedPhone ? `· ${preview.account.maskedVerifiedPhone}` : ''}</dd></div>
        <div><dt className="font-semibold text-muted-foreground">{t('invite.phone.vendor')}</dt><dd className="mt-1 text-foreground">{draft.businessName}</dd><dd className="mt-1 text-muted-foreground">{draft.legalBusinessName}</dd></div>
        <div><dt className="font-semibold text-muted-foreground">{t('invite.fields.category')}</dt><dd className="mt-1 text-foreground">{categoryName}</dd></div>
        <div><dt className="font-semibold text-muted-foreground">{t('invite.phone.firstOutlet')}</dt><dd className="mt-1 text-foreground">{draft.outletName}</dd><dd className="mt-1 text-muted-foreground">{draft.businessAddress}</dd></div>
        <div className="sm:col-span-2"><dt className="font-semibold text-muted-foreground">{t('invite.phone.applicationStatus')}</dt><dd className="mt-1 text-foreground">{t('invite.phone.pendingReview')}</dd></div>
      </dl>

      <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm text-foreground">
        <input
          type="checkbox"
          checked={draft.authorizedToRepresent}
          onChange={(event) => onUpdateAuthorized(event.target.checked)}
          disabled={submitting}
          required
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        <span>{t('invite.phone.authorization')}</span>
      </label>

      {claimError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{claimError}</p>}

      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={onBack} disabled={submitting} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">{t('invite.actions.back')}</button>
        <button type="button" onClick={() => void onSubmit()} disabled={submitting || !draft.authorizedToRepresent} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{submitting ? t('invite.phone.submitting') : t('invite.phone.submitApplication')}</button>
      </div>
    </section>
  );
}
