import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const PAGE_SIZES = [10, 25, 50] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine(
    (value) => (PAGE_SIZES as readonly number[]).includes(value),
    'pageSize must be 10, 25 or 50',
  ).default(10),
  status: z.string().max(40).default('pending'),
  categoryId: z.string().regex(UUID_PATTERN).optional(),
  state: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
});

function safeSearchTerm(value: string | undefined) {
  return value?.replace(/[%_(),]/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

function ageProjection(createdAt: string) {
  const ageHours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000));
  const slaState = ageHours >= 48 ? 'overdue' : ageHours >= 24 ? 'due_soon' : 'within_sla';
  return { ageHours, slaState };
}

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: canReview, error: capabilityError } = await db.rpc('can_review_recommendation', {
    uid: user.id,
  });
  if (capabilityError || canReview !== true) {
    return apiFail('FORBIDDEN', 'Recommendation reviewer role required', 403);
  }
  const { data: isSuperAdmin } = await db.rpc('is_super_admin', { uid: user.id });

  const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiFail('VALIDATION_FAILED', 'Invalid query parameters', 422, parsed.error.flatten());
  }

  const { page, pageSize, status, categoryId, state, search } = parsed.data;
  const offset = (page - 1) * pageSize;
  const searchTerm = safeSearchTerm(search);
  const service = createServiceClient();

  let query = service
    .from('vendor_recommendations')
    .select(`
      id, recommender_id, vendor_name, status, state, category_id,
      assigned_to, claimed_at, created_at, categories(name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (status === 'reviewed') query = query.neq('status', 'pending');
  else if (status !== 'all') query = query.eq('status', status);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (state) query = query.eq('state', state);
  if (searchTerm) query = query.ilike('vendor_name', `%${searchTerm}%`);

  let countQuery = service
    .from('vendor_recommendations')
    .select('status,state,category_id');
  if (categoryId) countQuery = countQuery.eq('category_id', categoryId);
  if (state) countQuery = countQuery.eq('state', state);
  if (searchTerm) countQuery = countQuery.ilike('vendor_name', `%${searchTerm}%`);

  const [{ data, count, error }, { data: countRows, error: countError }, { data: categories }] = await Promise.all([
    query,
    countQuery,
    service.from('categories').select('id,name').order('name', { ascending: true }),
  ]);

  if (error || countError) {
    console.error('[admin-recommendations-list]', error ?? countError);
    return apiFail('LIST_FAILED', 'Failed to load recommendations', 500);
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    recommender_id: string;
    vendor_name: string;
    status: string;
    state: string | null;
    category_id: string | null;
    assigned_to: string | null;
    claimed_at: string | null;
    created_at: string;
    categories: { name: string } | Array<{ name: string }> | null;
  }>;
  const userIds = [...new Set(rows.flatMap((row) => [row.recommender_id, row.assigned_to]).filter(
    (value): value is string => Boolean(value),
  ))];
  const { data: users } = userIds.length > 0
    ? await service.from('users').select('id,full_name,email,kyc_status').in('id', userIds)
    : { data: [] };
  const userMap = new Map(((users ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    kyc_status: string | null;
  }>).map((entry) => [entry.id, entry]));

  const items = rows.map((row) => {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    const author = userMap.get(row.recommender_id);
    const assignee = row.assigned_to ? userMap.get(row.assigned_to) : null;
    const canDecide = row.status === 'pending'
      && (row.assigned_to === user.id || isSuperAdmin === true);
    const availableActions = row.status !== 'pending'
      ? ['view']
      : canDecide
        ? ['view', 'approve', 'request_changes', 'reject']
        : row.assigned_to == null
          ? ['view', 'claim']
          : ['view'];

    return {
      id: row.id,
      name: row.vendor_name,
      categoryId: row.category_id,
      category: category?.name ?? '',
      state: row.state ?? '',
      status: row.status,
      createdAt: row.created_at,
      ...ageProjection(row.created_at),
      author: {
        id: row.recommender_id,
        name: author?.full_name ?? 'MyWisata member',
        isKycVerified: author?.kyc_status === 'approved',
      },
      assignee: row.assigned_to ? {
        id: row.assigned_to,
        name: assignee?.full_name ?? 'Admin',
        claimedAt: row.claimed_at,
      } : null,
      availableActions,
    };
  });

  const allCountRows = (countRows ?? []) as Array<{ status: string; state: string | null }>;
  const counts = allCountRows.reduce<Record<string, number>>((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});
  const total = count ?? 0;

  return apiOk({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    counts: {
      pending: counts.pending ?? 0,
      reviewed: allCountRows.length - (counts.pending ?? 0),
      approved: counts.approved ?? 0,
      rejected: counts.rejected ?? 0,
    },
    facets: {
      categories: (categories ?? []).map((category) => ({ id: category.id, name: category.name })),
      states: [...new Set(allCountRows.map((row) => row.state).filter(
        (value): value is string => Boolean(value),
      ))].sort(),
    },
  });
}
