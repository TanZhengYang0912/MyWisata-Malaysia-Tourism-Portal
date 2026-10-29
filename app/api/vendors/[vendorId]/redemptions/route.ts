import { apiFail, apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';

interface Props {
  params: Promise<{ vendorId: string }>;
}

export interface RedemptionRecord {
  id: string;
  kind: 'voucher' | 'ticket' | 'event_pickup' | 'retail_pickup';
  redeemedAt: string;
  outlet: {
    id: string | null;
    name: string;
    fullName: string;
    location: string;
  };
  item: {
    code?: string;
    name: string;
    details: string;
    discountValue?: number;
  };
  customer: {
    name: string;
    email: string;
  };
  staff?: {
    name: string;
    email: string;
  } | null;
}

const allowedKinds = new Set(['all', 'voucher', 'ticket', 'event_pickup', 'retail_pickup']);

function positiveInteger(value: string | null, fallback: number, maximum: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  return Math.min(maximum, Math.max(1, Number(value)));
}

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, undefined, { allowEventVendor: true, requireApproved: true });
  if (!access.ok) return access.response;

  const { searchParams } = new URL(request.url);
  const page = positiveInteger(searchParams.get('page'), 1, 2_147_483_647);
  const pageSize = positiveInteger(searchParams.get('pageSize'), 15, 50);
  const outletId = searchParams.get('outletId') || null;
  const requestedKind = searchParams.get('kind') || 'all';
  const kind = allowedKinds.has(requestedKind) ? requestedKind : 'all';
  const query = (searchParams.get('q') || '').trim().slice(0, 100);
  const outletIds = access.access.outletIds;

  if (outletId && !outletIds.includes(outletId)) {
    return apiFail('FORBIDDEN', 'This outlet is outside your assigned scope', 403);
  }

  const { data, error } = await access.access.serviceDb.rpc('list_vendor_redemption_history', {
    p_vendor_id: vendorId,
    p_scope_outlet_ids: outletIds,
    p_outlet_id: outletId,
    p_kind: kind,
    p_query: query,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) return apiFail('DB_ERROR', 'Unable to load redemption history', 500);
  if (!data || typeof data !== 'object' || !('items' in data) || !('pagination' in data) || !('stats' in data)) {
    return apiFail('DB_ERROR', 'Redemption history response is unavailable', 500);
  }

  return apiOk(data);
}
