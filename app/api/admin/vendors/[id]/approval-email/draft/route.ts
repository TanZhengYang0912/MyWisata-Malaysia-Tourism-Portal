// P4 — Member 4: AI-drafted vendor approval (welcome) email.
// POST /api/admin/vendors/[id]/approval-email/draft — no body (vendor id
// comes from the URL). Returns a draft { subject, body } for the admin's
// "Send approval email" modal to prefill; never saves anything or sends
// any email itself (see lib/vendors/approval-draft.ts's header). Gated on
// super_admin, same as the Send route this feeds into.

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { draftVendorApprovalEmail } from '@/lib/vendors/approval-draft';

const schema = z.object({}).strict();

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: vendorId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can draft an approval email', 403);
  }

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data: vendor, error } = await service
    .from('vendors')
    .select('id, name, status, description, business_type, users!vendors_owner_id_fkey(full_name, email), vendor_onboarding_profiles(contact_name, contact_email, business_address)')
    .eq('id', vendorId)
    .maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);
  if (vendor.status !== 'approved') {
    return apiFail('VENDOR_NOT_APPROVED', 'Only approved vendors can be drafted an approval email', 409);
  }

  const owner = Array.isArray(vendor.users) ? vendor.users[0] : vendor.users;
  const onboarding = Array.isArray(vendor.vendor_onboarding_profiles)
    ? vendor.vendor_onboarding_profiles[0]
    : vendor.vendor_onboarding_profiles;

  const draft = await draftVendorApprovalEmail({
    vendorName: vendor.name,
    businessType: vendor.business_type,
    description: vendor.description,
    contactName: onboarding?.contact_name ?? owner?.full_name ?? null,
    address: onboarding?.business_address ?? null,
  });
  if (!draft) return apiFail('DRAFT_UNAVAILABLE', 'Could not draft an approval email right now — try again, or write one manually.', 502);

  return apiOk(draft);
}
