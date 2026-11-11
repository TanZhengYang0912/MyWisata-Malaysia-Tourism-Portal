import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20261111190000_chatbot_kb_review_workflow.sql'), 'utf8');
const securityMigration = readFileSync(join(process.cwd(), 'supabase/migrations/20261111085703_support_kb_rls_and_reviewer_authorization.sql'), 'utf8');

describe('chatbot KB review workflow migration', () => {
  it('keeps drafts private and permits only one open revision per document', () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/REVOKE ALL ON public\.chatbot_kb_revisions FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/WHERE state = 'draft'/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX chatbot_kb_one_open_revision_per_document/);
  });

  it('saves revisions with optimistic versions and does not activate draft writes', () => {
    expect(migration).toMatch(/v_document\.content_version <> p_expected_content_version/);
    expect(migration).toMatch(/is_active, content_version, embedding_version\)[\s\S]+false, 0, NULL/);
    expect(migration).toMatch(/chatbot_kb_revision_conflict/);
    expect(migration).toMatch(/creation_operation_id uuid UNIQUE/);
    expect(migration).toMatch(/v_revision\.revision_hash <> v_hash OR v_revision\.author_id <> p_author_id/);
  });

  it('publishes only a confirmed, sourced current revision and invalidates stale embeddings', () => {
    expect(migration).toMatch(/p_confirmed IS DISTINCT FROM true/);
    expect(migration).toMatch(/jsonb_array_length\(v_revision\.source_refs\) = 0/);
    expect(migration).toMatch(/v_revision\.base_content_version <> p_expected_content_version/);
    expect(migration).toMatch(/embedding_version = CASE WHEN v_content_changed THEN NULL/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.publish_chatbot_kb_revision[\s\S]+TO service_role/);
    expect(migration).toMatch(/v_revision\.state = 'published'[\s\S]+published', true, 'changed', false/);
  });

  it('supports bounded per-document retry with the existing lease and version checks', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_chatbot_kb_reindex\([\s\S]*p_document_id uuid\s*\)/);
    expect(migration).toMatch(/p_document_id IS NULL OR d\.id = p_document_id/);
    expect(migration).toMatch(/FOR UPDATE SKIP LOCKED[\s\S]+LIMIT p_limit/);
  });

  it('records only database-verified Super Admin authors and reviewers', () => {
    expect(migration).toMatch(/p_author_id IS NULL OR NOT coalesce\(app_private\.is_super_admin\(p_author_id\), false\)/);
    expect(migration).toMatch(/p_reviewer_id IS NULL OR NOT coalesce\(app_private\.is_super_admin\(p_reviewer_id\), false\)/);
  });

  it('keeps direct KB access read-only and limited to active documents', () => {
    expect(securityMigration).toMatch(/ALTER TABLE public\.chatbot_kb_documents ENABLE ROW LEVEL SECURITY/);
    expect(securityMigration).toMatch(/DROP POLICY IF EXISTS "demo_allow_all" ON public\.chatbot_kb_documents/);
    expect(securityMigration).toMatch(/FOR SELECT[\s\S]+TO anon, authenticated[\s\S]+USING \(is_active IS TRUE\)/);
    expect(securityMigration).toMatch(/REVOKE ALL ON TABLE public\.chatbot_kb_documents FROM anon, authenticated/);
    expect(securityMigration).toMatch(/GRANT SELECT ON TABLE public\.chatbot_kb_documents TO anon, authenticated/);
    expect(securityMigration).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.chatbot_kb_documents TO service_role/);
  });
});
