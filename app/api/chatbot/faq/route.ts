// Public FAQ categories are counted in Postgres, and questions are fetched a
// page at a time so the widget never loads the complete knowledge base.
import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

const PAGE_SIZE = 10;

export interface FaqQuestion {
  id: string;
  question: string;
}

export interface FaqCategory {
  category: string;
  count: number;
}

export interface FaqQuestionPage {
  category: string;
  questions: FaqQuestion[];
  page: number;
  pageSize: typeof PAGE_SIZE;
  total: number;
  totalPages: number;
}

interface FaqQuestionRow {
  id: string;
  title: string;
}

export async function GET(request: Request) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return apiFail(
      'READ_UNAVAILABLE',
      'Frequently asked questions are temporarily unavailable. Please try again.',
      503,
    );
  }
  const searchParams = new URL(request.url).searchParams;
  const category = searchParams.get('category');

  if (category === null) {
    const { data, error } = await supabase.rpc('list_support_faq_categories');
    if (error) {
      return apiFail(
        'READ_UNAVAILABLE',
        'Frequently asked questions are temporarily unavailable. Please try again.',
        503,
      );
    }

    const categories: FaqCategory[] = ((data ?? []) as { category: string; question_count: number }[])
      .map((row) => ({ category: row.category, count: Number(row.question_count) }));
    return apiOk({ categories });
  }

  if (!/^[a-z0-9_-]{1,50}$/i.test(category)) {
    return apiFail('BAD_REQUEST', 'Choose a valid FAQ category.', 400);
  }
  const rawPage = searchParams.get('page');
  const requestedPage = rawPage === null ? 1 : Number(rawPage);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || requestedPage > Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)) {
    return apiFail('BAD_REQUEST', 'Choose a valid FAQ page.', 400);
  }

  const fetchPage = (page: number) => {
    let query = supabase
      .from('chatbot_kb_documents')
      .select('id,title', { count: 'exact' })
      .eq('is_active', true);
    query = category === 'general'
      ? query.or('category.is.null,category.eq.general')
      : query.eq('category', category);
    return query
      .order('title')
      .order('id')
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  };

  let page = requestedPage;
  const firstPageResult = await fetchPage(page);
  let { data, error } = firstPageResult;
  if (error) {
    return apiFail(
      'READ_UNAVAILABLE',
      'Frequently asked questions are temporarily unavailable. Please try again.',
      503,
    );
  }

  const total = firstPageResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const correctedPage = Math.min(page, totalPages);
  if (correctedPage !== page) {
    page = correctedPage;
    ({ data, error } = await fetchPage(page));
    if (error) {
      return apiFail(
        'READ_UNAVAILABLE',
        'Frequently asked questions are temporarily unavailable. Please try again.',
        503,
      );
    }
  }

  return apiOk({
    category,
    questions: ((data ?? []) as FaqQuestionRow[]).map((row) => ({ id: row.id, question: row.title })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
  } satisfies FaqQuestionPage);
}
