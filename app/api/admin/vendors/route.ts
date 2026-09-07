import { z } from 'zod';

import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;
const EMPTY_ID = '00000000-0000-0000-0000-000000000000';
const FILTER_STATUSES = ['all', 'pending', 'approved', 'welcomed', 'rejected', 'suspended'] as const;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  filter: z.enum(FILTER_STATUSES).default('all'),
  search: z.string().trim().max(200).default(''),
  state: z.string().trim().max(100).default('all'),
  kyc: z.enum(['all', 'unverified', 'pending', 'approved', 'rejected']).default('all'),
});

function safeSearch(value: string) {
  return value.replace(/[%,()]/g, ' ').trim();
}

export async function GET(request: Request) {
  const { response } = await requireStaffPermission('admin.vendor.manage');
  if (response) return response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid vendor query parameters', 422, parsed.error.flatten());

  try {
    const service = createServiceClient();
    const { page, filter, state, kyc } = parsed.data;
    const term = safeSearch(parsed.data.search);
    let ownerIdsForKyc: string[] | null = null;
    let ownerIdsForSearch: string[] = [];

    if (kyc !== 'all' || term) {
      let ownerQuery = service.from('users').select('id');
      if (kyc !== 'all') ownerQuery = ownerQuery.eq('kyc_status', kyc);
      if (term) ownerQuery = ownerQuery.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
      const { data: matchedOwners, error: ownerError } = await ownerQuery.limit(100);
      if (ownerError) return apiFail('VENDORS_UNAVAILABLE', 'Unable to load vendors', 503);
      const ids = (matchedOwners ?? []).map((owner: { id: string }) => owner.id);
      if (kyc !== 'all') ownerIdsForKyc = ids;
      if (term) ownerIdsForSearch = ids;
    }

    let matchingVendorIds: string[] | null = null;
    if (state !== 'all') {
      const { data: matchingOutlets, error: outletError } = await service
        .from('outlets')
        .select('vendor_id')
        .eq('state', state);
      if (outletError) return apiFail('VENDORS_UNAVAILABLE', 'Unable to load vendors', 503);
      matchingVendorIds = [...new Set((matchingOutlets ?? []).map((outlet: { vendor_id: string }) => outlet.vendor_id))];
    }

    let vendorQuery = service
      .from('vendors')
      .select('id,name,slug,status,created_at,description,business_type,logo_url,cover_url,approved_at,approval_email_sent_at,rejection_reason,users!vendors_owner_id_fkey(full_name,email,kyc_status),outlets(count),products(count),vendor_documents(count),vendor_onboarding_profiles(legal_business_name,registration_number,contact_name,contact_email,contact_phone,business_address,status,review_note)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (filter === 'approved') vendorQuery = vendorQuery.eq('status', 'approved').is('approval_email_sent_at', null);
    else if (filter === 'welcomed') vendorQuery = vendorQuery.eq('status', 'approved').not('approval_email_sent_at', 'is', null);
    else if (filter !== 'all') vendorQuery = vendorQuery.eq('status', filter);
    if (ownerIdsForKyc) vendorQuery = vendorQuery.in('owner_id', ownerIdsForKyc.length ? ownerIdsForKyc : [EMPTY_ID]);
    if (matchingVendorIds) vendorQuery = vendorQuery.in('id', matchingVendorIds.length ? matchingVendorIds : [EMPTY_ID]);
    if (term) {
      const clauses = [`name.ilike.%${term}%`, `slug.ilike.%${term}%`];
      if (/^[0-9a-f-]{36}$/i.test(term)) clauses.push(`id.eq.${term}`);
      if (ownerIdsForSearch.length) clauses.push(`owner_id.in.(${ownerIdsForSearch.join(',')})`);
      vendorQuery = vendorQuery.or(clauses.join(','));
    }

    const [vendorResult, recommendationResult, ...statusResults] = await Promise.all([
      vendorQuery,
      service.from('vendor_recommendations').select('id,vendor_name').eq('status', 'approved').order('vendor_name'),
      ...FILTER_STATUSES.map(async (status) => {
        let countQuery = service.from('vendors').select('id', { count: 'exact', head: true });
        if (status === 'approved') countQuery = countQuery.eq('status', 'approved').is('approval_email_sent_at', null);
        else if (status === 'welcomed') countQuery = countQuery.eq('status', 'approved').not('approval_email_sent_at', 'is', null);
        else if (status !== 'all') countQuery = countQuery.eq('status', status);
        const result = await countQuery;
        return { status, count: result.count ?? 0, error: result.error };
      }),
    ]);

    if (vendorResult.error || recommendationResult.error || statusResults.some((result) => result.error)) {
      return apiFail('VENDORS_UNAVAILABLE', 'Unable to load vendors', 503);
    }

    return apiOk({
      vendors: vendorResult.data ?? [],
      total: vendorResult.count ?? 0,
      page,
      pageSize: PAGE_SIZE,
      counts: Object.fromEntries(statusResults.map((result) => [result.status, result.count])),
      approvedRecommendations: recommendationResult.data ?? [],
    });
  } catch {
    return apiFail('VENDORS_UNAVAILABLE', 'Unable to load vendors', 503);
  }
}
