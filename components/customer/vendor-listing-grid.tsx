"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProductCard } from "@/components/customer/product-card";
import { toVendorCatalogueCard } from "@/lib/customer/product-catalogue";
import { Button } from "@/components/ui/button";
import { getVendorProductTypeLabel, type VendorProductCardData } from "@/lib/customer/vendor-page";

const FIRST_PAGE = 8;

/** The vendor's whole listing, featured first: eight cards, then "Show all"; type chips when there is more than one type. */
export function VendorListingGrid({ products, vendorName, returnTo }: { products: VendorProductCardData[]; vendorName?: string; returnTo: string }) {
  const { t } = useTranslation("customer");
  const [type, setType] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const types = [...new Set(products.map((product) => product.productType ?? ""))];
  const filtered = type === null ? products : products.filter((product) => (product.productType ?? "") === type);
  const shown = showAll ? filtered : filtered.slice(0, FIRST_PAGE);

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
                onClick={() => { setType(value); setShowAll(false); }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${type === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40"}`}
              >
                {value === null ? t("ui.labels.all") : getVendorProductTypeLabel(value)}
              </button>
            ))}
          </div>
        ) : <span />}
        <span className="text-sm font-semibold text-muted-foreground">{t("ui.vendor.showingCount", { shown: shown.length, total: filtered.length })}</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {shown.map((product) => <ProductCard key={product.id} returnTo={returnTo} listing={{ ...toVendorCatalogueCard(product), vendorName }} source="vendor" />)}
      </div>
      {shown.length < filtered.length && (
        <div className="mt-6 flex justify-center">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setShowAll(true)}>
            {t("ui.vendor.showAllExperiences", { count: filtered.length })}
          </Button>
        </div>
      )}
    </div>
  );
}
