import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261111170000_chatbot_customer_stats_rpc.sql', 'utf8');
const metricsExtension = readFileSync('supabase/migrations/20261111211000_chatbot_common_question_metrics.sql', 'utf8');
const integrityFix = readFileSync('supabase/migrations/20261112170000_support_chatbot_metrics_integrity.sql', 'utf8');

describe('customer chatbot stats migration dependencies', () => {
  it('creates referenced schema before the aggregate RPC', () => {
    expect(migration.indexOf('ADD COLUMN IF NOT EXISTS channel')).toBeLessThan(migration.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(migration.indexOf('CREATE TABLE IF NOT EXISTS public.chatbot_feedback')).toBeLessThan(migration.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(migration).toContain('reply_to_message_id');
  });

  it('keeps feedback inaccessible to browser database roles', () => {
    expect(migration).toContain('ALTER TABLE public.chatbot_feedback ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.chatbot_feedback FROM PUBLIC, anon, authenticated');
  });

  it('aggregates common questions inside the requested range and limits results in Postgres', () => {
    expect(metricsExtension).toContain("WHERE role = 'user' AND nullif(btrim(body), '') IS NOT NULL");
    expect(metricsExtension).toContain('ORDER BY count DESC, last_asked_at DESC');
    expect(metricsExtension).toContain('LIMIT 10');
    expect(metricsExtension).toContain("'topCommon'");
    expect(metricsExtension).toContain('REVOKE ALL ON FUNCTION public.get_customer_chatbot_stats');
    expect(metricsExtension).toContain('GRANT EXECUTE ON FUNCTION public.get_customer_chatbot_stats(timestamptz, timestamptz) TO service_role');
  });

  it('counts user questions, enforces same-session turn pairing, and avoids legacy feedback echoes', () => {
    expect(integrityFix).toContain("'answerRate', CASE WHEN totals.total_questions = 0 THEN 0 ELSE totals.answered_count::numeric / totals.total_questions END");
    expect(integrityFix).toContain('AND bot.session_id = q.session_id');
    expect(integrityFix).toContain('AND question.session_id = bot.session_id');
    expect(integrityFix).toContain('ADD COLUMN IF NOT EXISTS body_sanitized boolean NOT NULL DEFAULT false');
    expect(integrityFix).toContain('CASE WHEN question.body_sanitized THEN question.body ELSE NULL END AS question');
    expect(integrityFix).toContain('CASE WHEN question.body_sanitized THEN question.body ELSE NULL END AS body');
    expect(integrityFix).not.toContain('SELECT q.id, q.session_id, q.body AS question');
    expect(integrityFix).not.toContain('SELECT f.question');
    expect(integrityFix).toContain('GRANT EXECUTE ON FUNCTION public.get_customer_chatbot_stats(timestamptz, timestamptz) TO service_role');
    expect(integrityFix).toContain('question_source_version = 0');
    expect(integrityFix).toContain('SET question = source_questions.body');
    expect(integrityFix).toContain('GRANT EXECUTE ON FUNCTION public.repair_chatbot_feedback_question_source(uuid, integer) TO service_role');
    expect(integrityFix).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
