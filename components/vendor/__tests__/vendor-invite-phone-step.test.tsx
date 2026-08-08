import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { VendorInviteOtpDigits, VendorInvitePhoneStep } from '@/components/vendor/vendor-invite-phone-step';
import {
  buildGuidedVendorClaimInput,
  formatResendCountdown,
  mapClaimError,
  mapPhoneOtpError,
  phoneVerificationRecoveryReducer,
  requestPhoneOtp,
  recoveryRequiresPreviewReload,
  resolvePhoneVerificationPhase,
  resolveOutletContactPhone,
  submitGuidedVendorClaim,
  verifyPhoneOtp,
} from '@/components/vendor/vendor-invite-phone-state';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import type { VendorInviteDraft } from '@/components/vendor/vendor-invite-wizard-state';

const draft: VendorInviteDraft = {
  businessName: 'Rasa Malaysia Kitchen',
  legalBusinessName: 'Rasa Malaysia Kitchen Sdn Bhd',
  description: 'Malaysian food and local dining experiences.',
  categoryId: '11111111-0000-4000-8000-000000000001',
  outletName: 'Rasa Malaysia Kitchen — Jalan Alor',
  contactEmail: 'owner@example.com',
  contactPhone: '+60312345678',
  businessAddress: '12 Jalan Alor, Kuala Lumpur',
  latitude: 3.145,
  longitude: 101.708,
  authorizedToRepresent: true,
};

const preview = {
  account: {
    authenticated: true,
    emailMatched: true,
    phoneVerified: false,
    maskedInviteEmail: 'o***@example.com',
    maskedVerifiedPhone: null,
  },
  categories: [{ id: draft.categoryId, name: 'Food & dining', slug: 'food-dining' }],
} as VendorInvitePreview;

const callbacks = {
  onBack: vi.fn(),
  onUpdateContactPhone: vi.fn(),
  onVerified: vi.fn(async () => undefined),
  onSubmit: vi.fn(async () => undefined),
};

describe('VendorInvitePhoneStep server-render-safe states', () => {
  it('skips OTP for an existing verified User and shows the final review', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const markup = renderToStaticMarkup(
      <VendorInvitePhoneStep
        preview={{ ...preview, account: { ...preview.account, phoneVerified: true, maskedVerifiedPhone: '********3344' } }}
        draft={draft}
        submitting={false}
        {...callbacks}
      />,
    );

    expect(markup).toContain('Mobile verified');
    expect(markup).toContain('********3344');
    expect(markup).not.toContain('Send phone OTP');
    expect(markup).toContain('Review your application');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('keeps an unverified User mobile private and requires explicit Outlet contact opt-in', () => {
    const markup = renderToStaticMarkup(
      <VendorInvitePhoneStep preview={preview} draft={{ ...draft, authorizedToRepresent: false }} submitting={false} {...callbacks} />,
    );

    expect(markup).toContain('Personal mobile number');
    expect(markup).toContain('Send phone OTP');
    expect(markup).toContain('This number stays private.');
    expect(markup).toContain('Use this mobile as Outlet contact');
    expect(markup).not.toContain('checked=""');
  });

  it('authoritatively renders OTP when claim recovery overrides a stale verified preview', () => {
    const markup = renderToStaticMarkup(
      <VendorInvitePhoneStep
        preview={{ ...preview, account: { ...preview.account, phoneVerified: true, maskedVerifiedPhone: '********3344' } }}
        draft={draft}
        submitting={false}
        forceUnverified
        {...callbacks}
      />,
    );

    expect(markup).toContain('Personal mobile number');
    expect(markup).toContain('Send phone OTP');
    expect(markup).not.toContain('Review your application');
  });

  it('renders six separately labelled numeric OTP digits', () => {
    const markup = renderToStaticMarkup(
      <VendorInviteOtpDigits digits={['', '', '', '', '', '']} disabled={false} onChange={vi.fn()} />,
    );

    expect((markup.match(/aria-label="OTP digit [1-6]"/g) ?? [])).toHaveLength(6);
    expect((markup.match(/inputMode="numeric"/g) ?? [])).toHaveLength(6);
  });

  it('disables both Back and Submit while a claim is in flight', () => {
    const markup = renderToStaticMarkup(
      <VendorInvitePhoneStep
        preview={{ ...preview, account: { ...preview.account, phoneVerified: true, maskedVerifiedPhone: '********3344' } }}
        draft={draft}
        submitting
        {...callbacks}
      />,
    );

    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Back<\/button>/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Submitting…<\/button>/);
  });
});

describe('vendor invite phone and claim executable state', () => {
  it('posts only the personal mobile to send OTP and never contacts a live provider', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { sent: true }, error: null }));

    await requestPhoneOtp(fetcher, '+60123456789');

    expect(fetcher).toHaveBeenCalledWith('/api/phone/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+60123456789' }),
    });
  });

  it('joins exactly six OTP digits for verification', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { verified: true }, error: null }));

    await verifyPhoneOtp(fetcher, '+60123456789', ['1', '2', '3', '4', '5', '6']);

    expect(fetcher).toHaveBeenCalledWith('/api/phone/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+60123456789', code: '123456' }),
    });
  });

  it.each([
    ['send', 'PHONE_ALREADY_CLAIMED', 409, 'This mobile number is already linked to another MyWisata account. Use a different number.'],
    ['send', 'RATE_LIMITED', 429, 'Too many codes requested. Try again in 1 hour.'],
    ['verify', 'OTP_INVALID', 422, 'That code is invalid or has expired. Request a new code and try again.'],
    ['verify', 'VERIFICATION_UNAVAILABLE', 502, 'Mobile verification is temporarily unavailable. Try again later.'],
    ['send', 'TWILIO_ERROR', 502, 'Mobile verification is temporarily unavailable. Try again later.'],
  ] as const)('maps %s %s without raw API fields', (phase, code, status, message) => {
    expect(mapPhoneOtpError({ phase, code, status })).toBe(message);
    expect(message).not.toContain('field: Invalid input');
  });

  it('formats a stable resend countdown', () => {
    expect(formatResendCountdown(60)).toBe('Resend in 1:00');
    expect(formatResendCountdown(9)).toBe('Resend in 0:09');
    expect(formatResendCountdown(0)).toBe('Resend phone OTP');
  });

  it('copies a personal mobile only while Outlet contact consent is selected', () => {
    expect(resolveOutletContactPhone(true, '+60123456789', '+60312345678')).toBe('+60123456789');
    expect(resolveOutletContactPhone(false, '+60123456789', '+60312345678')).toBe('+60312345678');
  });

  it('builds and posts the exact guided claim payload without a private personal mobile', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { vendor_id: 'vendor-1' }, error: null }, { status: 201 }));
    const input = buildGuidedVendorClaimInput('invite-token-value', draft);

    expect(input).toEqual({ token: 'invite-token-value', ...draft });
    expect(JSON.stringify(input)).not.toContain('+60123456789');

    const response = await submitGuidedVendorClaim(fetcher, input);
    expect(response.status).toBe(201);
    expect(fetcher).toHaveBeenCalledWith('/api/vendor/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it.each([
    ['CATEGORY_NOT_ACTIVE', 'details'],
    ['INVITE_EMAIL_MISMATCH', 'account'],
    ['PHONE_VERIFICATION_REQUIRED', 'verify'],
    ['INVITE_EXPIRED', 'inactive'],
    ['CLAIM_FAILED', 'retry'],
  ] as const)('routes %s to %s while preserving the draft', (code, target) => {
    expect(mapClaimError({ code, status: 409 })).toMatchObject({ target, clearDraft: false });
  });

  it('routes a validation failure for category without exposing raw field errors', () => {
    const recovery = mapClaimError({ code: 'VALIDATION_FAILED', status: 422, fields: ['categoryId'] });

    expect(recovery).toEqual({
      target: 'details',
      message: 'Choose an available Vendor category and try again.',
      clearDraft: false,
    });
    expect(recovery.message).not.toContain('categoryId');
    expect(recovery.message).not.toContain('Invalid input');
  });

  it('reloads stale account and phone status for routed claim recovery', () => {
    expect(recoveryRequiresPreviewReload('account')).toBe(true);
    expect(recoveryRequiresPreviewReload('verify')).toBe(false);
    expect(recoveryRequiresPreviewReload('details')).toBe(false);
    expect(recoveryRequiresPreviewReload('retry')).toBe(false);
  });

  it('forces OTP after a claim phone-required response and clears only after verified success', () => {
    const initial = { forceUnverified: false };
    const forced = phoneVerificationRecoveryReducer(initial, { type: 'claim-phone-required' });

    expect(forced).toEqual({ forceUnverified: true });
    expect(resolvePhoneVerificationPhase(true, 'verified', forced.forceUnverified)).toBe('enter');
    expect(resolvePhoneVerificationPhase(true, 'enter', forced.forceUnverified)).toBe('enter');
    expect(resolvePhoneVerificationPhase(true, 'code', forced.forceUnverified)).toBe('code');
    expect(phoneVerificationRecoveryReducer(forced, { type: 'verification-succeeded' })).toEqual({ forceUnverified: false });
  });

  it('keeps recovery state free of personal mobile and OTP data', () => {
    const serialized = JSON.stringify(phoneVerificationRecoveryReducer(
      { forceUnverified: false },
      { type: 'claim-phone-required' },
    ));

    expect(serialized).toBe('{"forceUnverified":true}');
    expect(serialized).not.toContain('phone');
    expect(serialized).not.toContain('123456');
  });
});
