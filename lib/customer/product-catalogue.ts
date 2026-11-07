import type { ComputedActivity, OperatingHours } from '@/backend/core/types';
import type { VendorProductCardData } from '@/lib/customer/vendor-page';

export type ProductCatalogueOrderItem = { id: string; name: string };
export type ProductSalesSummary = { outletCount: number; fromPrice: number };
export type ProductCatalogueCardData = {
  id: string; vendorId: string; name: string; description: string | null;
  productType: string | null; imageUrl: string | null;
  requiresBooking: boolean; rating: number; reviews: number;
  sales: ProductSalesSummary;
  singleOutlet?: { id: string; city: string | null; state: string | null; operatingHours: OperatingHours | null };
  /** Home/Explore only: a paid placement and/or the merchant's ⭐ pick. Vendor-page cards never carry them. */
  sponsored?: boolean;
  featured?: boolean;
  openNowSummary?: { totalOutletCount: number; openOutletCount: number };
  /** The open outlet an Open now result was priced from; the card link preselects it. */
  pinnedOutletId?: string;
  /** Set when the card stands for one outlet's offer: the drawer names that outlet instead of counting locations. */
  pinnedOutletName?: string;
};

/** The merchant's ⭐ pick; the featured-products save route keeps this tag in sync. */
export function isMerchantFeatured(product: { tags?: string[] | null }): boolean {
  return product.tags?.includes('featured') ?? false;
}

export function toVendorCatalogueCard(product: VendorProductCardData): ProductCatalogueCardData {
  const outlets = new Map<string, VendorProductCardData['soldAt'][number]>();
  for (const outlet of product.soldAt) {
    if (!Number.isFinite(outlet.price) || outlet.price < 0) continue;
    const existing = outlets.get(outlet.id);
    if (!existing || outlet.price < existing.price) outlets.set(outlet.id, outlet);
  }
  const valid = [...outlets.values()];
  const singleOutlet = valid.length === 1 ? valid[0] : undefined;
  return {
    id: product.id, vendorId: product.vendorId, name: product.name,
    description: product.description, productType: product.productType, imageUrl: product.imageUrl,
    requiresBooking: product.requiresBooking, rating: product.rating, reviews: product.reviews,
    sales: { outletCount: valid.length, fromPrice: valid.length ? Math.min(...valid.map((outlet) => outlet.price)) : product.fromPrice },
    ...(singleOutlet ? { singleOutlet } : {}),
  };
}

export function toDiscoveryCatalogueCard(product: ComputedActivity & { sponsorship?: { placementId: string } | null }, { labels = true }: { labels?: boolean } = {}): ProductCatalogueCardData {
  const sales = product.salesSummary ?? { outletCount: 1, fromPrice: product.price };
  const card: ProductCatalogueCardData = {
    id: product.id, vendorId: product.vendorId ?? product.outlet.vendorId, name: product.name,
    description: product.description, productType: product.categorySlug ?? null, imageUrl: product.image,
    requiresBooking: product.requiresBooking, rating: product.rating, reviews: product.reviews, sales,
    sponsored: labels && Boolean(product.sponsorship), featured: labels && isMerchantFeatured(product),
    ...(product.openNowSummary ? { openNowSummary: product.openNowSummary, pinnedOutletId: product.outlet.id } : {}),
    ...(sales.outletCount === 1 && product.outlet.verified ? { singleOutlet: { id: product.outlet.id, city: product.outlet.city, state: product.outlet.state, operatingHours: product.outlet.operatingHours ?? null } } : {}),
  };
  return card;
}

/** A related-row card: one outlet's exact offer, unlabelled, linking to that outlet. */
export function toOutletCatalogueCard(product: ComputedActivity): ProductCatalogueCardData {
  return { ...toDiscoveryCatalogueCard(product, { labels: false }), openNowSummary: undefined, sales: { outletCount: 1, fromPrice: product.price }, pinnedOutletId: product.outlet.id, pinnedOutletName: product.outlet.name };
}

const nameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function orderProductCatalogue<T extends ProductCatalogueOrderItem>(
  products: readonly T[], featuredIds: readonly string[] = [],
): T[] {
  const unique = new Map<string, T>();
  for (const product of products) {
    if (!unique.has(product.id)) unique.set(product.id, product);
  }
  const featured: T[] = [];
  for (const id of featuredIds) {
    const product = unique.get(id);
    if (product) {
      featured.push(product);
      unique.delete(id);
    }
  }
  return [...featured, ...Array.from(unique.values()).sort((left, right) =>
    nameCollator.compare(left.name, right.name) || left.id.localeCompare(right.id, 'en'))];
}
