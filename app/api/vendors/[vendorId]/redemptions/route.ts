import { apiOk } from '@/lib/validation/schemas';
import { authorizeVendor } from '@/lib/vendor-authorization';
import { outletLocation, outletShortName } from '@/lib/outlet-display';

interface Props {
  params: Promise<{ vendorId: string }>;
}

export interface RedemptionRecord {
  id: string;
  kind: 'voucher' | 'ticket';
  redeemedAt: string;
  outlet: {
    id: string;
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

export async function GET(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 15));
  const outletId = searchParams.get('outletId') || '';
  const kind = searchParams.get('kind') || 'all'; // 'all' | 'voucher' | 'ticket'
  const q = (searchParams.get('q') || '').trim().toLowerCase();

  const service = access.access.serviceDb;
  const vendorOutletIds = access.access.outletIds;
  const targetOutletIds = outletId ? [outletId] : vendorOutletIds;

  // 1. Query voucher store redemptions
  let voucherRows: any[] = [];
  if (kind === 'all' || kind === 'voucher') {
    const query = service
      .from('voucher_store_redemptions')
      .select('id, claim_id, voucher_id, outlet_id, user_id, redeemed_by, token_fingerprint, redeemed_at, vouchers(id, code, name, voucher_type, discount_value), outlets(id, name, city, state)')
      .eq('vendor_id', vendorId)
      .in('outlet_id', targetOutletIds)
      .order('redeemed_at', { ascending: false });

    const { data } = await query;
    voucherRows = data || [];
  }

  // 2. Query ticket booking check-ins
  let ticketRows: any[] = [];
  if (kind === 'all' || kind === 'ticket') {
    const query = service
      .from('bookings')
      .select('id, display_id, status, check_in_at, created_at, customer_id, users(id, full_name, email), order_items!inner(vendor_id, outlet_id, product_name, quantity, line_total, outlets(id, name, city, state))')
      .eq('order_items.vendor_id', vendorId)
      .in('order_items.outlet_id', targetOutletIds)
      .not('check_in_at', 'is', null)
      .order('check_in_at', { ascending: false });

    const { data } = await query;
    ticketRows = data || [];
  }

  // 3. Collect unique user IDs for voucher records (customers and staff)
  const userIds = new Set<string>();
  voucherRows.forEach((r) => {
    if (r.user_id) userIds.add(r.user_id);
    if (r.redeemed_by) userIds.add(r.redeemed_by);
  });

  const usersMap = new Map<string, { name: string; email: string }>();
  if (userIds.size > 0) {
    const { data: userRecords } = await service
      .from('users')
      .select('id, full_name, email')
      .in('id', [...userIds]);

    (userRecords || []).forEach((u: { id: string; full_name?: string | null; email?: string | null }) => {
      usersMap.set(u.id, {
        name: u.full_name || 'Anonymous Customer',
        email: u.email || '—',
      });
    });
  }

  // 4. Transform into unified RedemptionRecord format
  const allRecords: RedemptionRecord[] = [];

  // Vouchers
  voucherRows.forEach((row) => {
    const voucher = Array.isArray(row.vouchers) ? row.vouchers[0] : row.vouchers;
    const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
    const customer = usersMap.get(row.user_id) || { name: 'Verified Customer', email: '—' };
    const staff = usersMap.get(row.redeemed_by) || null;

    const discountValue = Number(voucher?.discount_value || 0);
    const details = voucher?.voucher_type === 'percent'
      ? `${discountValue}% OFF`
      : voucher?.voucher_type === 'fixed'
        ? `RM${discountValue.toFixed(2)} OFF`
        : 'Buy 1 Free 1';

    allRecords.push({
      id: row.id,
      kind: 'voucher',
      redeemedAt: row.redeemed_at,
      outlet: {
        id: outlet?.id || row.outlet_id,
        name: outletShortName(outlet?.name, access.access.vendorId),
        fullName: outlet?.name || 'Assigned outlet',
        location: outletLocation(outlet?.city, outlet?.state),
      },
      item: {
        code: voucher?.code || '—',
        name: voucher?.name || 'Store Voucher',
        details,
        discountValue,
      },
      customer,
      staff,
    });
  });

  // Tickets
  ticketRows.forEach((row) => {
    const rawItems = Array.isArray(row.order_items) ? row.order_items : [row.order_items];
    const orderItem = rawItems[0];
    const outlet = Array.isArray(orderItem?.outlets) ? orderItem.outlets[0] : orderItem?.outlets;
    const customerRecord = Array.isArray(row.users) ? row.users[0] : row.users;

    allRecords.push({
      id: row.id,
      kind: 'ticket',
      redeemedAt: row.check_in_at,
      outlet: {
        id: outlet?.id || orderItem?.outlet_id || '',
        name: outletShortName(outlet?.name, access.access.vendorId),
        fullName: outlet?.name || 'Assigned outlet',
        location: outletLocation(outlet?.city, outlet?.state),
      },
      item: {
        code: row.display_id || row.id.slice(0, 8).toUpperCase(),
        name: orderItem?.product_name || 'Experience Ticket',
        details: `Admitted: ${orderItem?.quantity || 1} guest(s)`,
      },
      customer: {
        name: customerRecord?.full_name || 'Guest Ticket Holder',
        email: customerRecord?.email || '—',
      },
      staff: null,
    });
  });

  // Sort by redeemedAt descending
  allRecords.sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());

  // Filter by search query if present
  const filteredRecords = q
    ? allRecords.filter((rec) =>
        rec.item.name.toLowerCase().includes(q) ||
        (rec.item.code && rec.item.code.toLowerCase().includes(q)) ||
        rec.customer.name.toLowerCase().includes(q) ||
        rec.customer.email.toLowerCase().includes(q) ||
        rec.outlet.name.toLowerCase().includes(q) ||
        (rec.staff && rec.staff.name.toLowerCase().includes(q)),
      )
    : allRecords;

  // Stats calculation
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const activeOutlets = new Set(allRecords.map((r) => r.outlet.id));

  const stats = {
    totalCount: allRecords.length,
    todayCount: allRecords.filter((r) => r.redeemedAt.startsWith(todayStr)).length,
    voucherCount: allRecords.filter((r) => r.kind === 'voucher').length,
    ticketCount: allRecords.filter((r) => r.kind === 'ticket').length,
    activeOutletsCount: activeOutlets.size,
  };

  // Pagination slice
  const total = filteredRecords.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedItems = filteredRecords.slice(startIndex, startIndex + pageSize);

  return apiOk({
    items: paginatedItems,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
    stats,
  });
}
