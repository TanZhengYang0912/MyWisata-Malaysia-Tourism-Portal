import { z } from 'zod';

import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { postgrestSearchTerm } from '@/lib/validation/postgrest-filter';

export const dynamic = 'force-dynamic';

const MAX_VENDOR_OPTIONS = 25;
const querySchema = z.object({ search: z.string().trim().max(100).default('') });

export async function GET(request: Request) {
  const { response } = await requireStaffPermission('admin.orders.read');
  if (response) return response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid vendor search query.', 422, parsed.error.flatten());

  const term = postgrestSearchTerm(parsed.data.search);
  if (term.length < 2) return apiOk({ vendors: [] });

  try {
    const { data, error } = await createServiceClient().from('vendors')
      .select('id,name')
      .ilike('name', `%${term}%`)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .limit(MAX_VENDOR_OPTIONS);

    if (error) return apiFail('VENDORS_UNAVAILABLE', 'Unable to search vendors right now.', 503);
    return apiOk({ vendors: data ?? [] });
  } catch {
    return apiFail('VENDORS_UNAVAILABLE', 'Unable to search vendors right now.', 503);
  }
}
