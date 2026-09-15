import { z } from 'zod';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { canVendorOwnerReviewVoucher, getVendorReviewUpdate } from '@/lib/vendor/voucher-review';
import { auditAndNotify } from '@/lib/audit';

interface Props { params: Promise<{ vendorId: string; voucherId: string }> }

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
}).strict();

export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, voucherId } = await params;
  const access = await authorizeVendor(vendorId, ['vendor_owner']);
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, reviewSchema);
  if (!parsed.ok) return parsed.response;
  const db = access.access.serviceDb;
  const [{ data: vendor, error: vendorError }, { data: voucher, error: voucherError }] = await Promise.all([
    db.from('vendors').select('owner_id').eq('id', vendorId).maybeSingle(),
    db.from('vouchers').select('id,review_status,created_by,vendor_review_status').eq('id', voucherId).eq('vendor_id', vendorId).maybeSingle(),
  ]);
  if (vendorError || voucherError) return apiFail('DB_ERROR', (vendorError ?? voucherError)?.message ?? 'Could not load voucher review.', 500);
  if (!vendor || !voucher) return apiFail('NOT_FOUND', 'Voucher not found.', 404);
  if (!canVendorOwnerReviewVoucher({ actorId: access.access.userId, vendorOwnerId: vendor.owner_id, reviewStatus: voucher.review_status, vendorReviewStatus: voucher.vendor_review_status, createdBy: voucher.created_by })) {
    return apiFail('FORBIDDEN', 'Only the HQ owner can review a pending outlet voucher.', 403);
  }

  const update = { ...getVendorReviewUpdate({ action: parsed.data.action, reviewerId: access.access.userId, note: parsed.data.note }), vendor_reviewed_at: new Date().toISOString() };
  const { data, error } = await db.from('vouchers').update(update).eq('id', voucherId).eq('vendor_id', vendorId).select('*').single();
  if (error) return apiFail('DB_ERROR', error.message, 400);
  await db.from('content_reviews').insert({ entity_type: 'voucher', entity_id: voucherId, vendor_id: vendorId, reviewer_id: access.access.userId, action: parsed.data.action, note: update.vendor_review_note });
  await auditAndNotify({ action: `voucher.vendor.${parsed.data.action}`, entityType: 'voucher', entityId: voucherId, beforeData: { vendor_review_status: voucher.vendor_review_status }, afterData: update, note: update.vendor_review_note ?? undefined });
  return apiOk(data);
}
