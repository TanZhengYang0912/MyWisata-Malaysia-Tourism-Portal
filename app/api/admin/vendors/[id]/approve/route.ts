// P2 — Member 2 owns B1: Admin approve/reject vendor
// Uses auditAndNotify() (Gate 5) for every state change

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { auditAndNotify } from '@/lib/audit';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { vendorApproveSchema } from '@/lib/validation/vendor-schemas';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: vendorId } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // Role check — only super_admin or approver
  const { data: roles } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id);

  const roleNames = (roles ?? []).map((r: any) => (r.roles as Record<string, any>)?.name as string);
  if (!roleNames.includes('super_admin') && !roleNames.includes('approver')) {
    return apiFail('FORBIDDEN', 'Only admin or approver can review vendors', 403);
  }

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

  if (action === 'request_information') {
    const service = createServiceClient();
    const { error: profileError } = await service.from('vendor_onboarding_profiles').upsert({
      vendor_id: vendorId,
      status: 'needs_information',
      review_note: reason ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vendor_id' });
    if (profileError) return apiFail('DB_ERROR', profileError.message, 500);
    await auditAndNotify({
      action: 'vendor.information_requested', entityType: 'vendor', entityId: vendorId,
      beforeData: { onboarding_status: 'submitted' }, afterData: { onboarding_status: 'needs_information' }, note: reason,
    }, [{ userId: vendor.owner_id, type: 'vendor_information_requested', title: `More information is needed for "${vendor.name}"`, body: reason ?? 'Please update your vendor application.', link: '/vendor/dashboard' }]);
    return apiOk({ id: vendorId, status: vendor.status, onboardingStatus: 'needs_information' });
  }

  if (action === 'approve') {
    // Update vendor status
    const { error: updateErr } = await supabase
      .from('vendors')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', vendorId);

    if (updateErr) return apiFail('DB_ERROR', updateErr.message, 500);

    const { error: onboardingError } = await supabase.from('vendor_onboarding_profiles').upsert({
      vendor_id: vendorId,
      status: 'approved',
      review_note: null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vendor_id' });
    if (onboardingError) return apiFail('DB_ERROR', onboardingError.message, 500);

    // Auto-create vendor_owner role for the vendor's owner
    const { data: ownerRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'vendor_owner')
      .single();

    if (ownerRole) {
      await supabase.from('user_roles').upsert({
        user_id: vendor.owner_id,
        role_id: ownerRole.id,
        vendor_id: vendorId,
      }, { onConflict: 'user_id,role_id,vendor_id,outlet_id' });
    }

    // Audit + notify vendor owner
    await auditAndNotify(
      {
        action: 'vendor.approved',
        entityType: 'vendor',
        entityId: vendorId,
        beforeData: { status: 'pending' },
        afterData: { status: 'approved' },
      },
      [{
        userId: vendor.owner_id,
        type: 'vendor_approved',
        title: `Your vendor "${vendor.name}" has been approved!`,
        body: 'You can now manage your outlets and products.',
        link: '/vendor/dashboard',
      }],
    );
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

    return apiOk({ id: vendorId, status: 'approved' });
  } else {
    // Reject
    const { error: updateErr } = await supabase
      .from('vendors')
      .update({
        status: 'rejected',
        rejection_reason: reason ?? null,
      })
      .eq('id', vendorId);

    if (updateErr) return apiFail('DB_ERROR', updateErr.message, 500);

    const { error: onboardingError } = await supabase.from('vendor_onboarding_profiles').upsert({
      vendor_id: vendorId,
      status: 'rejected',
      review_note: reason ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vendor_id' });
    if (onboardingError) return apiFail('DB_ERROR', onboardingError.message, 500);

    await auditAndNotify(
      {
        action: 'vendor.rejected',
        entityType: 'vendor',
        entityId: vendorId,
        beforeData: { status: 'pending' },
        afterData: { status: 'rejected', rejection_reason: reason },
        note: reason,
      },
      [{
        userId: vendor.owner_id,
        type: 'vendor_rejected',
        title: `Your vendor "${vendor.name}" was rejected`,
        body: reason ?? 'No reason provided.',
        link: '/vendor/dashboard',
      }],
    );
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
