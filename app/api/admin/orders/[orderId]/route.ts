import { z } from 'zod';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, databaseUuidSchema } from '@/lib/validation/schemas';
import { readAdminOrderDetail } from '@/lib/admin/order-operations';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  section: z.enum(['summary', 'timeline']).default('summary'),
  cursor: z.string().max(2048).optional(),
}).strict();

type Context = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, context: Context) {
  const response = await read(request, context);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

async function read(request: Request, context: Context) {
  const { response } = await requireStaffPermission('admin.orders.read');
  if (response) return response;

  const { orderId } = await context.params;
  const parsedId = databaseUuidSchema.safeParse(orderId);
  if (!parsedId.success) return apiFail('VALIDATION_FAILED', 'Invalid order reference.', 422);
  const parsedQuery = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsedQuery.success) return apiFail('VALIDATION_FAILED', 'Invalid order detail query.', 422);

  try {
    const result = await readAdminOrderDetail(createServiceClient(), parsedId.data, parsedQuery.data.section, parsedQuery.data.cursor ?? null);
    if (result.status === 'not_found') return apiFail('NOT_FOUND', 'Order not found.', 404);
    if (result.status === 'invalid_cursor') return apiFail('VALIDATION_FAILED', 'Invalid order timeline cursor.', 422);
    if (result.status === 'unavailable') return apiFail('ORDER_DETAIL_UNAVAILABLE', 'Unable to load this order right now. Retry the request.', 503);
    return apiOk(result.data);
  } catch {
    return apiFail('ORDER_DETAIL_UNAVAILABLE', 'Unable to load this order right now. Retry the request.', 503);
  }
}
