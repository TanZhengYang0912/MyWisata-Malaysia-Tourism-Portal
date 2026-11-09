import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'app/admin/orders/page.tsx'), 'utf8');

describe('Admin orders page contract', () => {
  it('loads paginated orders and restricts mutations to the approved scoped shortage flow', () => {
    expect(page).toContain('/api/admin/orders?');
    expect(page).toContain("cache: 'no-store'");
    expect(page).toContain('AdminPageShell');
    expect(page).toContain('AdminFilterBar');
    expect(page).toContain('href={`/admin/orders/${order.id}?returnTo=');
    expect(page).toContain('encodeURIComponent(`/admin/orders?search=');
    const mutations = [...page.matchAll(/fetch\(['"]([^'"]+)['"],\s*\{\s*method:\s*['"](POST|PATCH|PUT|DELETE)['"]/g)];
    expect(mutations).toHaveLength(2);
    expect(mutations.map(match => [match[1], match[2]])).toEqual([
      ['/api/admin/orders/event-shortage', 'POST'],
      ['/api/admin/orders/event-shortage', 'POST'],
    ]);
    expect(page).toContain('body.data.version');
    expect(page).toContain('confirm(');
    expect(page).not.toContain('/financial-outcome');
  });

  it('keeps order identity, customer, items, payment, total, date, and actions in mobile cards', () => {
    expect(page).toContain('AdminMobileRecordCard');
    expect(page).toContain('lg:hidden');
    expect(page).toContain('lg:block');
    expect(page).toContain('orderOperations.customer');
    expect(page).toContain('orderOperations.fulfilment');
    expect(page).toContain('orderOperations.payment');
    expect(page).toContain('resolveShortage(item)');
    expect(page).toContain('openGuestContactCorrection(order)');
    expect(page).toContain('orderOperations.created');
  });
});
