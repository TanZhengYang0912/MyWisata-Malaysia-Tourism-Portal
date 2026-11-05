import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getMyWithdrawalHistoryPage } from '@/backend/domains/commerce';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 25 as const;

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const params = new URL(request.url).searchParams;
  const rawPageSize = params.get('pageSize');
  const rawCreatedAt = params.get('beforeCreatedAt');
  const rawId = params.get('beforeId');
  const parsedDate = rawCreatedAt ? Date.parse(rawCreatedAt) : Number.NaN;
  if ((rawPageSize !== null && Number(rawPageSize) !== PAGE_SIZE)
    || Boolean(rawCreatedAt) !== Boolean(rawId)
    || (rawCreatedAt !== null && !Number.isFinite(parsedDate))
    || (rawId !== null && !UUID.test(rawId))) {
    return apiFail('INVALID_QUERY', 'Invalid withdrawal history page query', 400);
  }

  const cursor = rawCreatedAt && rawId
    ? { createdAt: new Date(parsedDate).toISOString(), id: rawId }
    : null;
  try {
    const page = await getMyWithdrawalHistoryPage(createServiceClient(), user.id, {
      pageSize: PAGE_SIZE,
      cursor,
    });
    return apiOk(page);
  } catch {
    return apiFail('WITHDRAWAL_HISTORY_UNAVAILABLE', 'Withdrawal history is temporarily unavailable', 503);
  }
}
