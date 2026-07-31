import type { SupabaseClient } from '@supabase/supabase-js';
import type { OutletPageDocument } from '@/lib/vendor/outlet-page-schema';

type OutletSummary = { id: string; name?: string | null };

export type ProductOutletCandidate = {
  outlet_id: string | null;
  status?: string | null;
  outlets?: OutletSummary | OutletSummary[] | null;
  outlet_offers?: Array<{
    outlet_id: string;
    status?: string | null;
    outlets?: OutletSummary | OutletSummary[] | null;
  }> | null;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function resolveProductOutlet(product: ProductOutletCandidate, outletIds: string[]): OutletSummary | null {
  const allowed = new Set(outletIds);
  const directOutlet = relation(product.outlets);
  if (product.outlet_id && allowed.has(product.outlet_id)) return directOutlet || { id: product.outlet_id };

  const offer = (product.outlet_offers || []).find((candidate) => allowed.has(candidate.outlet_id) && candidate.status !== 'inactive');
  return offer ? relation(offer.outlets) || { id: offer.outlet_id } : null;
}

export function isVisibleActiveProduct(product: ProductOutletCandidate, outletIds: string[]) {
  return product.status === 'active' && resolveProductOutlet(product, outletIds) !== null;
}

export function isRatingEligibleProduct(product: ProductOutletCandidate, outletIds: string[]) {
  return isVisibleActiveProduct(product, outletIds);
}

export function filterProductsByOutlet<T extends ProductOutletCandidate>(products: T[], outletId: string): T[] {
  return products.filter((product) => resolveProductOutlet(product, [outletId]) !== null);
}

export function sanitizeOutletPageProductSelections(
  document: OutletPageDocument,
  availableProductIds: Set<string>,
): OutletPageDocument {
  return {
    ...document,
    featuredIds: document.featuredIds.filter((id) => availableProductIds.has(id)),
    blocks: document.blocks.map((block) =>
      block.productIds
        ? { ...block, productIds: block.productIds.filter((id) => availableProductIds.has(id)) }
        : block,
    ),
  };
}

export async function getScopedProduct<T extends Record<string, unknown>>(
  serviceDb: SupabaseClient,
  vendorId: string,
  productId: string,
  outletIds: string[],
  select: string,
): Promise<{ data: (T & ProductOutletCandidate) | null; outlet: OutletSummary | null; error: unknown }> {
  if (!outletIds.length) return { data: null, outlet: null, error: null };

  const selection = `${select.trim()},outlet_offers(outlet_id,status,outlets(id,name,city,state))`;
  const { data, error } = await serviceDb
    .from('products')
    .select(selection)
    .eq('id', productId)
    .eq('vendor_id', vendorId)
    .or(`outlet_id.in.(${outletIds.join(',')}),outlet_id.is.null`)
    .maybeSingle();

  if (error || !data) return { data: null, outlet: null, error };
  const product = data as unknown as T & ProductOutletCandidate;
  const outlet = resolveProductOutlet(product, outletIds);
  return outlet ? { data: product, outlet, error: null } : { data: null, outlet: null, error: null };
}
