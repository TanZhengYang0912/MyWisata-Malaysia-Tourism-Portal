import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261111163000_support_attachment_lifecycle.sql', 'utf8');

describe('support attachment lifecycle boundary', () => {
  it('registers upload ownership, content, state, and lease before external storage work', () => {
    expect(migration).toContain('CREATE TABLE public.support_attachment_uploads');
    expect(migration).toContain('operation_payload_hash text NOT NULL');
    expect(migration).toContain('server_sha256 text NOT NULL');
    expect(migration).toContain('external_started_at timestamptz');
    expect(migration).toContain('lease_token uuid');
    expect(migration).toContain("'reserved', v_token, now() + interval '10 minutes'");
    expect(migration).toContain("REVOKE ALL ON TABLE public.support_attachment_uploads FROM PUBLIC, anon, authenticated");
  });

  it('uses operation locks and checks ticket ownership before reserving a fixed path', () => {
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0))');
    expect(migration).toMatch(/FROM public\.support_tickets[\s\S]*?FOR UPDATE/i);
    expect(migration).toContain('v_ticket.user_id IS DISTINCT FROM p_actor_id');
    expect(migration).toContain("v_path := p_ticket_id::text || '/' || v_upload_id::text || '.' || v_extension");
  });

  it('claims only bounded, unreferenced cleanup work and retries failed deletion', () => {
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain('LIMIT 50');
    expect(migration).toContain('WHERE reply.attachment_url = v_item.storage_path');
    expect(migration).toContain("SET state = 'deleting', lease_token = v_token");
    expect(migration).toContain('cleanup_attempts = cleanup_attempts + 1');
    expect(migration).toContain('next_attempt_at = now() + make_interval');
  });

  it('blocks direct browser Storage access and direct attachment path reads', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS ticket_attachments_insert ON storage.objects');
    expect(migration).toContain('DROP POLICY IF EXISTS ticket_attachments_select ON storage.objects');
    expect(migration).toContain('REVOKE ALL ON TABLE public.support_ticket_replies FROM anon, authenticated');
    expect(migration).toContain('GRANT SELECT (ticket_id, sender_role, created_at)');
    expect(migration).not.toMatch(/GRANT SELECT\s*\([^)]*attachment_url/i);
  });
});
