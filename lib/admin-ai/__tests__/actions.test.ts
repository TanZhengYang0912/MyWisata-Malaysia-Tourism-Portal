import { describe, expect, it } from 'vitest';
import { ACTION_NAMES, buildChoiceList, listRecords, proposeAction } from '@/lib/admin-ai/actions';

const TICKET = '5f2c1a7e-2026-4123-8123-0123456789ab';

/** Minimal fake: every table returns `rows` for list reads and `row` for single reads. */
function fakeDb(row: Record<string, unknown> | null, rows: Record<string, unknown>[] = []) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) chain[method] = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: row, error: null });
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null });
  return { from: () => chain } as never;
}

describe('admin AI action proposals', () => {
  it('only offers low-risk operations', () => {
    expect(ACTION_NAMES.sort()).toEqual([
      'add_hotel_amenity', 'add_moderation_word', 'claim_event_exception', 'create_kb_entry', 'mark_notifications_read',
      'reindex_kb', 'reply_to_ticket', 'set_hotel_amenity_active', 'set_kb_entry_active', 'set_moderation_word_active', 'update_ticket',
      // Group B
      'change_stall_number', 'pause_sponsored_ad', 'recommendation_request_changes', 'resolve_chat_report',
      'review_catalogue_item', 'send_vendor_announcement', 'set_event_ad_paused', 'vendor_request_information',
    ].sort());
    for (const name of ACTION_NAMES) expect(name).not.toMatch(/withdraw|refund|kyc|user|role|delete|setting|fee|wallet|suspend/);
  });

  it('builds the request for the existing route, after checking the target exists', async () => {
    const card = await proposeAction(fakeDb({ id: TICKET, subject: 'Payment stuck' }), 'update_ticket', JSON.stringify({ id: TICKET, status: 'in_progress' }));
    expect(card).toMatchObject({
      action: 'update_ticket',
      details: [{ field: 'ticket', value: 'Payment stuck' }, { field: 'status', value: 'in_progress' }],
      request: { method: 'PATCH', url: `/api/admin/tickets/${TICKET}`, body: { status: 'in_progress' } },
    });
    expect(await proposeAction(fakeDb(null), 'update_ticket', JSON.stringify({ id: TICKET, status: 'resolved' }))).toEqual({ error: 'ticket not found' });
  });

  it('rejects bad args with the expected shape and never builds a request', async () => {
    expect(await proposeAction(fakeDb(null), 'update_ticket', JSON.stringify({ id: TICKET }))).toEqual({ error: 'give a status or a category' });
    expect(await proposeAction(fakeDb(null), 'update_ticket', JSON.stringify({ id: TICKET, status: 'closed' }))).toMatchObject({ error: 'invalid_args' });
    expect(await proposeAction(fakeDb(null), 'reindex_kb', 'not json')).toMatchObject({ error: 'args_json is not valid JSON' });
  });

  it('saves AI-written knowledge base entries as a reviewable draft', async () => {
    const card = await proposeAction(fakeDb(null), 'create_kb_entry', JSON.stringify({ title: 'Refund time', body: 'Refunds take 5 to 7 working days.', keywords: ['refund'] }));
    expect(card).toMatchObject({ request: { method: 'POST', url: '/api/admin/chatbot/kb', body: {
      title: 'Refund time', body: 'Refunds take 5 to 7 working days.', keywords: ['refund'], operationId: expect.any(String),
    } } });
    expect((card as { request?: { body?: Record<string, unknown> } }).request?.body).not.toHaveProperty('isActive');
  });

  it('claims an event case with its current version and a Malaysia end-of-day due time', async () => {
    const card = await proposeAction(fakeDb({ id: TICKET, kind: 'pickup_overdue', state: 'open', version: 3 }), 'claim_event_exception', JSON.stringify({ id: TICKET, dueDate: '2026-11-20' }));
    expect(card).toMatchObject({ request: { body: { action: 'claim', version: 3, dueAt: '2026-11-20T23:59:00+08:00' } } });
  });
});

describe('Group B proposals', () => {
  it('only asks a vendor for information, never approves them', async () => {
    const card = await proposeAction(fakeDb({ id: TICKET, name: 'Kopi Co', status: 'pending' }), 'vendor_request_information', JSON.stringify({ id: TICKET, reason: 'Upload your SSM certificate' }));
    expect(card).toMatchObject({ request: { url: `/api/admin/vendors/${TICKET}/approve`, body: { action: 'request_information' } }, link: '/admin/vendors' });
    expect(await proposeAction(fakeDb({ id: TICKET, name: 'Kopi Co', status: 'approved' }), 'vendor_request_information', JSON.stringify({ id: TICKET, reason: 'Upload your SSM certificate' }))).toEqual({ error: 'pending vendor not found' });
  });

  it('sends the item version with a catalogue decision and needs a note unless approving', async () => {
    const item = { id: TICKET, name: 'Cendol', review_status: 'pending_review', updated_at: '2026-11-01T10:00:00+00:00' };
    expect(await proposeAction(fakeDb(item), 'review_catalogue_item', JSON.stringify({ type: 'product', id: TICKET, decision: 'approve' })))
      .toMatchObject({ request: { body: { entityType: 'product', action: 'approve', expectedVersion: item.updated_at } }, link: '/admin/catalogue' });
    expect(await proposeAction(fakeDb(item), 'review_catalogue_item', JSON.stringify({ type: 'product', id: TICKET, decision: 'reject' })))
      .toEqual({ error: 'a note of at least 10 characters is required unless approving' });
  });

  it('sends the recommendation version with a change request', async () => {
    const card = await proposeAction(fakeDb({ id: TICKET, vendor_name: 'Kopi Co', status: 'pending', updated_at: '2026-11-02T00:00:00+00:00' }), 'recommendation_request_changes', JSON.stringify({ id: TICKET, customerMessage: 'Please add the opening hours.' }));
    expect(card).toMatchObject({ request: { body: { recommendationId: TICKET, expectedVersion: '2026-11-02T00:00:00+00:00', action: 'request_changes' } } });
  });

  it('closes a chat report with the stated outcome and reason', async () => {
    const card = await proposeAction(fakeDb({ id: TICKET, reason: 'harassment', status: 'open' }), 'resolve_chat_report', JSON.stringify({ id: TICKET, outcome: 'dismissed', reason: 'no_violation' }));
    expect(card).toMatchObject({ request: { method: 'PATCH', body: { status: 'dismissed', resolution_reason: 'no_violation' } } });
  });

  it('pauses only a running event ad and resumes only a paused one', async () => {
    expect(await proposeAction(fakeDb({ id: TICKET, title: 'Ad', status: 'paid' }), 'set_event_ad_paused', JSON.stringify({ id: TICKET, paused: true }))).toMatchObject({ request: { body: { action: 'pause' } } });
    expect(await proposeAction(fakeDb({ id: TICKET, title: 'Ad', status: 'paid' }), 'set_event_ad_paused', JSON.stringify({ id: TICKET, paused: false }))).toEqual({ error: 'paused ad not found' });
  });

  it('changes a booth number with the stall version', async () => {
    const card = await proposeAction(fakeDb({ id: TICKET, status: 'approved', stall_number: 'A1', updated_at: '2026-11-03T00:00:00+00:00', vendors: { name: 'Kopi Co' } }), 'change_stall_number', JSON.stringify({ id: TICKET, stallNumber: 'B2' }));
    expect(card).toMatchObject({ details: [{ field: 'vendor', value: 'Kopi Co' }, { field: 'stallNumber', value: 'A1 to B2' }], request: { body: { stallNumber: 'B2', expectedUpdatedAt: '2026-11-03T00:00:00+00:00' } } });
  });
});

describe('admin AI record lists', () => {
  it('lists only items an on or off action applies to', async () => {
    const filters: unknown[][] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit']) chain[m] = () => chain;
    chain.eq = (...args: unknown[]) => { filters.push(args); return chain; };
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    await listRecords({ from: () => chain } as never, 'hotel_amenities', undefined, false);
    expect(filters).toEqual([['is_active', false]]);
    filters.length = 0;
    await listRecords({ from: () => chain } as never, 'hotel_amenities');
    expect(filters).toEqual([]);
  });

  it('builds an on/off table whose rows only target the existing toggle routes', async () => {
    const table = await buildChoiceList(fakeDb(null, [{ code: 'wifi', label_en: 'Free Wi-Fi', is_active: false }]), 'hotel_amenities', false);
    expect(table).toMatchObject({
      action: 'set_hotel_amenity_active',
      rows: [{ key: 'wifi', label: 'Free Wi-Fi', active: false, request: { method: 'PATCH', url: '/api/admin/hotel-amenities', body: { code: 'wifi' } } }],
    });
    expect(await buildChoiceList(fakeDb(null), 'open_tickets')).toEqual({ error: 'unknown kind' });
  });

  it('refuses a card that would change nothing', async () => {
    expect(await proposeAction(fakeDb({ code: 'wifi', label_en: 'Free Wi-Fi', is_active: true }), 'set_hotel_amenity_active', JSON.stringify({ code: 'wifi', active: true }))).toEqual({ error: 'already on' });
    expect(await proposeAction(fakeDb({ code: 'wifi', label_en: 'Free Wi-Fi', is_active: true }), 'set_hotel_amenity_active', JSON.stringify({ code: 'wifi', active: false }))).toMatchObject({ action: 'set_hotel_amenity_active' });
  });

  it('withholds ticket text that may hold personal details', async () => {
    const result = await listRecords(fakeDb(null, [
      { id: TICKET, subject: 'Call me on 012-3456789', category: 'payment', status: 'open', created_at: '2026-11-10T00:00:00Z' },
      { id: TICKET, subject: 'Voucher not applied', category: 'booking', status: 'open', created_at: '2026-11-10T00:00:00Z' },
    ]), 'open_tickets');
    const tickets = result.tickets as { subject: string }[];
    expect(tickets[0].subject).toContain('withheld');
    expect(tickets[1].subject).toBe('Voucher not applied');
  });

  it('lets record ids through the staff privacy check', async () => {
    const { prepareStaffQuestionText } = await import('@/lib/chatbot/pii');
    expect(prepareStaffQuestionText(`close ticket ${TICKET}`)).toEqual({ allowed: true, clean: `close ticket ${TICKET}`, found: false });
    expect(prepareStaffQuestionText(`close ticket ${TICKET}, call 012-3456789`).allowed).toBe(false);
  });
});
