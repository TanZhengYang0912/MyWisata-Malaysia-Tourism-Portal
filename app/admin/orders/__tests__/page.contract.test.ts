import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(resolve(process.cwd(), 'app/admin/orders/page.tsx'), 'utf8');
const shortageReason = readFileSync(resolve(process.cwd(), 'app/admin/orders/shortage-reason.ts'), 'utf8');

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

  it('offers preset shortage reasons and only asks for manual text for Other', () => {
    expect(page).not.toContain("prompt(t('eventOperations.shortageReason'))");
    expect(page).toContain('createEventShortageReason(');
    expect(page).toContain("shortageReasonCode === 'other'");
    expect(page).toContain('minLength={5}');
    expect(page).toContain('maxLength={500}');
    expect(shortageReason).toContain('shortageReasonOptions.supplierUnavailable');
    expect(shortageReason).toContain('shortageReasonOptions.inventoryMismatch');
    expect(shortageReason).toContain('shortageReasonOptions.itemDamagedOrLost');
    expect(shortageReason).toContain('shortageReasonOptions.restockDelayed');
  });

  it('keeps order identity, customer, items, payment, total, date, and actions in mobile cards', () => {
    expect(page).toContain('AdminMobileRecordCard');
    expect(page).toContain('lg:hidden');
    expect(page).toContain('lg:block');
    expect(page).toContain('orderOperations.customer');
    expect(page).toContain('orderOperations.fulfilment');
    expect(page).toContain('orderOperations.payment');
    expect(page).toContain('openShortageDialog(item)');
    expect(page).toContain('openGuestContactCorrection(order)');
    expect(page).toContain('orderOperations.created');
  });

  it('searches and selects vendors without losing combined filters or pagination behavior', () => {
    expect(page).toContain('/api/admin/orders/vendors?search=');
    expect(page).toContain('params.set(\'vendorId\', selectedVendor.id)');
    expect(page).toContain('setSelectedVendor(vendor)');
    expect(page).toContain('setSelectedVendor(null)');
    expect(page).toContain('setPage(1)');
    expect(page).toContain('role="status"');
    expect(page).toContain('orderOperations.vendorFilter');
    expect(page).toContain('orderOperations.vendorSearchPlaceholder');
    expect(page).toContain('orderOperations.clearVendorFilter');
    expect(page).toContain('role="combobox"');
    expect(page).toContain('role="listbox"');
    expect(page).toContain('role="option"');
    expect(page).toContain("event.key === 'ArrowDown'");
    expect(page).toContain("event.key === 'ArrowUp'");
    expect(page).toContain("event.key === 'Enter'");
    expect(page).toContain('Pagination currentPage={page} totalPages={pageCount} totalItems={total} pageSize={PAGE_SIZE}');
  });
});
