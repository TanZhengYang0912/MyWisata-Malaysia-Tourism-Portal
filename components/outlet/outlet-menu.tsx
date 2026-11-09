"use client";

import { useTranslation } from "react-i18next";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";
import { productImageUrl } from "@/lib/storage/product-image";
import { ProductCard } from "@/components/customer/product-card";

/** One outlet's product on the shared ProductCard, pinned to this outlet. Buying happens on the product page with the outlet preselected. */
export function OutletProductCard({ outlet, product }: { outlet: OutletRendererOutlet; product: OutletRendererProduct }) {
  return (
    <ProductCard
      listing={{
        id: product.id, vendorId: outlet.vendorId ?? "", name: product.name, description: product.description ?? null,
        vendorName: outlet.vendorName ?? undefined, productType: product.product_type ?? null,
        imageUrl: product.cover_url ? productImageUrl(product.cover_url) : null,
        requiresBooking: Boolean(product.requires_booking), rating: product.rating ?? 0, reviews: product.reviews ?? 0,
        ratingKnown: product.ratingKnown,
        sales: { outletCount: 1, fromPrice: Number(product.base_price) },
        pinnedOutletId: outlet.id,
      }}
      returnTo={`/customer/outlets/${outlet.id}`}
    />
  );
}

export function OutletMenu({ outlet, products }: { outlet: OutletRendererOutlet; products: OutletRendererProduct[] }) {
  const { t } = useTranslation("customer");
  const menuGridClass = products.length <= 2 ? "max-w-3xl sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4";
  return (
    <section id="full-menu" aria-labelledby="full-menu-title" className="rounded-3xl border border-primary/10 bg-card p-4 shadow-sm sm:p-7">
      <div className="border-b border-border pb-4 sm:pb-6">
        <h2 id="full-menu-title" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t("ui.outletMenu.availableAt", { outlet: outlet.name })}</h2>
      </div>

      {products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-primary/20 bg-secondary/40 px-5 py-10 text-center">
          <p className="font-semibold text-foreground">{t("ui.outletMenu.emptyTitle")}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("ui.outletMenu.emptyDescription")}</p>
        </div>
      ) : (
        <div className={`mt-4 grid gap-4 sm:mt-6 sm:gap-5 ${menuGridClass}`}>
          {products.map((product) => <OutletProductCard key={product.id} outlet={outlet} product={product} />)}
        </div>
      )}
    </section>
  );
}
