import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperatingHours } from "@/backend/core/types";
import { getScopeRatingSummaries } from "@/backend/domains/vendor-reviews";
import { relationOne } from "@/lib/customer/outlet-shop";
import { orderProductCatalogue, toVendorCatalogueCard, type ProductCatalogueCardData } from "@/lib/customer/product-catalogue";
import { productImageUrl } from "@/lib/storage/product-image";

type Relation<T> = T | T[] | null;
type DestinationOutlet = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  operating_hours: OperatingHours | null;
};
type DestinationProduct = {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  product_type: string | null;
  cover_url: string | null;
  base_price: number | string;
  requires_booking: boolean;
  vendors: Relation<{ name: string }>;
  outlets?: Relation<DestinationOutlet>;
  outlet_offers: Array<{ outlet_id: string; price?: number | string | null; status?: string; outlets?: Relation<DestinationOutlet> }>;
};

const PRODUCT_FIELDS = "id,vendor_id,name,description,product_type,cover_url,base_price,requires_booking,vendors!inner(name)";
const OUTLET_FIELDS = "id,name,city,state,operating_hours";
const LIMIT = 8;

/** Two bounded, state-filtered reads: at most 16 candidates, never a nationwide catalogue read.
 * Products with active offers use those offers; direct outlet/base_price is only the fallback.
 */
export async function getDestinationProductCards(state: string, db: SupabaseClient, ratingsDb: SupabaseClient): Promise<ProductCatalogueCardData[]> {
  const eligible = (select: string) => db.from("products").select(select)
    .eq("status", "active").eq("review_status", "approved").eq("vendors.status", "approved");
  const [direct, shared] = await Promise.all([
    eligible(`${PRODUCT_FIELDS},outlets!inner(${OUTLET_FIELDS}),outlet_offers(id)`)
      .eq("outlets.state", state).eq("outlets.status", "active").eq("outlets.review_status", "approved")
      .eq("outlet_offers.status", "active").is("outlet_offers", null).gte("base_price", 0)
      .order("name").order("id").limit(LIMIT),
    eligible(`${PRODUCT_FIELDS},outlet_offers!inner(outlet_id,price,status,outlets!inner(${OUTLET_FIELDS}))`)
      .eq("outlet_offers.status", "active").gte("outlet_offers.price", 0)
      .eq("outlet_offers.outlets.state", state).eq("outlet_offers.outlets.status", "active")
      .eq("outlet_offers.outlets.review_status", "approved")
      .order("name").order("id").limit(LIMIT),
  ]);
  if (direct.error) throw direct.error;
  if (shared.error) throw shared.error;
  const rows = orderProductCatalogue([...(shared.data ?? []), ...(direct.data ?? [])] as unknown as DestinationProduct[]).slice(0, LIMIT);
  const ratings = await getScopeRatingSummaries("product", rows.map(({ id }) => id), ratingsDb).catch((error: unknown) => {
    console.error("Destination product ratings unavailable", error);
    return null;
  });
  return rows.flatMap((row) => {
    const vendor = relationOne(row.vendors);
    const offers = row.outlet_offers ?? [];
    const directOutlet = relationOne(row.outlets);
    const soldAt = offers.length
      ? offers.flatMap((offer) => {
        const outlet = relationOne(offer.outlets);
        return outlet && offer.status === "active" && outlet.state === state && offer.price !== null
          ? [{ ...outlet, price: Number(offer.price), operatingHours: outlet.operating_hours }]
          : [];
      })
      : directOutlet && directOutlet.state === state
        ? [{ ...directOutlet, price: Number(row.base_price), operatingHours: directOutlet.operating_hours }]
        : [];
    const rating = ratings?.get(row.id);
    const card = toVendorCatalogueCard({
      id: row.id, vendorId: row.vendor_id, name: row.name, description: row.description,
      productType: row.product_type, imageUrl: productImageUrl(row.cover_url), requiresBooking: row.requires_booking,
      fromPrice: Number(row.base_price), rating: rating?.value ?? 0, reviews: rating?.count ?? 0, soldAt,
    });
    return card.sales.outletCount > 0 ? [{ ...card, vendorName: vendor?.name, ratingKnown: ratings !== null }] : [];
  });
}
