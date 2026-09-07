// P2 — Member 2 owns B1: Admin approve/reject vendor
// The secured database RPC records the state-change audit transactionally.

import { createServiceClient } from '@/lib/supabase/service';
import { sendNotification } from '@/lib/audit';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { vendorApproveSchema } from '@/lib/validation/vendor-schemas';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: vendorId } = await params;
  const { db: supabase, user, response } = await requireStaffPermission('admin.vendor.manage');
  if (response) return response;
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Parse body
  const parsed = await parseBody(request, vendorApproveSchema);
  if (!parsed.ok) return parsed.response;
  const { action, reason } = parsed.data;

  // Fetch current vendor
  const { data: vendor, error: fetchErr } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', vendorId)
    .single();

  if (fetchErr || !vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);
  if (!['pending', 'rejected'].includes(vendor.status) && action !== 'request_information') {
    return apiFail('INVALID_STATE', `Vendor is already ${vendor.status}`, 400);
  }

  const { data: reviewData, error: reviewError } = await supabase.rpc('staff_review_vendor', {
    p_vendor_id: vendorId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (reviewError) {
    const message = reviewError.message ?? '';
    if (message.includes('vendor_permission_required') || message.includes('admin_required')) return apiFail('FORBIDDEN', 'Vendor management permission required', 403);
    if (message.includes('vendor_not_found')) return apiFail('NOT_FOUND', 'Vendor not found', 404);
    if (message.includes('vendor_not_approvable') || message.includes('vendor_invalid_state')) return apiFail('INVALID_STATE', 'Vendor is not in a valid state for this action', 409);
    if (message.includes('self_dealing')) return apiFail('FORBIDDEN', 'You cannot approve a vendor from your own recommendation', 403);
    if (message.includes('recommendation_not_ready_for_conversion') || message.includes('claim_link_not_found')) return apiFail('INVALID_RECOMMENDATION_STATE', 'The claimed recommendation is not ready for conversion', 409);
    if (message.includes('vendor_review_action_invalid')) return apiFail('VALIDATION_FAILED', 'Vendor review action is invalid', 422);
    console.error('[vendor-approval] governed review failed:', reviewError);
    return apiFail('RPC_ERROR', 'Vendor review could not be completed', 500);
  }

  const review = reviewData as {
    vendor_id: string;
    status: string;
    onboarding_status?: string;
    converted?: boolean;
    recommendation_id?: string | null;
    conversion_id?: string | null;
  } | null;
  if (!review) return apiFail('RPC_ERROR', 'Vendor review returned no result', 500);

  if (action === 'request_information') {
    await sendNotification({ userId: vendor.owner_id, type: 'vendor_information_requested', title: `More information is needed for "${vendor.name}"`, body: reason ?? 'Please update your vendor application.', link: '/vendor/dashboard' });
    return apiOk({ id: vendorId, status: vendor.status, onboardingStatus: 'needs_information' });
  }

  if (action === 'approve') {
    await sendNotification({
      userId: vendor.owner_id,
      type: 'vendor_approved',
      title: `Your vendor "${vendor.name}" has been approved!`,
      body: 'You can now manage your outlets and products.',
      link: '/vendor/dashboard',
    });
    void emitVendorNotification({
      eventKey: `vendor:approved:${vendorId}`,
      vendorId,
      audience: 'owner',
      category: 'vendor_account',
      type: 'vendor_approved',
      title: `Vendor "${vendor.name}" approved`,
      body: 'Your vendor account is approved and ready to manage.',
      link: '/vendor/dashboard',
      email: true,
      reference: vendorId,
      metadata: { status: 'approved' },
      serviceDb: createServiceClient(),
    }).catch((notificationError) => console.error('[vendor-notifications] approval event failed', notificationError));

    return apiOk({
      id: vendorId,
      status: 'approved',
      converted: review.converted ?? false,
      recommendationId: review.recommendation_id ?? null,
      conversionId: review.conversion_id ?? null,
    });
  } else {
    await sendNotification({
      userId: vendor.owner_id,
      type: 'vendor_rejected',
      title: `Your vendor "${vendor.name}" was rejected`,
      body: reason ?? 'No reason provided.',
      link: '/vendor/dashboard',
    });
    void emitVendorNotification({
      eventKey: `vendor:rejected:${vendorId}`,
      vendorId,
      audience: 'owner',
      category: 'vendor_account',
      type: 'vendor_rejected',
      title: `Vendor "${vendor.name}" rejected`,
      body: reason ?? 'Your vendor application was rejected.',
      link: '/vendor/dashboard',
      email: true,
      reference: vendorId,
      metadata: { status: 'rejected' },
      serviceDb: createServiceClient(),
    }).catch((notificationError) => console.error('[vendor-notifications] rejection event failed', notificationError));

    return apiOk({ id: vendorId, status: 'rejected' });
  }
}
