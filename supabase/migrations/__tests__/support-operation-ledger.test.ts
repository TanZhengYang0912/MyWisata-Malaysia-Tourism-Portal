import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261111220000_support_operation_ledger.sql', 'utf8');

describe('support operation ledger migration', () => {
  it('keeps raw payloads out and limits direct access to service role', () => {
    expect(migration).toContain('payload_hash text NOT NULL');
    expect(migration).not.toMatch(/payload\s+jsonb/i);
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });

  it('serializes reservations and refuses automatic retry after external work starts', () => {
    expect(migration).toContain('ON CONFLICT (id) DO NOTHING');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("v_operation.external_started_at IS NOT NULL");
    expect(migration).toContain("SET state = 'unknown'");
    expect(migration).toContain('complete_chatbot_ask_operation');
  });
});
