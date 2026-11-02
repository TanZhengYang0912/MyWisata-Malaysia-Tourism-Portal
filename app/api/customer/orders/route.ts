import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { mapOrder } from '@/backend/domains/commerce';
import { malaysiaCalendarDateToIso } from '@/lib/datetime/malaysia';

const filters = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  query: z.string().trim().max(200).default(''),
  status: z.enum(['all','PAID','COMPLETED','CANCELLED','REFUNDED','PENDING_PAYMENT']).default('all'),
  type: z.enum(['all','booking','product','mixed']).default('all'),
  outletId: z.union([z.literal('all'),z.string().uuid()]).default('all'),
  from: z.string().default(''), to: z.string().default(''),
}).strict();
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return Response.json({ error: 'authentication_required' }, { status: 401, headers });
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: 'invalid_order_filters' }, { status: 400, headers });
  try {
    const input = parsed.data;
    const from = input.from ? malaysiaCalendarDateToIso(input.from, 'start') : null;
    const to = input.to ? malaysiaCalendarDateToIso(input.to, 'end') : null;
    if (from && to && from > to) return Response.json({ error: 'invalid_order_filters' }, { status: 400, headers });
    const { data, error } = await db.rpc('list_my_orders', {
      p_page: input.page, p_query: input.query, p_status: input.status.toLowerCase(), p_kind: input.type,
      p_outlet_id: input.outletId === 'all' ? null : input.outletId, p_from: from, p_to: to,
    });
    if (error) return Response.json({ error: 'orders_unavailable' }, { status: 503, headers });
    const result = data as { orders: Parameters<typeof mapOrder>[0][]; total: number; page: number; pageSize: number; stats: { total: number; paid: number; bookings: number }; outlets: { id: string; name: string }[] };
    return Response.json({ data: { ...result, orders: result.orders.map(mapOrder) } }, { headers });
  } catch {
    return Response.json({ error: 'orders_unavailable' }, { status: 503, headers });
  }
}
