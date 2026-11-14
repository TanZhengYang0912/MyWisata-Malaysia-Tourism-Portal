import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../20261111210000_support_handoff_consent_and_private_chat_reads.sql', import.meta.url), 'utf8');
const sanitizedSnapshotMigration = readFileSync(new URL('../20261112134833_support_handoff_sanitized_message_snapshot.sql', import.meta.url), 'utf8');
const columnBoundaryMigrationPath = new URL('../20261114015805_restrict_support_ticket_select_columns.sql', import.meta.url);
const columnBoundaryMigrationExists = existsSync(columnBoundaryMigrationPath);
const columnBoundaryMigration = columnBoundaryMigrationExists ? readFileSync(columnBoundaryMigrationPath, 'utf8') : '';
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

  it('stores only the reviewed sanitized source snapshot and hides preexisting snapshots', () => {
    expect(sanitizedSnapshotMigration).toContain('ADD COLUMN source_message_snapshot text');
    expect(sanitizedSnapshotMigration).toContain('handoff_source_message_sanitized boolean NOT NULL DEFAULT false');
    expect(sanitizedSnapshotMigration).toContain('v_handoff.source_message_snapshot IS NULL');
    expect(sanitizedSnapshotMigration).toContain('v_source_message_snapshot := v_handoff.source_message_snapshot');
    expect(sanitizedSnapshotMigration).toContain('handoff_source_message, handoff_source_message_sanitized');
    expect(sanitizedSnapshotMigration).toContain('v_source_message_snapshot, (v_source_message_snapshot IS NOT NULL)');
    expect(sanitizedSnapshotMigration).not.toMatch(/handoff_source_message\s*=\s*coalesce\(handoff_source_message, v_source_message_body\)/);
    expect(sanitizedSnapshotMigration).toMatch(/REVOKE SELECT ON TABLE public\.support_tickets FROM PUBLIC, anon, authenticated/i);
    expect(sanitizedSnapshotMigration).toMatch(/GRANT SELECT \([\s\S]*customer_last_read_at[\s\S]*TO authenticated/i);
    expect(sanitizedSnapshotMigration).not.toMatch(/GRANT SELECT \([\s\S]*handoff_source_message[\s\S]*TO authenticated/i);
    expect(sanitizedSnapshotMigration).toContain('DROP POLICY IF EXISTS demo_allow_all ON public.support_tickets');
    expect(sanitizedSnapshotMigration).toMatch(/CREATE POLICY support_customer_read ON public\.support_tickets[\s\S]*FOR SELECT TO authenticated[\s\S]*\(SELECT auth\.uid\(\)\) = user_id/i);
  });

  it('keeps authenticated support ticket reads on the approved customer-safe columns', () => {
    expect(columnBoundaryMigrationExists).toBe(true);
    expect(columnBoundaryMigration).toMatch(/REVOKE SELECT ON TABLE public\.support_tickets FROM PUBLIC, anon, authenticated/i);
    expect(columnBoundaryMigration).not.toMatch(/GRANT SELECT ON TABLE public\.support_tickets TO authenticated/i);

    const grant = columnBoundaryMigration.match(/GRANT SELECT\s*\(([\s\S]*?)\)\s*ON TABLE public\.support_tickets TO authenticated/i);
    expect(grant).not.toBeNull();
    expect(grant?.[1].split(',').map((column) => column.trim())).toEqual([
      'id',
      'user_id',
      'subject',
      'category',
      'status',
      'withdrawal_id',
      'created_at',
      'last_reply_at',
      'customer_last_read_at',
    ]);
    expect(columnBoundaryMigration).not.toMatch(/GRANT SELECT\s*\([^)]*(handoff_source_message|operation_payload_hash|handoff_content_hash)/i);
  });
});
