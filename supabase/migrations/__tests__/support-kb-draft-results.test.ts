import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261111223000_support_kb_draft_results.sql', 'utf8');

describe('support KB draft operation results', () => {
  it('stores only bounded KB draft results in the private operation ledger', () => {
    expect(migration).toContain('result_json IS NULL OR kind = \'kb_draft\'');
    expect(migration).toContain('length(p_result->>\'title\') NOT BETWEEN 1 AND 255');
    expect(migration).toContain('length(p_result->>\'body\') NOT BETWEEN 1 AND 2000');
    expect(migration).toContain('jsonb_array_length(p_result->\'keywords\') > 8');
    expect(migration).toContain('app_private.is_super_admin(p_owner_user_id)');
    expect(migration).toContain('actor_key = \'user:\' || p_owner_user_id::text');
  });

  it('expires only the stored model result and keeps the operation tombstone', () => {
    expect(migration).toContain("result_expires_at = now() + interval '24 hours'");
    expect(migration).toContain('FOR UPDATE SKIP LOCKED LIMIT p_limit');
    expect(migration).toContain('SET result_json = NULL, result_expires_at = NULL');
    expect(migration).not.toMatch(/DELETE\s+FROM public\.support_operations/i);
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.cleanup_support_kb_draft_results(integer) TO service_role');
  });
});
