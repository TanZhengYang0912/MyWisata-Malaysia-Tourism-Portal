import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111164000_commit_support_ticket_attachment_atomically.sql',
  'utf8',
);

describe('atomic support ticket attachment commit', () => {
  it('rechecks identity and ownership while holding a ticket row lock', () => {
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toMatch(/FROM public\.support_tickets[\s\S]*?WHERE id = p_ticket_id[\s\S]*?FOR UPDATE/i);
    expect(migration).toContain('v_ticket.user_id IS DISTINCT FROM p_actor_id');
    expect(migration).toContain('app_private.is_super_admin(p_actor_id)');
    expect(migration).toContain('operation_payload_hash IS DISTINCT FROM p_operation_payload_hash');
  });

  it('binds the attachment, ticket activity, and notification in the same RPC', () => {
    expect(migration).toMatch(/INSERT INTO public\.support_ticket_replies[\s\S]*?UPDATE public\.support_tickets[\s\S]*?INSERT INTO public\.notifications/i);
    expect(migration).toContain('attachment_url, operation_id, operation_payload_hash');
    expect(migration).toContain('ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING');
  });

  it('keeps the RPC unavailable to browser roles', () => {
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });
});
