import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { bioSchema } from '@/lib/validation/profile-schemas';
import { moderateBio } from '@/lib/moderation';

const VIOLATION_COOLDOWN_DAYS   = 7;
const VIOLATION_PERMANENT_LIMIT = 5;
const VIOLATION_COOLDOWN_LIMIT  = 3;

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, bioSchema);
  if (!parsed.ok) return parsed.response;
  const { bio } = parsed.data;

  // Fetch current violation state
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('bio_violation_count, bio_cooldown_until')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) return apiFail('NOT_FOUND', 'Profile not found', 404);

  const violations = profile.bio_violation_count ?? 0;
  const cooldownUntil = profile.bio_cooldown_until ? new Date(profile.bio_cooldown_until) : null;

  // Permanent flag check
  if (violations >= VIOLATION_PERMANENT_LIMIT) {
    return apiFail(
      'PERMANENTLY_FLAGGED',
      'Your account requires admin review before updating your bio. Contact support.',
      403,
    );
  }

  // Cooldown check
  if (cooldownUntil && cooldownUntil > new Date()) {
    const resetsAt = cooldownUntil.toISOString();
    return apiFail('BIO_COOLDOWN', `Bio submissions are locked until ${resetsAt}`, 429, { resetsAt });
  }

  // Moderation (fail-closed: unavailable = block)
  const modResult = await moderateBio(bio);
  if ('error' in modResult) {
    return apiFail('MODERATION_UNAVAILABLE', 'Bio review service is temporarily unavailable — try again shortly', 503);
  }

  if (modResult.flagged) {
    // Increment violation count and apply escalation
    const newCount = violations + 1;
    const updates: Record<string, unknown> = {
      bio_violation_count: newCount,
      updated_at: new Date().toISOString(),
    };
    if (newCount >= VIOLATION_COOLDOWN_LIMIT && newCount < VIOLATION_PERMANENT_LIMIT) {
      updates.bio_cooldown_until = new Date(
        Date.now() + VIOLATION_COOLDOWN_DAYS * 86_400_000,
      ).toISOString();
    }

    await supabase.from('users').update(updates).eq('id', user.id);

    return apiFail(
      'BIO_CONTENT_REJECTED',
      'Your bio contains content that violates community guidelines',
      422,
      { categories: modResult.categories, violationCount: newCount },
    );
  }

  // Write bio (reset cooldown if it expired naturally)
  const { error } = await supabase
    .from('users')
    .update({
      bio,
      bio_cooldown_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return apiFail('DB_ERROR', error.message, 500);

  // Attempt tier promotion (non-fatal)
  await supabase.rpc('promote_to_profile_complete', { p_user_id: user.id });

  const { data: updated } = await supabase.from('users').select('tier').eq('id', user.id).single();

  return apiOk({ updated: true, tier: updated?.tier ?? null });
}
