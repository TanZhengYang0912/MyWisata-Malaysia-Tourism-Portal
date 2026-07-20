import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const PAGE_SIZE_MAX = 50;
const CATEGORIES = new Set(['wallet', 'bookings_purchases', 'recommendations_affiliate', 'support', 'account_security']);

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(url.searchParams.get('pageSize') ?? 15) || 15));
  const read = url.searchParams.get('read') ?? 'all';
  const category = url.searchParams.get('category') ?? 'all';
  let query = db.from('notifications').select('id,type,title,body,link,category,metadata,read_at,created_at', { count: 'exact' }).eq('user_id', user.id).order('created_at', { ascending: false });
  if (read === 'unread') query = query.is('read_at', null);
  if (read === 'read') query = query.not('read_at', 'is', null);
  if (CATEGORIES.has(category)) query = query.eq('category', category);
  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ items: (data ?? []).map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, link: row.link, category: row.category ?? 'account_security', metadata: row.metadata ?? {}, readAt: row.read_at, createdAt: row.created_at })), page, pageSize, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) });
}
