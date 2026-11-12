import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261112171000_support_chatbot_kb_bounded_queries.sql', 'utf8');

describe('support chatbot bounded KB queries', () => {
  it('counts active FAQ categories under invoker RLS', () => {
    expect(migration).toContain('FUNCTION public.list_support_faq_categories()');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('WHERE document.is_active');
    expect(migration).toContain('GROUP BY 1');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.list_support_faq_categories() TO anon, authenticated, service_role');
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('scores the full active KB, filters reviewed policy evidence, and bounds returned candidates', () => {
    expect(migration).toContain('FUNCTION public.search_support_kb_keywords(');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('ON document.is_active');
    expect(migration).toContain('jsonb_array_length(document.published_source_refs) > 0');
    expect(migration).toContain('row_number() OVER');
    expect(migration).toContain('ORDER BY scored.score DESC, scored.id ASC');
    expect(migration).toContain('WHERE ranked.rank <= 10');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.search_support_kb_keywords(text[], boolean[]) TO service_role');
  });
});
