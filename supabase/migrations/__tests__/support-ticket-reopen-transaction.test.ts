import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111161000_commit_support_ticket_reopen_atomically.sql',
  'utf8',
);

describe('atomic support ticket reopen transaction', () => {
  it('locks the ticket, verifies its owner, and avoids writes for an already-open ticket', () => {
    expect(migration).toMatch(/FROM public\.support_tickets[\s\S]*?WHERE id = p_ticket_id[\s\S]*?FOR UPDATE/i);
    expect(migration).toContain('v_ticket.user_id IS DISTINCT FROM p_actor_id');
    expect(migration).toContain("v_ticket.status NOT IN ('resolved', 'closed')");
    expect(migration).toContain("'changed', false");
  });

  it('commits notification fan-out with the reopen and gives each recipient a stable event key', () => {
    expect(migration).toMatch(/UPDATE public\.support_tickets[\s\S]*?FOR v_recipient IN[\s\S]*?INSERT INTO public\.notifications/i);
    expect(migration).toContain("'support_reopened:' || p_ticket_id::text");
    expect(migration).toContain('ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING');
  });

  it('restricts the RPC to service role calls', () => {
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });
});
