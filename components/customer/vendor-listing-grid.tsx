"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProductCard } from "@/components/customer/product-card";
import { toVendorCatalogueCard } from "@/lib/customer/product-catalogue";
import { Pagination } from "@/components/shared/pagination";
import { getVendorProductTypeLabel, type VendorProductCardData } from "@/lib/customer/vendor-page";

const PAGE_SIZE = 8;

/** The vendor's whole listing, featured first, eight cards a page; type chips when there is more than one type. */
export function VendorListingGrid({ products, vendorName, returnTo }: { products: VendorProductCardData[]; vendorName?: string; returnTo: string }) {
  const { t } = useTranslation("customer");
  const [type, setType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const types = [...new Set(products.map((product) => product.productType ?? ""))];
  const filtered = type === null ? products : products.filter((product) => (product.productType ?? "") === type);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {types.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {[null, ...types].map((value) => (
              <button
                key={value ?? "all"}
                type="button"
                aria-pressed={type === value}
                onClick={() => { setType(value); setPage(1); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${type === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40"}`}
              >
                {value === null ? t("ui.labels.all") : getVendorProductTypeLabel(value)}
              </button>
            ))}
          </div>
        ) : <span />}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {filtered.slice(pageStart, pageStart + PAGE_SIZE).map((product) => <ProductCard key={product.id} returnTo={returnTo} listing={{ ...toVendorCatalogueCard(product), vendorName }} source="vendor" />)}
      </div>
      <Pagination ariaLabel={t("ui.vendor.publishedListings")} currentPage={safePage} onPageChange={setPage} pageSize={PAGE_SIZE} totalItems={filtered.length} totalPages={totalPages} />
    </div>
  );
}
