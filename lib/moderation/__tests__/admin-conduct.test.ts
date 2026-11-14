import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAdminConductFlagIfNeeded, reviewAdminConductFlag } from '../admin-conduct';
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

describe('reviewAdminConductFlag', () => {
  function reviewService(updateResult: { data: unknown; error: unknown }, currentResult: { data: unknown; error: unknown }) {
    const updateMaybeSingle = vi.fn().mockResolvedValue(updateResult);
    const currentMaybeSingle = vi.fn().mockResolvedValue(currentResult);
    const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
    const updateEqSecond = vi.fn(() => ({ select: updateSelect }));
    const updateEqFirst = vi.fn(() => ({ eq: updateEqSecond }));
    const update = vi.fn(() => ({ eq: updateEqFirst }));
    const currentEq = vi.fn(() => ({ maybeSingle: currentMaybeSingle }));
    const select = vi.fn(() => ({ eq: currentEq }));
    const service = {
      from: () => ({ update, select }),
    } as unknown as SupabaseClient;
    return { service, update, currentMaybeSingle };
  }

  it('returns reviewed when an open row was updated', async () => {
    const { service } = reviewService({ data: { id: 'flag-1' }, error: null }, { data: null, error: null });

    await expect(reviewAdminConductFlag(service, 'flag-1', 'admin-2')).resolves.toBe('reviewed');
  });

  it('distinguishes an already-reviewed row from a missing row without a second write', async () => {
    const { service, update } = reviewService(
      { data: null, error: null },
      { data: { status: 'reviewed' }, error: null },
    );
    await expect(reviewAdminConductFlag(service, 'flag-1', 'admin-2')).resolves.toBe('already_reviewed');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('returns not_found when no row exists', async () => {
    const { service } = reviewService({ data: null, error: null }, { data: null, error: null });

    await expect(reviewAdminConductFlag(service, 'flag-1', 'admin-2')).resolves.toBe('not_found');
  });
});
