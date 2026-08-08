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
  if (phase === 'verify' && (code === 'TWILIO_ERROR' || code === 'VALIDATION_FAILED' || status === 422)) {
    return 'That code is invalid or has expired. Request a new code and try again.';
  }
  if (phase === 'send' && (code === 'INVALID_PHONE' || code === 'VALIDATION_FAILED' || status === 422)) {
    return 'Enter a valid mobile number.';
  }
  if (status >= 500 || code === 'TWILIO_ERROR' || code === 'DB_ERROR') {
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
    return { target: 'details', message: 'That category is no longer available. Choose another category.', clearDraft: false };
  }
  if (code === 'VALIDATION_FAILED' && fields.includes('categoryId')) {
    return { target: 'details', message: 'Choose an available Vendor category and try again.', clearDraft: false };
  }
  if (code === 'INVITE_EMAIL_MISMATCH' || code === 'UNAUTHORIZED') {
    return { target: 'account', message: 'Sign in with the email address that received this invitation.', clearDraft: false };
  }
  if (code === 'PHONE_VERIFICATION_REQUIRED') {
    return { target: 'verify', message: 'Verify your personal mobile before submitting the application.', clearDraft: false };
  }
  if (['INVITE_INVALID', 'INVITE_EXPIRED', 'INVITE_CANCELLED', 'INVITE_ALREADY_CLAIMED', 'RECOMMENDATION_NOT_CLAIMABLE'].includes(code)) {
    return { target: 'inactive', message: 'This vendor invitation is no longer active.', clearDraft: false };
  }
  return { target: 'retry', message: 'We couldn’t submit the application. Your progress is saved; please try again.', clearDraft: false };
}

export function recoveryRequiresPreviewReload(target: ClaimErrorTarget) {
  return target === 'account' || target === 'verify';
}
