import { describe, expect, it } from 'vitest';
import { selectFullOutletMenu } from '@/lib/customer/outlet-shop';

describe('public outlet menu', () => {
  it('keeps all sellable products while putting configured featured products first', () => {
    const products = [
      { id: 'product-a', name: 'A', featured: false },
      { id: 'product-b', name: 'B', featured: false },
      { id: 'product-c', name: 'C', featured: false },
    ];

    expect(selectFullOutletMenu(products, ['product-c'])).toEqual([
      { id: 'product-c', name: 'C', featured: true },
      { id: 'product-a', name: 'A', featured: false },
      { id: 'product-b', name: 'B', featured: false },
    ]);
  });

  it('keeps product details tied to the outlet that owns the purchase context', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('outletId=${encodeURIComponent(outletId)}');
    expect(source).toContain('returnTo=${encodeURIComponent(`/customer/outlet/${outletId}`)}');
  });

  it('uses the professional four-column card treatment for public outlet menus', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('xl:grid-cols-4');
    expect(source).toContain('aspect-[4/3]');
    expect(source).toContain('t("ui.outletMenu.availableAt"');
  });

  it('shows complete product and outlet text on public menu cards', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    const card = source.slice(
      source.indexOf('export function OutletProductCard'),
      source.indexOf('export function OutletMenu'),
    );

    expect(card).not.toContain('line-clamp-2');
    expect(card).not.toContain('truncate');
    expect(card).toContain('break-words text-base font-bold leading-snug text-foreground');
    expect(card).toContain('mt-3 min-h-10 break-words text-sm leading-5 text-muted-foreground');
    expect(card).toContain('inline-flex min-w-0 flex-1 items-start gap-1.5 break-words');
    expect(card).toContain('{product.description || descriptionFallback}');
  });

  it('keeps short menus from leaving a wide empty panel', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('products.length <= 2');
    expect(source).toContain('max-w-3xl');
  });

  it('passes the current outlet name to the interpolated menu heading', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    const menu = source.slice(source.indexOf('export function OutletMenu'));
    expect(menu).toContain('t("ui.outletMenu.availableAt", { outlet: outlet.name })');
  });

  it('uses one detail link when a product is not ready for direct purchase', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('t(action.reason === "slot_required" ? "ui.outletMenu.chooseTime"');
    expect(source).not.toContain('disabled={Boolean(working) || action.kind !== "cart"}');
  });

  it('mounts the customer capability gate only for cart-capable cards', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    const card = source.slice(
      source.indexOf('export function OutletProductCard'),
      source.indexOf('export function OutletMenu'),
    );

    expect(source).toContain('function CartActions');
    expect(card).not.toContain('useCustomerCapabilityGate');
    expect(card).toMatch(/action\.kind === "cart" \? \(\s*<CartActions outlet=\{outlet\} product=\{product\} \/>/);
  });

  it('shows the current outlet position when the vendor has multiple outlets', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('app/customer/vendor/[vendorId]/outlet/[outletId]/page.tsx', 'utf8'));
    expect(source).toContain('t("strictMigration.outletNavigation.position"');
    expect(source).toContain('t("strictMigration.outletNavigation.viewAll"');
  });
});
