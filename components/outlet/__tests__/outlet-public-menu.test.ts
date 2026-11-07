import { describe, expect, it } from 'vitest';
import { selectFullOutletMenu } from '@/lib/customer/outlet-shop';

describe('public outlet menu', () => {
  it("keeps the Vendor shop preview read-only", async () => {
    const source = await import("node:fs").then(({ readFileSync }) => readFileSync("components/vendor/outlet-shop-preview.tsx", "utf8"));

    expect(source).toContain("canUseCustomerActions={false}");
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
    expect(source).toContain('outletId=${encodeURIComponent(outletId)}');
    expect(source).toContain('returnTo=${encodeURIComponent(`/customer/outlets/${outletId}`)}');
  });

  it('uses the professional four-column card treatment for public outlet menus', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('xl:grid-cols-4');
    expect(source).toContain('aspect-[4/3]');
    expect(source).toContain('t("ui.outletMenu.availableAt"');
  });

  it("shows the existing photo fallback when a product image URL fails", async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    const card = source.slice(source.indexOf('export function OutletProductCard'), source.indexOf('export function OutletMenu'));

    expect(card).toContain('onError={() => setFailedImageUrl(imageUrl)}');
    expect(card).toContain('failedImageUrl !== imageUrl');
    expect(card).toContain('fallbackImage(t("ui.outlet.photoComingSoon"))');
  });

  it('shows only essential product details while preserving save and purchase actions', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    const card = source.slice(
      source.indexOf('export function OutletProductCard'),
      source.indexOf('export function OutletMenu'),
    );
    const menu = source.slice(source.indexOf('export function OutletMenu'));

    expect(card).toContain('productDetailHref(product.id, outlet.id)');
    expect(card).toContain('ProductSaveButton productId={product.id}');
    expect(card).toContain('formatMYRNumber(Number(product.base_price))');
    expect(card).toContain('getOutletProductAction');
    expect(card).toContain('<CartActions outlet={outlet} product={product} />');
    expect(card).toContain('ui.outletMenu.chooseTime');
    expect(card).not.toContain('categoryLabel');
    expect(card).not.toContain('product.featured');
    expect(card).not.toContain('ui.outletMenu.availableAt');
    expect(card).not.toContain('ratingLabel');
    expect(card).not.toContain('ui.cart.inStock');
    expect(card).not.toContain('ui.cart.outOfStock');
    expect(menu).not.toContain('ui.labels.mylawatanOutlet');
    expect(menu).not.toContain('ui.outletMenu.listingCount');
  });

  it('keeps public menu cards focused on product facts without descriptive copy', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    const card = source.slice(
      source.indexOf('export function OutletProductCard'),
      source.indexOf('export function OutletMenu'),
    );

    expect(card).not.toContain('line-clamp-2');
    expect(card).not.toContain('truncate');
    expect(card).toContain('break-words text-base font-bold leading-snug text-foreground');
    expect(card).not.toContain('ui.outletMenu.availableAt');
    expect(card).toContain('formatMYRNumber(Number(product.base_price))');
    expect(card).not.toContain('product.description');
    expect(card).not.toContain('descriptionFallback');

    const menu = source.slice(source.indexOf('export function OutletMenu'));
    expect(menu).not.toContain('t("ui.outletMenu.description")');
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
    expect(card).toMatch(/action\.kind === "cart" \? \(\s*canUseCustomerActions && <CartActions outlet=\{outlet\} product=\{product\} \/>/);
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
});
