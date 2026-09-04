// P4 — Member 4: editable commission tiers (CLAUDE-PHASE2.md Feature B)
// PATCH /api/admin/affiliate/tiers/[id] — body { ratePercent?, minReferrals? }
// Gated on super_admin, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { updateTierSchema } from '@/lib/validation/affiliate-schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can edit commission tiers', 403);
  }

  const parsed = await parseBody(request, updateTierSchema);
  if (!parsed.ok) return parsed.response;
  const { ratePercent, minReferrals } = parsed.data;

  const updates: { ongoing_rate?: number; min_conversions?: number } = {};
  if (ratePercent !== undefined) updates.ongoing_rate = ratePercent / 100;
  if (minReferrals !== undefined) updates.min_conversions = minReferrals;

  // Note: this updates commission_rules directly, not through
  // lib/affiliate/tier.ts — that file only reads. Historical attributions
  // already have their resolved rate frozen onto commission_rate at
  // attribution time (see attribution.ts), so changing a tier here never
  // rewrites past commissions — only what future ones resolve to.
  const service = createServiceClient();
  const { data, error } = await service
    .from('commission_rules')
    .update(updates)
    .eq('id', id)
    .eq('rule_type', 'affiliate')
    .select('id, tier_name, ongoing_rate, min_conversions')
    .maybeSingle();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!data) return apiFail('NOT_FOUND', 'Tier not found', 404);

  return apiOk({
    id: data.id,
    tierName: data.tier_name,
    rate: Number(data.ongoing_rate),
    minReferrals: data.min_conversions,
  });
}
