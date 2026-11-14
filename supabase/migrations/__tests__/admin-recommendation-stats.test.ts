import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261114071657_admin_recommendation_stats.sql', 'utf8');

describe('admin recommendation statistics RPC', () => {
  it('applies the list filters before grouping counts and states', () => {
    expect(migration).toMatch(/FROM public\.vendor_recommendations AS r[\s\S]*r\.category_id = p_category_id/);
    expect(migration).toMatch(/r\.state = p_state/);
    expect(migration).toMatch(/r\.vendor_name ILIKE '%' \|\| p_search \|\| '%'/);
    expect(migration).toContain("count(*) FILTER (WHERE status = 'pending')");
    expect(migration).toContain("count(*) FILTER (WHERE status <> 'pending')");
    expect(migration).toMatch(/SELECT DISTINCT state FROM matching WHERE state IS NOT NULL/);
  });

  it('limits execution to service_role', () => {
    expect(migration).toMatch(/SECURITY INVOKER/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_admin_recommendation_stats\(uuid, text, text\) FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_admin_recommendation_stats\(uuid, text, text\) TO service_role/);
  });
});
