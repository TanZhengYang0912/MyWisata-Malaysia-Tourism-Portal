import type { SupabaseClient } from '@supabase/supabase-js';
import { hashRecommendationInviteToken } from '@/lib/recommendations/invite-token';

export type VendorInviteErrorCode =
  | 'INVITE_INVALID'
  | 'INVITE_EXPIRED'
  | 'INVITE_CANCELLED'
  | 'INVITE_ALREADY_CLAIMED';

export type VendorInviteResolution =
  | { ok: true; invite: { recommendationId: string; email: string } }
  | { ok: false; error: { code: VendorInviteErrorCode; message: string; status: number } };

type VendorInviteRow = {
  recommendation_id: unknown;
  email: unknown;
  status: unknown;
  expires_at: unknown;
};

function fail(code: VendorInviteErrorCode, message: string, status: number): VendorInviteResolution {
  return { ok: false, error: { code, message, status } };
}

export async function resolveActiveVendorInvite(
  service: SupabaseClient,
  token: string,
): Promise<VendorInviteResolution> {
  const { data, error } = await service
    .from('vendor_recommendation_invites')
    .select('recommendation_id,email,status,expires_at')
    .eq('token_hash', hashRecommendationInviteToken(token))
    .maybeSingle();
  const invite = data as VendorInviteRow | null;
  const expiresAt = typeof invite?.expires_at === 'string' ? new Date(invite.expires_at).getTime() : NaN;

  if (
    error
    || !invite
    || typeof invite.recommendation_id !== 'string'
    || !invite.recommendation_id.trim()
    || typeof invite.email !== 'string'
    || !invite.email.trim()
    || typeof invite.status !== 'string'
    || !invite.status.trim()
    || !Number.isFinite(expiresAt)
  ) {
    return fail('INVITE_INVALID', 'This invitation link is invalid.', 404);
  }
  if (invite.status === 'cancelled') {
    return fail('INVITE_CANCELLED', 'This vendor invitation was cancelled.', 409);
  }
  if (invite.status !== 'invited') {
    return fail('INVITE_ALREADY_CLAIMED', 'This vendor invitation has already been claimed.', 409);
  }
  if (expiresAt <= Date.now()) {
    return fail('INVITE_EXPIRED', 'This vendor invitation has expired.', 409);
  }

  return {
    ok: true,
    invite: {
      recommendationId: invite.recommendation_id,
      email: invite.email.trim().toLowerCase(),
    },
  };
}
