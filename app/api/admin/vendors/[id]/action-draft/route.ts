// P4 — Member 4: AI-drafted reason text for reject / suspend /
// request_information. POST /api/admin/vendors/[id]/action-draft, body
// { action: 'reject' | 'suspend' | 'request_information' }. Returns a draft
// { reason } for the admin's reason modal to prefill; never saves anything
// or actions the vendor itself (see lib/vendors/action-draft.ts's header).
// Gated the same as the actions it feeds (approve/suspend routes).

import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { draftVendorActionReason } from '@/lib/vendors/action-draft';

const schema = z.object({ action: z.enum(['reject', 'suspend', 'request_information']) }).strict();

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: vendorId } = await params;
  const { response } = await requireStaffPermission('admin.vendor.manage');
  if (response) return response;

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data: vendor, error } = await service
    .from('vendors')
    .select('id, name, description, business_type, users!vendors_owner_id_fkey(full_name), vendor_onboarding_profiles(contact_name)')
    .eq('id', vendorId)
    .maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);

  const owner = Array.isArray(vendor.users) ? vendor.users[0] : vendor.users;
  const onboarding = Array.isArray(vendor.vendor_onboarding_profiles) ? vendor.vendor_onboarding_profiles[0] : vendor.vendor_onboarding_profiles;

  const reason = await draftVendorActionReason(parsed.data.action, {
    vendorName: vendor.name,
    businessType: vendor.business_type,
    description: vendor.description,
    contactName: onboarding?.contact_name ?? owner?.full_name ?? null,
  });
  if (!reason) return apiFail('DRAFT_UNAVAILABLE', 'Could not draft a reason right now — try again, or write one manually.', 502);

  return apiOk({ reason });
}
