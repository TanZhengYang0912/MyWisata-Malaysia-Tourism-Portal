import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../20261111210000_support_handoff_consent_and_private_chat_reads.sql', import.meta.url), 'utf8');
const rlsContract = readFileSync(new URL('../../tests/chatbot-guest-session-rls.sql', import.meta.url), 'utf8');

describe('support handoff privacy and consent migration', () => {
  it('removes direct transcript reads and keeps service-role access', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS chatbot_sessions_own');
    expect(migration).toContain('DROP POLICY IF EXISTS chatbot_messages_own');
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.chatbot_sessions, public\.chatbot_messages FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT ALL ON TABLE public\.chatbot_sessions, public\.chatbot_messages TO service_role/i);
    expect(rlsContract).toContain("has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')");
  });

  it('binds reviewed content, owner, operation, consent and ticket in one service-only transaction', () => {
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('consented_content_hash = p_content_hash');
    expect(migration).toContain('source_message_hash = v_handoff.source_message_hash');
    expect(migration).toContain('handoff_source_message = coalesce(handoff_source_message, v_source_message_body)');
    expect(migration).toContain('handoff_consented_at timestamptz');
    expect(migration).toContain('consumed_at = now()');
    expect(migration).toContain('ticket_id = v_ticket.id');
    expect(migration).toContain('p_category NOT IN');
    expect(migration).toContain("'support_handoff_service_role_required'");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_support_ticket_from_handoff\(uuid, uuid, text, text, text, uuid, text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_support_ticket_from_handoff\(uuid, uuid, text, text, text, uuid, text, text, text\)[\s\S]*TO service_role/i);
  });
});
