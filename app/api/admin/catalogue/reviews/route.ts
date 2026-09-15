import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { contentReviewSchema } from '@/lib/validation/vendor-schemas';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { auditAndNotify } from '@/lib/audit';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';
import { getSuperAdminReviewUpdate } from '@/lib/vendor/voucher-review';

function relation(value: unknown) { return Array.isArray(value) ? value[0] : value; }

async function requireAdmin() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: apiFail('UNAUTHORIZED', 'Sign in required', 401) } as const;
  const { data: roles, error } = await db.from('user_roles').select('roles(name)').eq('user_id', user.id);
  if (error) return { error: apiFail('DB_ERROR', error.message, 500) } as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const names = (roles ?? []).map((row: any) => relation(row.roles)?.name);
  if (!names.includes('super_admin')) {
    return { error: apiFail('FORBIDDEN', 'Administrator access required', 403) } as const;
  }
  return { db: createServiceClient(), user } as const;
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { db } = auth;
  const [outlets, products, vouchers] = await Promise.all([
    db.from('outlets').select('id,display_id,name,city,state,review_status,review_note,created_at,vendor_id,vendors(name)').eq('review_status', 'pending_review').order('created_at', { ascending: false }),
    db.from('products').select('id,display_id,name,product_type,base_price,review_status,review_note,created_at,vendor_id,vendors(name),outlets(name,city)').eq('review_status', 'pending_review').order('created_at', { ascending: false }),
    db.from('vouchers').select('id,code,name,discount_value,voucher_type,review_status,review_note,vendor_review_status,created_at,vendor_id,vendors(name),outlets(name,city)').eq('review_status', 'pending_review').order('created_at', { ascending: false }),
  ]);
  const failed = [outlets, products, vouchers].find((result) => result.error);
  if (failed?.error) return apiFail('DB_ERROR', failed.error.message, 500);
  return apiOk({
    items: [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(outlets.data ?? []).map((item: any) => ({ ...item, entityType: 'outlet', entityLabel: item.name, context: [item.city, item.state].filter(Boolean).join(', ') })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(products.data ?? []).map((item: any) => ({ ...item, entityType: 'product', entityLabel: item.name, context: item.outlets?.city || item.outlets?.name || item.product_type })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(vouchers.data ?? []).filter((item: any) => item.vendor_review_status === 'approved').map((item: any) => ({ ...item, entityType: 'voucher', entityLabel: `${item.code} · ${item.name}`, context: item.outlets?.city || 'All outlets' })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { db, user } = auth;
  const parsed = await parseBody(request, contentReviewSchema);
  if (!parsed.ok) return parsed.response;
  const { entityType, entityId, action, note } = parsed.data;
  const table = entityType === 'outlet' ? 'outlets' : entityType === 'product' ? 'products' : 'vouchers';
  const { data: entity, error: entityError } = await db.from(table).select('*').eq('id', entityId).single();
  if (entityError || !entity) return apiFail('NOT_FOUND', 'Review item not found', 404);
  if (entity.review_status !== 'pending_review') return apiFail('INVALID_STATE', 'This item is no longer waiting for review', 409);
  if (entityType === 'voucher' && entity.vendor_review_status !== 'approved') return apiFail('INVALID_STATE', 'This voucher must be approved by the Vendor Owner first', 409);

  const reviewStatus = action === 'approve' ? 'approved' : action;
  const update = entityType === 'voucher'
    ? { ...getSuperAdminReviewUpdate({ action, reviewerId: user.id, note }), reviewed_at: new Date().toISOString() }
    : { review_status: reviewStatus, review_note: note ?? null, reviewed_by: user.id, reviewed_at: new Date().toISOString(), status: action === 'approve' ? 'active' : 'inactive' };
  const { data: updated, error: updateError } = await db.from(table).update(update).eq('id', entityId).select().single();
  if (updateError) return apiFail('DB_ERROR', updateError.message, 500);

  await db.from('content_reviews').insert({ entity_type: entityType, entity_id: entityId, vendor_id: entity.vendor_id, reviewer_id: user.id, action, note: note ?? null });
  await auditAndNotify({ action: `content.${action}`, entityType, entityId, beforeData: { review_status: entity.review_status }, afterData: { review_status: reviewStatus }, note });
  if (entity.vendor_id) {
    void emitVendorNotification({
      eventKey: `listing:review:${entityType}:${entityId}:${action}`,
      vendorId: entity.vendor_id,
      audience: 'owner',
      category: 'vendor_products',
      type: `vendor_listing_${action}`,
      title: `Listing ${action === 'approve' ? 'approved' : 'rejected'}`,
      body: note ? `Your ${entityType} review was ${action}ed: ${note}` : `Your ${entityType} review was ${action}ed.`,
      link: '/vendor/products',
      email: true,
      reference: entityId,
      metadata: { entityType, status: reviewStatus },
      serviceDb: db,
    }).catch((notificationError) => console.error('[vendor-notifications] listing review event failed', notificationError));
  }
  return apiOk(updated);
}
