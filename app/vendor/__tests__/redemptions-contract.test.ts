import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getVendorNavigationSections } from '@/lib/vendor/navigation';

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Vendor redemptions and scan history contract', () => {
  it('exposes a redemptions workspace with audit log and export features', () => {
    const page = read('app/vendor/redemptions/page.tsx');
    expect(page).toContain('VendorRedemptionsPage');
    expect(page).toContain('handleExportCsv');
    expect(page).toContain('/api/vendors/${vendorId}/redemptions');
    expect(page).toContain('copyToClipboard');
  });

  it('uses a bounded, authorized database projection for redemption history', () => {
    const route = read('app/api/vendors/[vendorId]/redemptions/route.ts');
    expect(route).toContain('authorizeVendor');
    expect(route).toContain("rpc('list_vendor_redemption_history'");
    expect(route).toContain('p_scope_outlet_ids: outletIds');
    expect(route).toContain("'retail_pickup'");
    expect(route).toContain('apiOk');
    expect(route).not.toContain('.range(');
  });

  it('keeps redemptions in Vendor Owner navigation and scanner in Outlet Manager navigation', () => {
    const ownerLinks = getVendorNavigationSections(false).flatMap((section) => section.items.map((item) => item.href));
    const outletManagerLinks = getVendorNavigationSections(true).flatMap((section) => section.items.map((item) => item.href));
    expect(ownerLinks).toContain('/vendor/redemptions');
    expect(ownerLinks).not.toContain('/vendor/scanner');
    expect(outletManagerLinks).toContain('/vendor/scanner');
    expect(outletManagerLinks).not.toContain('/vendor/redemptions');
  });
});
