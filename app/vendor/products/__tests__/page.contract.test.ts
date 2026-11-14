import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(process.cwd(), 'app/vendor/products/page.tsx'), 'utf8');

describe('vendor products save contract', () => {
  it('clears the stale selected product after the edit form saves successfully', () => {
    const successCallback = pageSource.match(/onSuccess=\{\(\) => \{([\s\S]*?)\}\s+onClose=/)?.[1] || '';

    expect(successCallback).toContain('setShowForm(false)');
    expect(successCallback).toContain('setEditingProduct(null)');
    expect(successCallback).toContain('setSelectedProduct(null)');
    expect(successCallback).toContain('loadProducts(pagination.page)');
  });

  it('limits live inventory updates to the vendor outlets', () => {
    const inventorySubscriptions = pageSource.match(/table: 'inventory'[^}]*\}/g) || [];

    expect(inventorySubscriptions).toHaveLength(1);
    expect(inventorySubscriptions[0]).toContain('filter: `outlet_id=in.(${');
  });

  it('uses locale keys instead of inline translation defaults', () => {
    expect(pageSource).not.toContain('defaultValue');
  });

  it('opens the product form from the Outlet Manager create shortcut', () => {
    expect(pageSource).toContain('useSearchParams');
    expect(pageSource).toMatch(/searchParams\.get\(["']create["']\)/);
    expect(pageSource).toContain('canManageOutlet');
    expect(pageSource).toContain('setShowForm(true)');
  });
});
