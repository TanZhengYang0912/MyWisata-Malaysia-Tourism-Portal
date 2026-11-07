import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findElements, findOne, installTestDom, TestEvent, TestElement, type TestDocument } from '@/components/shared/__tests__/render-test-dom';

vi.mock('react-i18next', () => {
  const t = (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${JSON.stringify(values)}` : ''}`;
  return { useTranslation: () => ({ t, i18n: { language: 'en', exists: () => true } }) };
});
vi.mock('@/components/providers/app-dialog', () => ({ useAppDialog: () => ({ prompt: vi.fn(async () => 'Verified customer absence and vendor contact attempts'), confirm: vi.fn(async () => true) }) }));
// The platform funds panel loads its own data and has its own tests.
vi.mock('@/components/admin/platform-funds-panel', () => ({ PlatformFundsPanel: () => null }));
import ReconciliationPage from '@/app/admin/reports/reconciliation/page';

let createRoot: typeof import('react-dom/client').createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import('react-dom/client').createRoot>;
const rows = Array.from({ length: 16 }, (_, i) => ({
  orderId: `order-${i}`, orderDisplayId: `ORD-${String(i + 1).padStart(2, '0')}`, status: 'paid', paidAt: null,
  grossSen: 100, platformFeeSen: 10, vendorNetSen: 90, affiliatePayoutSen: 0,
  recommendationPayoutSen: 0, platformNetSen: 10, platformNetNegative: false,
}));
async function click(button: TestElement) {
  await act(async () => { button.dispatchEvent(new TestEvent('click', { bubbles: true })); });
}
async function change(select: TestElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value')?.set?.call(select, value); select.dispatchEvent(new TestEvent(select.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
function bodyRows() { return findElements(findOne(container, e => e.tagName === 'TBODY'), e => e.tagName === 'TR'); }
function mobileCards() { return findElements(container, e => e.getAttribute('data-admin-mobile-record-card') !== null); }
function button(label: string) { return findOne(container, e => e.tagName === 'BUTTON' && e.getAttribute('aria-label') === label); }

describe('financial reconciliation pagination', () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import('react-dom/client'));
    Object.defineProperty(TestElement.prototype, 'click', { configurable: true, value() {} });
  });
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: {
      rows, totals: {}, eventOperations: { cases: [], summary: { open: 0, unassigned: 0, undated: 0, overdue: 0, outstandingSen: 0 },
        jobs: [], total: 0, matchingOutstandingSen: 0, page: 1, pageSize: 25 },
    } }) })));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => { root.render(<ReconciliationPage />); await new Promise(resolve => setTimeout(resolve, 0)); });
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows 15 rows, places the 16th on page two, and keeps full matching sums and CSV', async () => {
    expect(bodyRows().length).toBe(15);
    expect(mobileCards().length).toBe(15);
    expect(mobileCards()[0].textContent).toContain('ORD-01');
    expect(mobileCards()[0].textContent).toContain('reconciliation.columns.gross');
    expect(mobileCards()[0].textContent).toContain('RM1.00');
    expect(mobileCards()[0].textContent).toContain('reconciliation.columns.platformNet');
    expect(bodyRows().map(e => e.textContent).join(' ')).not.toContain('ORD-16');
    const grossCard = findOne(container, e => e.tagName === 'P' && e.textContent === 'reconciliation.metrics.gross').parentNode;
    expect(grossCard?.textContent).toContain('RM16.00');
    await click(button('accessibility.nextPage'));
    expect(bodyRows().length).toBe(1);
    expect(bodyRows()[0].textContent).toContain('ORD-16');
    expect(button('accessibility.nextPage').disabled).toBe(true);
    expect(container.textContent).toContain('"page":2,"total":2');
    let csv: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { csv = blob as Blob; return 'blob:verification'; });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    await click(findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('reconciliation.exportCsv')));
    const exported = await csv!.text();
    expect(exported.trim().split('\n')).toHaveLength(17);
    expect(exported).toContain('ORD-01');
    expect(exported).toContain('ORD-16');
  });

  it('clamps a later page after refreshed matching rows shrink', async () => {
    await click(button('accessibility.nextPage'));
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ data: {
      rows: rows.slice(0, 2), totals: {}, eventOperations: { cases: [], summary: { open: 0, unassigned: 0, undated: 0, overdue: 0, outstandingSen: 0 },
        jobs: [], total: 0, matchingOutstandingSen: 0, page: 1, pageSize: 25 },
    } }) } as Response);
    await click(findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('reconciliation.reload')));
    expect(bodyRows().length).toBe(2);
    expect(container.textContent).toContain('\"page\":1,\"total\":1');
    expect(bodyRows()[0].textContent).toContain('ORD-01');
  });

  it('returns to page one when page size or filters change and does not leave an empty later page', async () => {
    await click(button('accessibility.nextPage'));
    const size = findOne(container, e => e.tagName === 'SELECT' && e.getAttribute('aria-label') === 'staffConduct.filters.perPageAriaLabel');
    expect(size.options.map(o => o.value)).toEqual(['15', '25', '50']);
    await change(size, '25');
    expect(bodyRows().length).toBe(16);
    expect(container.textContent).toContain('"page":1,"total":1');
    await change(size, '15');
    await click(button('accessibility.nextPage'));
    await change(findOne(container, e => e.tagName === 'SELECT' && e.getAttribute('aria-label') === 'reconciliation.metrics.platformNet'), 'zero');
    expect(findElements(container, e => e.tagName === 'TBODY')).toHaveLength(0);
    expect(container.textContent).toContain('reconciliation.filters.noMatches');
    expect(container.textContent).toContain('"page":1,"total":1');
    await change(findOne(container, e => e.tagName === 'SELECT' && e.getAttribute('aria-label') === 'reconciliation.metrics.platformNet'), 'all');
    expect(bodyRows().length).toBe(15);
    expect(bodyRows()[0].textContent).toContain('ORD-01');
  });
  it('shows overdue pickup evidence and sends an explicit owned no-show decision', async () => {
    const pickupCase = { id: 'case-private', version: 4, kind: 'pickup_overdue', reasonCode: 'pickup_outcome_unconfirmed', orderNumber: 'ORD-PICKUP', orderId: 'order-private',
      assignedName: 'Reviewer', assigned: true, isMine: true, dueAt: null, createdAt: null, overdue: false, refundStatus: null, refundId: null,
      outstandingSen: 1200, state: 'open', handling: 'needs_review', resolvedAt: null, refundCompleted: false,
      pickupItems: [{ name: 'Drink', quantity: 3, pickupDate: '2026-10-10', status: 'pending', vendorName: 'Vendor One', pickupLabel: 'Main Hall · 10:00–12:00' }] };
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ data: { rows, totals: {}, eventOperations: {
      cases: [pickupCase], summary: {open:1,unassigned:0,undated:1,overdue:0,outstandingSen:1200},jobs:[],total:1,matchingOutstandingSen:1200,page:1,pageSize:25,
    } } }) } as Response);
    await click(findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('reconciliation.reload')));
    expect(container.textContent).toContain('eventOperations.pickupOverdue');
    expect(container.textContent).toContain('3 × Drink');
    expect(container.textContent).not.toContain('case-private');
    await click(findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('eventOperations.confirmNoShow')));
    const action = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).includes('event-exceptions/case-private') && options?.method === 'POST');
    expect(JSON.parse(String(action?.[1]?.body))).toEqual({ action: 'confirm_no_show', version: 4, note: 'Verified customer absence and vendor contact attempts' });
  });

  it('disables claims until a future Malaysia deadline is selected and retains rows after an action error', async () => {
    const pickupCase = { id: 'case-deadline', version: 1, kind: 'pickup_overdue', orderNumber: 'ORD-DEADLINE',
      assigned: false, isMine: false, assignedName: null, state: 'open', handling: 'needs_review', outstandingSen: 1200,
      dueAt: null, overdue: false, refundId: null, refundCompleted: false };
    const response = { ok: true, json: async () => ({ data: { rows, totals: {}, eventOperations: {
      cases: [pickupCase],summary:{open:1,unassigned:1,undated:1,overdue:0,outstandingSen:1200},jobs:[],total:1,matchingOutstandingSen:1200,page:1,pageSize:25,
    } } }) } as Response;
    vi.mocked(fetch).mockResolvedValue(response);
    await click(findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('reconciliation.reload')));
    const claim = () => findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('eventOperations.claim'));
    const deadline = findOne(container, e => e.tagName === 'INPUT' && e.type === 'datetime-local');
    expect(claim().disabled).toBe(true);
    await click(claim());
    expect(vi.mocked(fetch).mock.calls.some(([,options]) => options?.method === 'POST')).toBe(false);
    expect(container.textContent).toContain('ORD-DEADLINE');
    const localTime = (delta: number) => new Date(Date.now() + 8*60*60*1000 + delta).toISOString().slice(0,16);
    await change(deadline, localTime(-60*60*1000));
    expect(claim().disabled).toBe(true);
    await change(deadline, '2026-02-30T12:00');
    expect(claim().disabled).toBe(true);
    await change(deadline, localTime(60*60*1000));
    expect(claim().disabled).toBe(false);
    await change(deadline, '');
    expect(claim().disabled).toBe(true);
    await change(deadline, localTime(60*60*1000));
    vi.mocked(fetch).mockResolvedValueOnce({ok:false} as Response);
    await click(claim());
    expect(container.textContent).toContain('eventOperations.conflict');
    expect(container.textContent).toContain('ORD-DEADLINE');
    expect(bodyRows()).toHaveLength(15);
    expect(container.textContent).toContain('RM16.00');
  });

  it('still blocks stale financial display and export after a real report load failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({error:{message:'Report unavailable'}})} as Response);
    await click(findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('reconciliation.reload')));
    expect(container.textContent).toContain('Report unavailable');
    expect(findElements(container, e => e.tagName === 'TBODY')).toHaveLength(0);
    expect(findOne(container, e => e.tagName === 'BUTTON' && e.textContent.includes('reconciliation.exportCsv')).disabled).toBe(true);
  });

});
