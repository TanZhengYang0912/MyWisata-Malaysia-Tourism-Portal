function isActiveApproved(row) {
  return row?.status === "active" && (!row.review_status || row.review_status === "approved");
}

/**
 * @typedef {{id: string, vendor_id?: string, outlet_id?: string | null, name?: string, base_price?: number, status?: string, review_status?: string}} CoverageProduct
 * @typedef {{id: string, vendor_id: string, name?: string, status?: string, review_status?: string}} CoverageOutlet
 * @typedef {{id: string, name?: string, status?: string}} CoverageVendor
 * @typedef {{product_id: string, outlet_id: string, price?: number, status?: string}} CoverageOffer
 */

/**
 * Build the read-only Vendor -> Outlet -> Product coverage contract.
 *
 * Direct products are owned by an outlet through products.outlet_id. Shared
 * vendor products are attached through active outlet_offers. The returned
 * contract is deliberately pure so a guarded seed and a remote verifier use
 * the same rules.
 *
 * @param {{vendors?: CoverageVendor[], outlets?: CoverageOutlet[], products?: CoverageProduct[], offers?: CoverageOffer[], minimumProductsPerOutlet?: number}} options
 */
export function buildVendorOutletProductCoverage({
  vendors = [],
  outlets = [],
  products = [],
  offers = [],
  minimumProductsPerOutlet = 5,
} = {}) {
  const issues = [];
  const approvedVendorIds = new Set(
    vendors.filter((vendor) => vendor.status === "approved").map((vendor) => vendor.id),
  );
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const activeOutlets = outlets.filter((outlet) => (
    outlet.status === "active"
    && (!outlet.review_status || outlet.review_status === "approved")
    && approvedVendorIds.has(outlet.vendor_id)
  ));
  const activeProducts = products.filter((product) => (
    isActiveApproved(product) && approvedVendorIds.has(product.vendor_id)
  ));
  const productById = new Map(activeProducts.map((product) => [product.id, product]));
  const outletById = new Map(activeOutlets.map((outlet) => [outlet.id, outlet]));
  const productIdsByOutlet = new Map(activeOutlets.map((outlet) => [outlet.id, new Set()]));
  const offerPriceByOutletProduct = new Map();

  for (const product of activeProducts) {
    if (!product.outlet_id) continue;
    const outlet = outletById.get(product.outlet_id);
    if (!outlet) continue;
    if (product.vendor_id !== outlet.vendor_id) {
      issues.push({
        code: "direct_product_vendor_mismatch",
        productId: product.id,
        outletId: outlet.id,
      });
      continue;
    }
    productIdsByOutlet.get(outlet.id).add(product.id);
  }

  for (const offer of offers) {
    if (offer.status !== "active") continue;
    const product = productById.get(offer.product_id);
    const outlet = outletById.get(offer.outlet_id);
    if (!product || !outlet) continue;
    if (product.vendor_id !== outlet.vendor_id) {
      issues.push({
        code: "shared_offer_vendor_mismatch",
        productId: product.id,
        outletId: outlet.id,
      });
      continue;
    }
    productIdsByOutlet.get(outlet.id).add(product.id);
    const key = `${product.id}:${outlet.id}`;
    if (offerPriceByOutletProduct.has(key)) {
      issues.push({ code: "duplicate_active_offer", productId: product.id, outletId: outlet.id });
    }
    offerPriceByOutletProduct.set(key, Number(offer.price));
  }

  const coverage = activeOutlets.map((outlet) => {
    const productIds = [...(productIdsByOutlet.get(outlet.id) ?? [])].sort();
    const missing = Math.max(0, minimumProductsPerOutlet - productIds.length);
    if (missing > 0) {
      issues.push({
        code: "outlet_product_minimum_not_met",
        outletId: outlet.id,
        outletName: outlet.name,
        vendorId: outlet.vendor_id,
        vendorName: vendorById.get(outlet.vendor_id)?.name ?? null,
        productCount: productIds.length,
        minimumProductsPerOutlet,
        missing,
      });
    }
    return {
      outletId: outlet.id,
      outletName: outlet.name,
      vendorId: outlet.vendor_id,
      vendorName: vendorById.get(outlet.vendor_id)?.name ?? null,
      productIds,
      productCount: productIds.length,
      missing,
      products: productIds.map((productId) => {
        const product = productById.get(productId);
        return {
          id: productId,
          name: product?.name ?? null,
          source: product?.outlet_id === outlet.id ? "direct" : "shared_offer",
          price: offerPriceByOutletProduct.get(`${productId}:${outlet.id}`) ?? Number(product?.base_price ?? 0),
        };
      }),
    };
  });

  return {
    minimumProductsPerOutlet,
    activeOutletCount: activeOutlets.length,
    activeProductCount: activeProducts.length,
    coverage,
    issues,
    allRequirementsPass: issues.length === 0 && coverage.length > 0,
  };
}

export function getCoverageFailures(result) {
  return result.coverage.filter((outlet) => outlet.missing > 0);
}
