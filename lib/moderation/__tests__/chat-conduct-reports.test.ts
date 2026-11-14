import { describe, expect, it, vi } from 'vitest';
import { createChatConductReport, reviewChatConductReport } from '@/lib/moderation/chat-conduct-reports';

function serviceWithInsertResult(result: { data: unknown; error: unknown }) {
  const single = vi.fn(async () => result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { service: { from: vi.fn(() => ({ insert })) } as never, insert, select, single };
}

describe('createChatConductReport', () => {
  it('returns only the safe database code when insertion fails', async () => {
    const internalMessage = 'constraint private_reports_reason_check on relation chat_conduct_reports';
    const { service } = serviceWithInsertResult({ data: null, error: { code: '23514', message: internalMessage } });

    const result = await createChatConductReport(service, {
      reporterId: 'reporter-1', partyAId: 'party-a', partyBId: null,
      chatType: 'user_admin', threadRef: 'ticket-1', reason: 'Please review this.',
    });

    expect(result).toEqual({ ok: false, reason: 'error', errorCode: '23514' });
    expect(JSON.stringify(result)).not.toContain(internalMessage);
  });

  it('keeps a unique open report conflict distinct from an insert failure', async () => {
    const { service } = serviceWithInsertResult({ data: null, error: { code: '23505', message: 'duplicate key' } });

    const result = await createChatConductReport(service, {
      reporterId: 'reporter-1', partyAId: 'party-a', partyBId: null,
      chatType: 'user_admin', threadRef: 'ticket-1', reason: null,
    });

    expect(result).toEqual({ ok: false, reason: 'duplicate' });
  });
});

describe('reviewChatConductReport', () => {
  function reviewService(updateResult: { data: unknown; error: unknown }, currentResult: { data: unknown; error: unknown }) {
    const updateMaybeSingle = vi.fn().mockResolvedValue(updateResult);
    const currentMaybeSingle = vi.fn().mockResolvedValue(currentResult);
    const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
    const updateEqSecond = vi.fn(() => ({ select: updateSelect }));
    const updateEqFirst = vi.fn(() => ({ eq: updateEqSecond }));
    const update = vi.fn(() => ({ eq: updateEqFirst }));
    const currentEq = vi.fn(() => ({ maybeSingle: currentMaybeSingle }));
    const select = vi.fn(() => ({ eq: currentEq }));
    const service = { from: () => ({ update, select }) } as never;
    return { service, update };
  }

  it('does not write twice when the report was already reviewed', async () => {
    const { service, update } = reviewService(
      { data: null, error: null },
      { data: { status: 'reviewed' }, error: null },
    );

    await expect(reviewChatConductReport(service, 'report-1', 'admin-1')).resolves.toBe('already_reviewed');
    expect(update).toHaveBeenCalledTimes(1);
  });
});
