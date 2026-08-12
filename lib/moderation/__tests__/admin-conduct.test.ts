import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminConductFlags, logAdminConductFlagIfNeeded, reviewAdminConductFlag } from '../admin-conduct';
import type { CleanedContent } from '../clean';

function cleaned(overrides: Partial<CleanedContent> = {}): CleanedContent {
  return {
    display: 'hello',
    original: 'hello',
    hadProfanity: false,
    hadSlur: false,
    hadPII: false,
    severity: 'none',
    ...overrides,
  };
}

describe('logAdminConductFlagIfNeeded', () => {
  it('does nothing when neither profanity nor a slur was found', async () => {
    const insert = vi.fn();
    const service = { from: () => ({ insert }) } as unknown as SupabaseClient;

    await logAdminConductFlagIfNeeded(service, {
      cleaned: cleaned(),
      flaggedAdminId: 'admin-1',
      targetUserId: 'user-1',
      source: 'ticket_reply',
      sourceRefId: 'ticket-1',
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts with severity medium for profanity only', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const service = { from: () => ({ insert }) } as unknown as SupabaseClient;

    await logAdminConductFlagIfNeeded(service, {
      cleaned: cleaned({ hadProfanity: true, original: 'you idiot' }),
      flaggedAdminId: 'admin-1',
      targetUserId: 'user-1',
      source: 'ticket_reply',
      sourceRefId: 'ticket-1',
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      flagged_admin_id: 'admin-1',
      target_user_id: 'user-1',
      source: 'ticket_reply',
      source_ref_id: 'ticket-1',
      original_text: 'you idiot',
      severity: 'medium',
    }));
  });

  it('inserts with severity high when a slur was found', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const service = { from: () => ({ insert }) } as unknown as SupabaseClient;

    await logAdminConductFlagIfNeeded(service, {
      cleaned: cleaned({ hadSlur: true }),
      flaggedAdminId: 'admin-1',
      targetUserId: null,
      source: 'admin_ai',
      sourceRefId: 'session-key-1',
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ severity: 'high', target_user_id: null }));
  });

  it('never throws when the insert fails', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const service = { from: () => ({ insert }) } as unknown as SupabaseClient;

    await expect(logAdminConductFlagIfNeeded(service, {
      cleaned: cleaned({ hadSlur: true }),
      flaggedAdminId: 'admin-1',
      targetUserId: null,
      source: 'admin_ai',
      sourceRefId: 'session-key-1',
    })).resolves.toBeUndefined();
  });
});

describe('getAdminConductFlags', () => {
  it('joins flagged admin and target user names', async () => {
    const flagsData = [{
      id: 'flag-1',
      flagged_admin_id: 'admin-1',
      target_user_id: 'user-1',
      source: 'ticket_reply',
      source_ref_id: 'ticket-1',
      original_text: 'you idiot',
      severity: 'medium',
      status: 'open',
      created_at: '2026-08-09T00:00:00.000Z',
      reviewed_at: null,
      reviewed_by: null,
    }];
    const usersData = [
      { id: 'admin-1', full_name: 'Ali Admin', email: 'ali@example.com' },
      { id: 'user-1', full_name: null, email: 'bob@example.com' },
    ];
    const service = {
      from: (table: string) => {
        if (table === 'admin_conduct_flags') {
          return { select: () => ({ order: () => Promise.resolve({ data: flagsData }) }) };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: usersData }) }) };
      },
    } as unknown as SupabaseClient;

    const result = await getAdminConductFlags(service);

    expect(result).toEqual([{
      id: 'flag-1',
      flaggedAdminId: 'admin-1',
      flaggedAdminName: 'Ali Admin',
      targetUserId: 'user-1',
      targetUserName: 'bob@example.com',
      source: 'ticket_reply',
      sourceRefId: 'ticket-1',
      originalText: 'you idiot',
      severity: 'medium',
      status: 'open',
      createdAt: '2026-08-09T00:00:00.000Z',
      reviewedAt: null,
      reviewedBy: null,
    }]);
  });

  it('leaves targetUserName null when there is no target (admin_ai)', async () => {
    const flagsData = [{
      id: 'flag-2',
      flagged_admin_id: 'admin-1',
      target_user_id: null,
      source: 'admin_ai',
      source_ref_id: 'session-key-1',
      original_text: 'you idiot',
      severity: 'high',
      status: 'open',
      created_at: '2026-08-09T00:00:00.000Z',
      reviewed_at: null,
      reviewed_by: null,
    }];
    const service = {
      from: (table: string) => {
        if (table === 'admin_conduct_flags') {
          return { select: () => ({ order: () => Promise.resolve({ data: flagsData }) }) };
        }
        return { select: () => ({ in: () => Promise.resolve({ data: [{ id: 'admin-1', full_name: 'Ali Admin', email: 'ali@example.com' }] }) }) };
      },
    } as unknown as SupabaseClient;

    const result = await getAdminConductFlags(service);
    expect(result[0].targetUserId).toBeNull();
    expect(result[0].targetUserName).toBeNull();
  });
});

describe('reviewAdminConductFlag', () => {
  it('returns true when a row was updated', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'flag-1' }, error: null });
    const service = {
      from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle }) }) }) }) }),
    } as unknown as SupabaseClient;

    await expect(reviewAdminConductFlag(service, 'flag-1', 'admin-2')).resolves.toBe(true);
  });

  it('returns false when no open row matched', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const service = {
      from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle }) }) }) }) }),
    } as unknown as SupabaseClient;

    await expect(reviewAdminConductFlag(service, 'flag-1', 'admin-2')).resolves.toBe(false);
  });
});
