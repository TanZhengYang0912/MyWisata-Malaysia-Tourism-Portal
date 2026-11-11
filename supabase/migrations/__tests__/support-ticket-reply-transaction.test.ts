import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261111160000_commit_support_ticket_reply_atomically.sql',
  'utf8',
);

describe('atomic support ticket reply transaction', () => {
  it('locks and authorizes the ticket before committing reply side effects', () => {
    expect(migration).toMatch(/FROM public\.support_tickets[\s\S]*?WHERE id = p_ticket_id[\s\S]*?FOR UPDATE/i);
    expect(migration).toContain('app_private.is_super_admin(p_actor_id)');
    expect(migration).toContain('v_ticket.user_id IS DISTINCT FROM p_actor_id');
    expect(migration).toContain('operation_id = p_operation_id');
  });

  it('commits reply, ticket state, and deduplicated notifications in one function', () => {
    expect(migration).toMatch(/INSERT INTO public\.support_ticket_replies[\s\S]*?UPDATE public\.support_tickets[\s\S]*?INSERT INTO public\.notifications/i);
    expect(migration).toContain('ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING');
    expect(migration).toMatch(/support_reply:[\s\S]*v_reply\.id::text/i);
    expect(migration).toContain("CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')) NOT VALID");
  });

  it('exposes the transaction only to the service role', () => {
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('TO service_role');
  });
});
