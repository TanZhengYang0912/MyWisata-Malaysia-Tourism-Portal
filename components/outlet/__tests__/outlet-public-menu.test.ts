import { describe, expect, it } from 'vitest';
import { selectFullOutletMenu } from '@/lib/customer/outlet-shop';

describe('public outlet menu', () => {
  it("keeps the Vendor shop preview read-only: save and share need the customer wishlist, which the preview never mounts", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("components/vendor/outlet-shop-preview.tsx", "utf8")).not.toContain("WishlistProvider");
    expect(readFileSync("components/customer/product-save-button.tsx", "utf8")).toContain("if (!wishlist) return null;");
    expect(readFileSync("components/customer/product-card.tsx", "utf8")).toContain("{wishlist && <ShareButton");
  });
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
    expect(source).toContain('pinnedOutletId: outlet.id');
    expect(source).toContain('returnTo={`/customer/outlets/${outlet.id}`}');
  });
  it('uses the shared ProductCard in the four-column public outlet menu', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('xl:grid-cols-4');
    expect(source).toContain('<ProductCard');
    expect(source).toContain('t("ui.outletMenu.availableAt"');
  });
  it('has no card-level Add to cart or Buy buttons; buying happens on the product page', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    const menu = source.slice(source.indexOf('export function OutletMenu'));
    expect(source).not.toContain('CartActions');
    expect(source).not.toContain('useCart');
    expect(source).not.toContain('getOutletProductAction');
    expect(source).toContain('fromPrice: Number(product.base_price)');
    expect(menu).not.toContain('ui.labels.mylawatanOutlet');
    expect(menu).not.toContain('ui.outletMenu.listingCount');
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

  it('shows the current outlet position when the vendor has multiple outlets', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/public-outlet-page.tsx', 'utf8'));
    expect(source).toContain('t("strictMigration.outletNavigation.position"');
    expect(source).toContain('t("strictMigration.outletNavigation.viewAll"');
  });

  it('scopes public inventory, variants, and booking slots to the current outlet', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/public-outlet-page.tsx', 'utf8'));

    expect(source).toContain('inventory(outlet_id,quantity,reserved)');
    expect(source).toContain('.eq("outlet_id", outletId)');
    expect(source).toContain('product_variants(id,name,price_offset,is_default,is_active,inventory');
    expect(source).toContain('getActiveDefaultOutletVariant(variants, outletScopedVariant)');
    expect(source).toContain('const outletScopedVariant = product.requires_booking || product.product_type === "digital" ? undefined : outletId;');
    expect(source).toContain('getOutletVariantPrice(outletPrice, purchaseVariant?.price_offset)');
    expect(source).toContain('getOutletAvailableStock(variants, outletId)');
  });

  it('does not load product ratings that the compact public cards do not display', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('app/customer/vendor/[vendorId]/outlet/[outletId]/page.tsx', 'utf8'));
    expect(source).not.toContain('product_review_metrics');
    expect(source).not.toContain('metricByProduct');
  });

  it('loads the menu cards\' product ratings in one batched lookup', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/public-outlet-page.tsx', 'utf8'));
    expect(source.match(/getScopeRatingSummaries\("product"/g)).toHaveLength(1);
    expect(source).toContain('rating: productRatings?.get(product.id)?.value ?? 0');
  });
});
