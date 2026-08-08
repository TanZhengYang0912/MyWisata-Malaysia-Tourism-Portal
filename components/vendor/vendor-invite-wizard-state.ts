import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';

export const VENDOR_INVITE_SUPPORT_EMAIL = 'mywisatamalaysia@gmail.com';

export type VendorInviteStep = 'account' | 'details' | 'verify';

export type VendorInviteDraft = {
  businessName: string;
  legalBusinessName: string;
  description: string;
  categoryId: string;
  outletName: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
  latitude: number | null;
  longitude: number | null;
  authorizedToRepresent: boolean;
};

export type VendorInviteDraftField = keyof VendorInviteDraft;

export type VendorInviteDraftState = {
  draft: VendorInviteDraft;
  dirtyFields: VendorInviteDraftField[];
};

export type VendorInviteStoragePayload = {
  version: 2;
  tokenFingerprint: string;
  step: VendorInviteStep;
  draft: VendorInviteDraft;
  dirtyFields: VendorInviteDraftField[];
};

export function draftFromVendorInvitePreview(preview: VendorInvitePreview): VendorInviteDraft {
  return {
    businessName: preview.prefill.businessName,
    legalBusinessName: preview.prefill.legalBusinessName,
    description: preview.prefill.description,
    categoryId: preview.prefill.categoryId,
    outletName: preview.prefill.outletName,
    contactEmail: preview.prefill.contactEmail ?? '',
    contactPhone: preview.prefill.contactPhone ?? '',
    businessAddress: preview.prefill.businessAddress,
    latitude: preview.prefill.latitude,
    longitude: preview.prefill.longitude,
    authorizedToRepresent: false,
  };
}

export function createVendorInviteStoragePayload(
  tokenFingerprint: string,
  step: VendorInviteStep,
  draft: VendorInviteDraft,
  dirtyFields: VendorInviteDraftField[],
): VendorInviteStoragePayload {
  return { version: 2, tokenFingerprint, step, draft, dirtyFields };
}

export function restoreVendorInviteStoragePayload(raw: string | null, tokenFingerprint: string): VendorInviteStoragePayload | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<VendorInviteStoragePayload>;
    if (value.version !== 2
      || value.tokenFingerprint !== tokenFingerprint
      || !value.draft
      || !Array.isArray(value.dirtyFields)
      || (value.step !== 'account' && value.step !== 'details' && value.step !== 'verify')) return null;
    return value as VendorInviteStoragePayload;
  } catch {
    return null;
  }
}

export function sanitizeVendorInviteDraftForAccount(
  draft: VendorInviteDraft,
  dirtyFields: VendorInviteDraftField[],
  emailMatched: boolean,
) {
  if (emailMatched) return { draft, dirtyFields };
  return {
    draft: { ...draft, contactEmail: '', contactPhone: '' },
    dirtyFields: dirtyFields.filter((field) => field !== 'contactEmail' && field !== 'contactPhone'),
  };
}

export function mergeUntouchedVendorInviteDraft(
  draft: VendorInviteDraft,
  prefill: VendorInviteDraft,
  dirtyFields: VendorInviteDraftField[],
): VendorInviteDraft {
  const next = { ...draft };
  (Object.keys(prefill) as VendorInviteDraftField[]).forEach((field) => {
    if (!dirtyFields.includes(field)) Object.assign(next, { [field]: prefill[field] });
  });
  return next;
}

export function reconcileVendorInvitePrefill(
  current: VendorInviteDraftState,
  prefill: VendorInviteDraft,
  emailMatched: boolean,
): VendorInviteDraftState {
  const draft = mergeUntouchedVendorInviteDraft(current.draft, prefill, current.dirtyFields);
  return sanitizeVendorInviteDraftForAccount(draft, current.dirtyFields, emailMatched);
}

export function buildGoogleInvitationCallbackUrl(origin: string, token: string) {
  const next = `/vendor-invite?recommendation=${encodeURIComponent(token)}`;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function buildVendorInviteSupportMailto(subject: string) {
  return `mailto:${VENDOR_INVITE_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
