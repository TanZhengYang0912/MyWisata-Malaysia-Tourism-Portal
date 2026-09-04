import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyTicketReply, notifyTicketReopened } from '../notify';

describe('support notification recipients', () => {
  it.each([null, 'wallet-approver', 'super-admin'])('does not leak ticket previews to an approver (assigned %s)', async (assignedTo) => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const db = {
      from: (table: string) => ({
        select: () => ({
          in: (_column: string, values: string[]) => Promise.resolve({
            error: null,
            data: table === 'roles'
              ? values.map((name) => ({ id: name }))
              : values.map((role) => ({ user_id: role === 'super_admin' ? 'super-admin' : 'wallet-approver' })),
          }),
        }),
        insert,
      }),
    } as unknown as SupabaseClient;
    const ticket = { id: 'ticket', user_id: 'customer', assigned_to: assignedTo, subject: 'Private issue' };
    await notifyTicketReply(db, ticket, 'customer', 'Private reply');
    await notifyTicketReopened(db, ticket);
    expect(insert).toHaveBeenCalledTimes(2);
    for (const [rows] of insert.mock.calls) {
      expect(rows).toEqual([expect.objectContaining({ user_id: 'super-admin' })]);
    }
  });
});
