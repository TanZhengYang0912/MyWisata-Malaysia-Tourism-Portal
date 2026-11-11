import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261111180000_chatbot_kb_index_versions.sql'),
  'utf8',
);

describe('chatbot KB index version migration', () => {
  it('claims a bounded batch with row locks that skip concurrent workers', () => {
    expect(migration).toMatch(/p_limit < 1 OR p_limit > 10/);
    expect(migration).toMatch(/FOR UPDATE SKIP LOCKED[\s\S]+LIMIT p_limit/);
    expect(migration).toMatch(/auth\.role\(\) <> 'service_role'/);
  });

  it('commits only for the current content version and lease token', () => {
    expect(migration).toMatch(/WHERE id = p_id AND content_version = p_content_version AND index_lease_token = p_lease_token/);
    expect(migration).toMatch(/embedding_version = p_content_version/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.finish_chatbot_kb_reindex[\s\S]+FROM PUBLIC, anon, authenticated/);
  });

  it('keeps stale embeddings out of semantic retrieval', () => {
    expect(migration).toMatch(/d\.embedding_version = d\.content_version/);
  });
});
