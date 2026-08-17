import type { VendorInviteDraft } from '@/components/vendor/vendor-invite-wizard-state';

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GuidedVendorClaimInput = {
  token: string;
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

export type ApiFailure = {
  code: string;
  status: number;
  fields?: string[];
};

export type ClaimErrorTarget = 'details' | 'account' | 'verify' | 'inactive' | 'retry';
export type PhoneVerificationPhase = 'enter' | 'code' | 'verified';
export type PhoneVerificationRecoveryState = { forceUnverified: boolean };
export type PhoneVerificationRecoveryAction =
  | { type: 'claim-phone-required' }
  | { type: 'verification-succeeded' };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function apiResult(response: Response) {
  const body = await response.json().catch(() => null) as {
    error?: { code?: string } | null;
  } | null;
  return {
    ok: response.ok,
    status: response.status,
    code: body?.error?.code ?? '',
  };
}

export async function requestPhoneOtp(fetcher: Fetcher, phone: string) {
  const response = await fetcher('/api/phone/send-otp', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ phone }),
  });
  return apiResult(response);
}

export async function verifyPhoneOtp(fetcher: Fetcher, phone: string, digits: string[]) {
  const response = await fetcher('/api/phone/verify-otp', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ phone, code: digits.join('') }),
  });
  return apiResult(response);
}

export function mapPhoneOtpError({ phase, code, status }: ApiFailure & { phase: 'send' | 'verify' }) {
  if (code === 'PHONE_ALREADY_CLAIMED') {
    return 'This mobile number is already linked to another MyWisata account. Use a different number.';
  }
  if (code === 'RATE_LIMITED' || status === 429) {
    return 'Too many codes requested. Try again in 1 hour.';
  }
  if (phase === 'verify' && (code === 'OTP_INVALID' || code === 'VALIDATION_FAILED' || status === 422)) {
    return 'That code is invalid or has expired. Request a new code and try again.';
  }
  if (phase === 'send' && (code === 'INVALID_PHONE' || code === 'VALIDATION_FAILED' || status === 422)) {
    return 'Enter a valid mobile number.';
  }
  if (status >= 500 || code === 'VERIFICATION_UNAVAILABLE' || code === 'TWILIO_ERROR' || code === 'DB_ERROR') {
    return 'Mobile verification is temporarily unavailable. Try again later.';
  }
  return phase === 'verify'
    ? 'We couldn’t verify that code. Request a new code and try again.'
    : 'We couldn’t send a code. Check the mobile number and try again.';
}

export function formatResendCountdown(seconds: number) {
  if (seconds <= 0) return 'Resend phone OTP';
  const minutes = Math.floor(seconds / 60);
  return `Resend in ${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function resolveOutletContactPhone(checked: boolean, personalMobile: string, previousContactPhone: string) {
  return checked ? personalMobile : previousContactPhone;
}

export function buildGuidedVendorClaimInput(token: string, draft: VendorInviteDraft): GuidedVendorClaimInput {
  return {
    token,
    businessName: draft.businessName,
    legalBusinessName: draft.legalBusinessName,
    description: draft.description,
    categoryId: draft.categoryId,
    outletName: draft.outletName,
    contactEmail: draft.contactEmail,
    contactPhone: draft.contactPhone,
    businessAddress: draft.businessAddress,
    latitude: draft.latitude,
    longitude: draft.longitude,
    authorizedToRepresent: draft.authorizedToRepresent,
  };
}

export function submitGuidedVendorClaim(fetcher: Fetcher, input: GuidedVendorClaimInput) {
  return fetcher('/api/vendor/claim', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export async function readApiFailure(response: Response): Promise<ApiFailure> {
  const body = await response.json().catch(() => null) as {
    error?: {
      code?: string;
      details?: { fieldErrors?: Record<string, unknown> };
    } | null;
  } | null;
  return {
    code: body?.error?.code ?? '',
    status: response.status,
    fields: Object.keys(body?.error?.details?.fieldErrors ?? {}),
  };
}

export function mapClaimError({ code, fields = [] }: ApiFailure): {
  target: ClaimErrorTarget;
  message: string;
  clearDraft: false;
} {
  if (code === 'CATEGORY_NOT_ACTIVE') {
    return { target: 'details', message: 'invite.errors.claim.details.categoryInactive', clearDraft: false };
  }
  if (code === 'VALIDATION_FAILED') {
    if (fields.includes('categoryId')) {
      return { target: 'details', message: 'invite.errors.claim.details.categoryInvalid', clearDraft: false };
    }
    if (fields.includes('authorizedToRepresent')) {
      return { target: 'verify', message: 'invite.errors.claim.verify.authorizationRequired', clearDraft: false };
    }
    if (fields.includes('contactEmail')) {
      return { target: 'details', message: 'invite.errors.claim.details.format', clearDraft: false };
    }
    return { target: 'details', message: 'invite.errors.claim.details.required', clearDraft: false };
  }
  if (code === 'INVITE_EMAIL_MISMATCH') {
    return { target: 'account', message: 'invite.errors.claim.account.emailMismatch', clearDraft: false };
  }
  if (code === 'UNAUTHORIZED') {
    return { target: 'account', message: 'invite.errors.claim.account.unauthorized', clearDraft: false };
  }
  if (code === 'PHONE_VERIFICATION_REQUIRED') {
    return { target: 'verify', message: 'invite.errors.claim.verify.required', clearDraft: false };
  }
  if (['INVITE_INVALID', 'INVITE_EXPIRED', 'INVITE_CANCELLED', 'INVITE_ALREADY_CLAIMED', 'RECOMMENDATION_NOT_CLAIMABLE'].includes(code)) {
    return { target: 'inactive', message: 'invite.errors.claim.inactive.invitation', clearDraft: false };
  }
  if (code === 'OWNER_ALREADY_HAS_VENDOR') {
    return { target: 'retry', message: 'invite.errors.claim.retry.ownerAlreadyHasVendor', clearDraft: false };
  }
  return { target: 'retry', message: 'invite.errors.claim.retry.generic', clearDraft: false };
}

export function recoveryRequiresPreviewReload(target: ClaimErrorTarget) {
  return target === 'account';
}

export function phoneVerificationRecoveryReducer(
  state: PhoneVerificationRecoveryState,
  action: PhoneVerificationRecoveryAction,
): PhoneVerificationRecoveryState {
  if (action.type === 'claim-phone-required') return { forceUnverified: true };
  if (action.type === 'verification-succeeded') return { forceUnverified: false };
  return state;
}

export function resolvePhoneVerificationPhase(
  previewVerified: boolean,
  localPhase: PhoneVerificationPhase,
  forceUnverified: boolean,
): PhoneVerificationPhase {
  if (forceUnverified) return localPhase === 'verified' ? 'enter' : localPhase;
  if (localPhase === 'verified' || previewVerified) return 'verified';
  return localPhase;
}
