import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(resolve(process.cwd(), 'app/api/customer/orders/route.ts'), 'utf8');
const pageSource = readFileSync(resolve(process.cwd(), 'app/customer/orders/page.tsx'), 'utf8');

describe('customer order list references', () => {
  it('searches and displays the complete public reference with UUID fallback', () => {
    expect(pageSource).toContain('formatOrderReference(order.id, order.displayId)');
    expect(pageSource).toContain('order.displayId');
    expect(pageSource).not.toContain('shortOrderId(order.id)');
  });

  it('returns to the first page when the order filters change or clear', () => {
    expect(pageSource).toContain('setStatus(event.target.value as OrderFilterStatus); setPage(1);');
    expect(pageSource).toContain('setQuery(event.target.value); setPage(1);');
    expect(pageSource).toContain('function clearFilters() { setPage(1);');
  });

  it('uses Malaysia calendar boundaries and renders order dates in MYT', () => {
    expect(routeSource).toContain("malaysiaCalendarDateToIso(input.from, 'start')");
    expect(routeSource).toContain("malaysiaCalendarDateToIso(input.to, 'end')");
    expect(pageSource).toContain('timeZone: "Asia/Kuala_Lumpur"');
    expect(pageSource).toContain('ui.orders.invalidDateRange');
  });
});
