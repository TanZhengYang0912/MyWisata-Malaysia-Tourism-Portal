import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationFile = readdirSync(migrationsDirectory).find((file) => file.endsWith('_support_chatbot_evidence_provenance.sql'));
const migration = migrationFile ? readFileSync(resolve(migrationsDirectory, migrationFile), 'utf8') : '';

describe('chatbot evidence provenance migration', () => {
  it('adds bounded, indexed, privacy-safe evidence snapshots', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS document_title_snapshot text/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS content_version bigint/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS chatbot_message_kb_refs_message_id_idx\s+ON public\.chatbot_message_kb_refs\s*\(message_id\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.match_kb_documents_with_version/i);
    expect(migration).toMatch(/require_reviewed boolean DEFAULT false/i);
    expect(migration).toMatch(/jsonb_array_length\(d\.published_source_refs\)\s*>\s*0/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.match_kb_documents_with_version\(extensions\.vector, integer, boolean\)[\s\S]*TO anon, authenticated, service_role/i);
    expect(migration).toMatch(/d\.is_active\s+IS\s+TRUE/i);
    expect(migration).toMatch(/d\.embedding_version\s*=\s*d\.content_version/i);
    expect(migration).toMatch(/d\.embedding\s+OPERATOR\(extensions\.<=>\)\s+query_embedding/i);
    expect(migration).toMatch(/ORDER BY d\.embedding\s+OPERATOR\(extensions\.<=>\)\s+query_embedding/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.complete_chatbot_ask_operation_with_evidence/i);
    expect(migration).toMatch(/jsonb_array_length\(p_kb_refs\)\s*>\s*6/i);
    expect(migration).toMatch(/INSERT INTO public\.chatbot_message_kb_refs/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.complete_chatbot_ask_operation_with_evidence[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_chatbot_ask_operation_with_evidence[\s\S]*TO service_role/i);
    expect(migration).toMatch(/SET search_path\s*=\s*''/i);
    expect(migration).toMatch(/NOTIFY pgrst,\s*'reload schema'/i);
  });
});
