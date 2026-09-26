import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import type { CustomerVoucher, CustomerVoucherClaim, CustomerVoucherTab } from "@/lib/customer/voucher-claims";
import { resolveOutletImage, type ManagedPlaceImage } from "@/lib/outlet-images";
import { signVoucherStoreToken } from "@/lib/vouchers/store-token";

type Relation<T> = T | T[] | null;
type OutletSummary = { id: string; name: string; city: string | null; state: string | null; status?: string; review_status?: string; outlet_pages: Relation<{ hero_url: string | null }> };
type ProductOffer = { outlet_id: string; status: string | null; outlets: Relation<OutletSummary> };
type EligibleProduct = { id: string; name: string; status: string | null; review_status: string | null };
type EligibleOfferRow = { outlet_id: string; product_id: string; status: string | null; products: Relation<EligibleProduct> };
type VoucherRow = {
  id: string;
  vendor_id: string;
  outlet_id: string | null;
  code: string;
  name: string;
  voucher_type: "percent" | "fixed" | "bogo";
  discount_value: number;
  min_spend: number | null;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  uses_count: number;
  redemption_mode: "online" | "in_store" | "both";
  product_id: string | null;
  vendors: Relation<{ id: string; name: string; logo_url: string | null }>;
  outlets: Relation<OutletSummary>;
  products: Relation<{ id: string; name: string; status: string | null; review_status: string | null; outlet_offers: ProductOffer[] | null }>;
};
type ClaimRow = { id: string; voucher_id: string; status: CustomerVoucherClaim["status"]; claimed_at: string; redeemed_at: string | null; expires_at: string | null };

function relation<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getOutletImage(outlet: OutletSummary | null, managedPlaceImages: ManagedPlaceImage[]) {
  if (!outlet) return null;
  const outletPage = relation(outlet.outlet_pages);
  return resolveOutletImage({ outletName: outlet.name, outletHeroUrl: outletPage?.hero_url, managedPlaceImages });
}

function mapVoucher(row: VoucherRow, claim: ClaimRow | undefined, eligibleProductsByOutlet: Map<string, EligibleProduct[]>, managedPlaceImages: ManagedPlaceImage[]): CustomerVoucher {
  const vendor = relation(row.vendors);
  const outlet = relation(row.outlets);
  const product = relation(row.products);
  const activeProductOutlets = (product?.outlet_offers ?? [])
    .filter((offer) => offer.status === "active")
    .map((offer) => relation(offer.outlets))
    .filter((candidate): candidate is OutletSummary => Boolean(candidate));
  const productLocationLabels = [...new Map(activeProductOutlets.map((candidate) => [candidate.id, [candidate.city, candidate.state].filter(Boolean).join(", ") || candidate.name])).values()];
  const locationLabel = outlet
    ? [outlet.city, outlet.state].filter(Boolean).join(", ") || outlet.name
    : productLocationLabels.length <= 2
      ? productLocationLabels.join(" · ") || null
      : `${productLocationLabels.slice(0, 2).join(" · ")} + ${productLocationLabels.length - 2} more outlets`;
  const outletImageUrl = getOutletImage(outlet, managedPlaceImages) ?? getOutletImage(activeProductOutlets[0] ?? null, managedPlaceImages);
  const eligibleProducts = row.outlet_id
    ? eligibleProductsByOutlet.get(row.outlet_id) ?? []
    : product
      ? [{ id: product.id, name: product.name, status: product.status, review_status: product.review_status }]
      : [];
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: vendor?.name ?? "Verified partner",
    vendorLogoUrl: vendor?.logo_url ?? null,
    outletId: row.outlet_id,
    outletName: outlet?.name ?? null,
    outletImageUrl,
    locationLabel,
    productId: row.product_id,
    productName: product?.name ?? null,
    eligibleProductCount: eligibleProducts.length,
    eligibleProductNames: eligibleProducts.map((eligibleProduct) => eligibleProduct.name),
    code: row.code,
    name: row.name,
    voucherType: row.voucher_type,
    discountValue: Number(row.discount_value),
    minSpend: Number(row.min_spend ?? 0),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    maxUses: row.max_uses,
    usesCount: Number(row.uses_count ?? 0),
    redemptionMode: row.redemption_mode,
    claim: claim ? {
      id: claim.id,
      status: claim.status,
      claimedAt: claim.claimed_at,
      redeemedAt: claim.redeemed_at,
      expiresAt: claim.expires_at,
      storeToken: claim.status === "claimed" && ["in_store", "both"].includes(row.redemption_mode)
        ? signVoucherStoreToken({ claimId: claim.id, voucherId: row.id, outletId: row.outlet_id, exp: Math.floor(new Date(claim.expires_at ?? row.valid_until ?? Date.now() + 86_400_000).getTime() / 1000) })
        : undefined,
    } : null,
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const rawTab = new URL(request.url).searchParams.get("tab") ?? "deals";
  if (rawTab !== "deals" && rawTab !== "mine") return apiFail("INVALID_TAB", "Choose a voucher tab", 400);
  const tab = rawTab as CustomerVoucherTab;

  const voucherQuery = db.from("vouchers")
    .select("id,vendor_id,outlet_id,product_id,code,name,voucher_type,discount_value,min_spend,valid_from,valid_until,max_uses,uses_count,redemption_mode,vendors(id,name,logo_url),outlets(id,name,city,state,status,review_status,outlet_pages(hero_url)),products(id,name,status,review_status,outlet_offers(outlet_id,status,outlets(id,name,city,state,outlet_pages(hero_url))))");
  const filteredVoucherQuery = tab === "deals"
    ? voucherQuery.eq("is_active", true).eq("review_status", "approved").eq("is_claimable", true).in("redemption_mode", ["online", "in_store", "both"])
    : voucherQuery.eq("review_status", "approved");

  const [{ data: rows, error: voucherError }, { data: claims, error: claimError }] = await Promise.all([
    filteredVoucherQuery.order("created_at", { ascending: false }),
    db.from("customer_voucher_claims")
      .select("id,voucher_id,status,claimed_at,redeemed_at,expires_at")
      .eq("user_id", user.id)
      .order("claimed_at", { ascending: false }),
  ]);
  if (voucherError) return apiFail("DB_ERROR", "Unable to load voucher deals", 500);
  if (claimError) return apiFail("DB_ERROR", "Unable to load your vouchers", 500);

  const vendorIds = [...new Set((rows ?? []).map((row) => row.vendor_id).filter(Boolean))];
  const { data: managedPlaces, error: managedPlacesError } = vendorIds.length
    ? await db.from("places").select("managed_by_vendor_id,name,image_url").in("managed_by_vendor_id", vendorIds).eq("level", "poi").eq("status", "active")
    : { data: [], error: null };
  if (managedPlacesError) return apiFail("DB_ERROR", "Unable to load outlet imagery", 500);
  const managedPlaceImagesByVendor = new Map<string, ManagedPlaceImage[]>();
  for (const place of (managedPlaces ?? []) as Array<{ managed_by_vendor_id: string | null; name: string; image_url: string | null }>) {
    if (!place.managed_by_vendor_id) continue;
    const images = managedPlaceImagesByVendor.get(place.managed_by_vendor_id) ?? [];
    images.push({ name: place.name, imageUrl: place.image_url });
    managedPlaceImagesByVendor.set(place.managed_by_vendor_id, images);
  }

  const outletIds = [...new Set((rows ?? []).map((row) => row.outlet_id).filter((outletId): outletId is string => Boolean(outletId)))];
  const { data: offerRows, error: offerError } = outletIds.length
    ? await db.from("outlet_offers")
      .select("outlet_id,product_id,status,products(id,name,status,review_status)")
      .in("outlet_id", outletIds)
      .eq("status", "active")
    : { data: [], error: null };
  if (offerError) return apiFail("DB_ERROR", "Unable to load voucher product coverage", 500);

  const eligibleProductsByOutlet = new Map<string, EligibleProduct[]>();
  for (const offer of (offerRows ?? []) as unknown as EligibleOfferRow[]) {
    const product = relation(offer.products);
    if (!product || product.status !== "active" || product.review_status !== "approved") continue;
    const products = eligibleProductsByOutlet.get(offer.outlet_id) ?? [];
    if (!products.some((existing) => existing.id === product.id)) products.push(product);
    eligibleProductsByOutlet.set(offer.outlet_id, products);
  }

  const claimByVoucher = new Map((claims ?? []).map((claim) => [claim.voucher_id, claim as ClaimRow]));
  const claimedVoucherIds = new Set(claimByVoucher.keys());
  const vouchers = (rows ?? [])
    .filter((row) => !row.outlet_id || (relation((row as unknown as VoucherRow).outlets)?.status === "active" && relation((row as unknown as VoucherRow).outlets)?.review_status === "approved"))
    .map((row) => mapVoucher(row as unknown as VoucherRow, claimByVoucher.get(row.id), eligibleProductsByOutlet, managedPlaceImagesByVendor.get(row.vendor_id) ?? []));
  return apiOk({
    tab,
    vouchers: tab === "mine"
      ? vouchers.filter((voucher) => voucher.claim !== null)
      : vouchers.filter((voucher) => !claimedVoucherIds.has(voucher.id)),
  });
}
