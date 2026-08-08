import { describe, expect, it } from 'vitest';
import {
  buildGoogleInvitationCallbackUrl,
  buildVendorInviteSupportMailto,
  createVendorInviteStoragePayload,
  mergeUntouchedVendorInviteDraft,
  reconcileVendorInvitePrefill,
  restoreVendorInviteStoragePayload,
  sanitizeVendorInviteDraftForAccount,
  type VendorInviteDraft,
} from '@/components/vendor/vendor-invite-wizard-state';

const draft: VendorInviteDraft = {
  businessName: 'Testing123',
  legalBusinessName: 'Testing123 Sdn Bhd',
  description: 'A test business',
  categoryId: 'activity-id',
  outletName: 'Testing123 — Bukit Damansara',
  contactEmail: 'owner@example.com',
  contactPhone: '+60123456789',
  businessAddress: 'Damansara, Kuala Lumpur',
  latitude: 3.15,
  longitude: 101.62,
  authorizedToRepresent: false,
};

describe('vendor invite wizard state', () => {
  it('persists only the v2 draft envelope without raw invitation, OTP, or auth tokens', () => {
    const payload = createVendorInviteStoragePayload('hashed-token', 'details', draft, ['businessName']);

    expect(payload).toEqual({ version: 2, tokenFingerprint: 'hashed-token', step: 'details', draft, dirtyFields: ['businessName'] });
    expect(JSON.stringify(payload)).not.toContain('test-token-value');
    expect(JSON.stringify(payload)).not.toContain('"code":"123456"');
    expect(JSON.stringify(payload)).not.toContain('access_token');
    expect(JSON.stringify(payload)).not.toContain('refresh_token');
  });

  it('redacts restored private contacts and contact dirty fields when the account no longer matches', () => {
    const restored = restoreVendorInviteStoragePayload(JSON.stringify(
      createVendorInviteStoragePayload('hashed-token', 'details', draft, ['contactEmail', 'contactPhone', 'businessName']),
    ), 'hashed-token');

    expect(restored).not.toBeNull();
    const matchingState = sanitizeVendorInviteDraftForAccount(restored!.draft, restored!.dirtyFields, true);
    expect(matchingState.draft.contactEmail).toBe('owner@example.com');
    expect(sanitizeVendorInviteDraftForAccount(matchingState.draft, matchingState.dirtyFields, false)).toEqual({
      draft: { ...draft, contactEmail: '', contactPhone: '' },
      dirtyFields: ['businessName'],
    });
  });

  it('keeps dirty fields while merging newly unlocked untouched contact prefill', () => {
    const merged = mergeUntouchedVendorInviteDraft(
      { ...draft, businessName: 'My edited brand', contactEmail: '', contactPhone: '' },
      { ...draft, contactEmail: 'verified@example.com', contactPhone: '+60119999999' },
      ['businessName'],
    );

    expect(merged.businessName).toBe('My edited brand');
    expect(merged.contactEmail).toBe('verified@example.com');
    expect(merged.contactPhone).toBe('+60119999999');
  });

  it('reconciles the wizard merge-prefill transition across a mismatched then matching account', () => {
    const mismatched = reconcileVendorInvitePrefill(
      {
        draft: { ...draft, businessName: 'My edited brand' },
        dirtyFields: ['businessName', 'contactEmail', 'contactPhone'],
      },
      { ...draft, contactEmail: '', contactPhone: '' },
      false,
    );

    expect(mismatched.draft).toMatchObject({ businessName: 'My edited brand', contactEmail: '', contactPhone: '' });
    expect(mismatched.dirtyFields).toEqual(['businessName']);

    const matching = reconcileVendorInvitePrefill(
      mismatched,
      { ...draft, contactEmail: 'verified@example.com', contactPhone: '+60119999999' },
      true,
    );

    expect(matching.draft).toMatchObject({
      businessName: 'My edited brand',
      contactEmail: 'verified@example.com',
      contactPhone: '+60119999999',
    });
    expect(matching.dirtyFields).toEqual(['businessName']);
  });

  it('builds the exact safe Google callback and distinct public support mailto links', () => {
    expect(buildGoogleInvitationCallbackUrl('https://mywisata.example', 'test-token-value')).toBe(
      'https://mywisata.example/auth/callback?next=%2Fvendor-invite%3Frecommendation%3Dtest-token-value',
    );
    expect(buildVendorInviteSupportMailto('Request a new vendor invitation')).toBe(
      'mailto:mywisatamalaysia@gmail.com?subject=Request%20a%20new%20vendor%20invitation',
    );
    expect(buildVendorInviteSupportMailto('Vendor invitation support')).toBe(
      'mailto:mywisatamalaysia@gmail.com?subject=Vendor%20invitation%20support',
    );
  });
});
