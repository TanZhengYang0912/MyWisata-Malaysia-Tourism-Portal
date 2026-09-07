// P4 — Member 4: AI-drafted vendor recommendation invite emails.
// POST /api/admin/vendors/recommendation-invite/draft — body
// { recommendationId }. Returns a draft { subject, body } for the admin's
// "Invite Vendor" modal to prefill; never saves anything or sends any
// email itself (see lib/recommendations/invite-draft.ts's header). Gated
// on the recommendation-review capability, same as the Send route.

import { z } from 'zod';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { draftVendorInviteEmail } from '@/lib/recommendations/invite-draft';

const schema = z.object({ recommendationId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  const { response } = await requireStaffPermission('admin.vendor.manage');
  if (response) return response;

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data: recommendation, error } = await service
    .from('vendor_recommendations')
    .select('id, vendor_name, description, vendor_address, status, categories(name)')
    .eq('id', parsed.data.recommendationId)
    .maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!recommendation) return apiFail('NOT_FOUND', 'Recommendation not found', 404);
  if (!['approved', 'invited'].includes(recommendation.status)) {
    return apiFail('RECOMMENDATION_NOT_READY', 'Only approved recommendations can be drafted for invite', 409);
  }

  const draft = await draftVendorInviteEmail({
    vendorName: recommendation.vendor_name,
    description: recommendation.description,
    vendorAddress: recommendation.vendor_address,
    category: recommendation.categories?.[0]?.name ?? null,
  });
  if (!draft) return apiFail('DRAFT_UNAVAILABLE', 'Could not draft an invite email right now — try again, or write one manually.', 502);

  return apiOk(draft);
}
