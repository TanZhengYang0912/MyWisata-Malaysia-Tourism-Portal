'use client';

import { useEffect, useRef, useState } from 'react';
import { InternationalPhoneInput } from '@/components/profile/international-phone-input';
import {
  formatResendCountdown,
  mapPhoneOtpError,
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
    <div className="flex gap-2" aria-label="Phone verification code">
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
          aria-label={`OTP digit ${index + 1}`}
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
  const categoryName = preview.categories.find((category) => category.id === draft.categoryId)?.name ?? 'Category unavailable';

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
        setPhoneError(mapPhoneOtpError({ phase: 'send', code: result.code, status: result.status }));
        return;
      }
      setOtpDigits(['', '', '', '', '', '']);
      setPhonePhase('code');
      setResendSeconds(60);
    } catch {
      setPhoneError(mapPhoneOtpError({ phase: 'send', code: '', status: 503 }));
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
        setPhoneError(mapPhoneOtpError({ phase: 'verify', code: result.code, status: result.status }));
        return;
      }
      setPhonePhase('verified');
      await onVerified();
    } catch {
      setPhoneError(mapPhoneOtpError({ phase: 'verify', code: '', status: 503 }));
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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Account security</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">Verify your personal mobile</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">This number stays private. It verifies your User identity and is separate from the Outlet contact.</p>
        </div>

        <div>
          <label htmlFor="vendor-invite-personal-mobile" className="text-sm font-semibold text-foreground">Personal mobile number</label>
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
          <span><span className="font-semibold">Use this mobile as Outlet contact</span><span className="block text-xs text-muted-foreground">Only select this if customers may contact the Outlet on this number.</span></span>
        </label>

        {resolvedPhonePhase === 'code' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Enter the 6-digit code</p>
            <VendorInviteOtpDigits
              digits={otpDigits}
              disabled={phoneBusy}
              onChange={(index, digit) => setOtpDigits((current) => current.map((value, position) => position === index ? digit : value))}
            />
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => void verifyOtp()} disabled={phoneBusy || otpDigits.some((digit) => !digit)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Verify phone OTP</button>
              <button type="button" onClick={() => void sendOtp()} disabled={phoneBusy || resendSeconds > 0} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">{formatResendCountdown(resendSeconds)}</button>
            </div>
          </div>
        )}

        {phoneError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{phoneError}</p>}
        {claimError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{claimError}</p>}

        <div className="flex items-center justify-between gap-4">
          <button type="button" onClick={onBack} disabled={phoneBusy} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">Back</button>
          {resolvedPhonePhase === 'enter' && <button type="button" onClick={() => void sendOtp()} disabled={phoneBusy || !personalMobile} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Send phone OTP</button>}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Final review</p>
        <h2 className="mt-2 text-xl font-bold text-foreground">Review your application</h2>
        <p className="mt-2 text-sm text-muted-foreground">Confirm these details before sending them to MyWisata for review.</p>
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-muted-foreground">Owner and account</dt><dd className="mt-1 text-foreground">Signed in with the invitation email</dd><dd className="mt-1 font-semibold text-green-700">Mobile verified {preview.account.maskedVerifiedPhone ? `· ${preview.account.maskedVerifiedPhone}` : ''}</dd></div>
        <div><dt className="font-semibold text-muted-foreground">Vendor</dt><dd className="mt-1 text-foreground">{draft.businessName}</dd><dd className="mt-1 text-muted-foreground">{draft.legalBusinessName}</dd></div>
        <div><dt className="font-semibold text-muted-foreground">Category</dt><dd className="mt-1 text-foreground">{categoryName}</dd></div>
        <div><dt className="font-semibold text-muted-foreground">First Outlet</dt><dd className="mt-1 text-foreground">{draft.outletName}</dd><dd className="mt-1 text-muted-foreground">{draft.businessAddress}</dd></div>
        <div className="sm:col-span-2"><dt className="font-semibold text-muted-foreground">Application status</dt><dd className="mt-1 text-foreground">Pending MyWisata review. The Vendor and Outlet stay private until approval.</dd></div>
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
        <span>I confirm that I am authorized to represent this business and submit this Vendor application.</span>
      </label>

      {claimError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{claimError}</p>}

      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={onBack} disabled={submitting} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">Back</button>
        <button type="button" onClick={() => void onSubmit()} disabled={submitting || !draft.authorizedToRepresent} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit application'}</button>
      </div>
    </section>
  );
}
