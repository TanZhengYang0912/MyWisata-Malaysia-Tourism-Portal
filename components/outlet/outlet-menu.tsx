"use client";

import { useTranslation } from "react-i18next";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";
import { ProductCard } from "@/components/customer/product-card";
import { canonicalCategorySlug, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { productImageUrl } from "@/lib/storage/product-image";

/** One outlet's product on the shared ProductCard, pinned to this outlet. */
export function OutletProductCard({ outlet, product }: { outlet: OutletRendererOutlet; product: OutletRendererProduct }) {
  return (
    <ProductCard
      listing={{
        id: product.id,
        vendorId: outlet.vendorId ?? "",
        name: product.name,
        description: product.description ?? null,
        vendorName: outlet.vendorName ?? undefined,
        productType: product.product_type ?? null,
        imageUrl: product.cover_url ? productImageUrl(product.cover_url) : null,
        requiresBooking: Boolean(product.requires_booking),
        rating: product.rating ?? 0,
        reviews: product.reviews ?? 0,
        ratingKnown: product.ratingKnown,
        sales: { outletCount: 1, fromPrice: Number(product.base_price) },
        pinnedOutletId: outlet.id,
      }}
      returnTo={`/customer/outlets/${outlet.id}`}
    />
  );
}

export function OutletMenu({ outlet, products, groupByCategory = false }: { outlet: OutletRendererOutlet; products: OutletRendererProduct[]; groupByCategory?: boolean }) {
  const { t } = useTranslation("customer");
  const menuGridClass = products.length <= 2 ? "max-w-3xl sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4";
  const categoryGroups = groupByCategory ? Array.from(products.reduce((groups, product) => {
    const normalizedSlug = product.category_slug?.trim().toLowerCase();
    const key = canonicalCategorySlug(normalizedSlug) || normalizedSlug || product.category?.trim().toLowerCase() || "uncategorized";
    const current = groups.get(key);
    if (current) current.products.push(product);
    else {
      const labelKey = getOptionalDiscoveryCategoryLabelKey(product.category_slug);
      groups.set(key, {
        label: labelKey ? t(labelKey) : product.category || t("categories.other"),
        products: [product],
      });
    }
    return groups;
  }, new Map<string, { label: string; products: OutletRendererProduct[] }>()).entries()).sort(([left], [right]) => {
    const categoryOrder = ["accommodation", "food", "activity", "retail"];
    const leftSlug = canonicalCategorySlug(left);
    const rightSlug = canonicalCategorySlug(right);
    const leftIndex = categoryOrder.indexOf(leftSlug ?? left);
    const rightIndex = categoryOrder.indexOf(rightSlug ?? right);
    return (leftIndex < 0 ? categoryOrder.length : leftIndex) - (rightIndex < 0 ? categoryOrder.length : rightIndex);
  }) : [];

  return (
    <section id="full-menu" aria-labelledby="full-menu-title" className="rounded-3xl border border-primary/10 bg-card p-4 shadow-sm sm:p-7">
      <span id="featured-products" className="block scroll-mt-20" aria-hidden="true" />
      <div className="border-b border-border pb-4 sm:pb-6">
        <h2 id="full-menu-title" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t("ui.outletMenu.availableAt", { outlet: outlet.name })}</h2>
      </div>

      {products.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-secondary/40 px-5 py-8 text-center sm:mt-6">
          <p className="font-semibold text-foreground">{t("ui.outletMenu.emptyTitle")}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("ui.outletMenu.emptyDescription")}</p>
        </div>
      ) : groupByCategory ? (
        <div className="mt-4 space-y-7 sm:mt-6 sm:space-y-9">
          {categoryGroups.map(([categoryKey, group]) => (
            <section key={categoryKey} aria-label={group.label}>
              <div className="mb-3 border-b border-border pb-2">
                <h3 className="min-w-0 break-words text-lg font-bold text-foreground sm:text-xl">{group.label}</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                {group.products.map((product) => <OutletProductCard key={product.id} outlet={outlet} product={product} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={`mt-4 grid gap-4 sm:mt-6 sm:gap-5 ${menuGridClass}`}>
          {products.map((product) => <OutletProductCard key={product.id} outlet={outlet} product={product} />)}
        </div>
      )}
    </section>
  );
}
