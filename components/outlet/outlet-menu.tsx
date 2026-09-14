"use client";

import { useTranslation } from "react-i18next";
import { formatMYRNumber } from "@/lib/i18n/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock3, ImageOff, MapPin, ShoppingBag, Star, Ticket, Utensils } from "lucide-react";
import { useCart } from "@/components/providers/cart";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";
import { buildOutletProductCardModel, getOutletProductAction } from "@/lib/customer/outlet-shop";
import { productImageUrl } from "@/lib/storage/product-image";

function productDetailHref(productId: string, outletId: string) {
  // Always navigate with outlet scope: outletId pre-selects the outlet in the
  // product detail page and returnTo points back to the outlet shop so that
  // relatedScope resolves to "outlet" (not "vendor") on the server.
  return `/customer/activity/${productId}?outletId=${encodeURIComponent(outletId)}&returnTo=${encodeURIComponent(`/customer/outlet/${outletId}`)}`;
}

function fallbackImage(categoryLabel: string, photoComingSoon: string) {
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center bg-secondary text-primary">
      <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
      <span className="mt-2 text-xs font-bold">{categoryLabel}</span>
      <span className="mt-0.5 text-[10px] text-muted-foreground/60">{photoComingSoon}</span>
    </div>
  );
}

function CartActions({ outlet, product }: { outlet: OutletRendererOutlet; product: OutletRendererProduct }) {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const gate = useCustomerCapabilityGate();
  const { addItem } = useCart();
  const [working, setWorking] = useState<"add" | "buy" | null>(null);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = getOutletProductAction({
    requiresBooking: Boolean(product.requires_booking),
    variantId: product.variant_id,
    firstAvailableSlotId: product.first_available_slot_id,
    availableStock: product.available_stock,
  });

  if (action.kind !== "cart") return null;
  const cartAction = action;

  async function handleAction(kind: "add" | "buy") {
    if (!gate(CUSTOMER_CAPABILITY.CART_MUTATION)) return;

    setWorking(kind);
    setError(null);
    try {
      await addItem({
        activityId: product.id,
        variantId: cartAction.variantId,
        slotId: cartAction.slotId,
        outletId: outlet.id,
        qty: 1,
        priceOverride: product.base_price,
      });
      setAdded(true);
      if (kind === "buy") router.push("/customer/cart");
    } catch {
      setError(t("ui.outletMenu.addError", { product: product.name }));
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      {error && <p role="alert" aria-live="assertive" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
        <button type="button" onClick={() => void handleAction("add")} disabled={Boolean(working)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-full border border-primary/20 px-2 py-2 text-xs font-bold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50">
          {added ? <><Check size={13} aria-hidden="true" /> {t("ui.states.addedToCart")}</> : t(product.requires_booking ? "ui.actions.addBookingToCart" : "ui.actions.addToCart")}
        </button>
        <button type="button" onClick={() => void handleAction("buy")} disabled={Boolean(working)} className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-2 py-2 text-xs font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
          {working === "buy" ? t("ui.outletMenu.adding") : t(product.requires_booking ? "ui.actions.bookNow" : "ui.actions.buyNow")}
        </button>
      </div>
    </>
  );
}

export function OutletProductCard({ outlet, product }: { outlet: OutletRendererOutlet; product: OutletRendererProduct }) {
  const { t } = useTranslation("customer");
  const action = getOutletProductAction({
    requiresBooking: Boolean(product.requires_booking),
    variantId: product.variant_id,
    firstAvailableSlotId: product.first_available_slot_id,
    availableStock: product.available_stock,
  });
  const model = buildOutletProductCardModel({
    outletName: outlet.name,
    productName: product.name,
    basePrice: product.base_price,
    category: product.category,
    productType: product.product_type,
    requiresBooking: product.requires_booking,
    availableStock: product.available_stock,
    rating: product.rating,
    reviews: product.reviews,
    hasCartAction: action.kind === "cart",
  });
  const detailHref = productDetailHref(product.id, outlet.id);
  const categoryLabel = product.category || t(product.product_type ? `ui.vendor.productTypes.${product.product_type}` : "ui.outlet.availableToExplore");
  const descriptionFallback = t("ui.outletMenu.descriptionFallback", { outlet: outlet.name });
  const priceLabel = t("ui.outletMenu.price", { price: formatMYRNumber(Number(product.base_price)) });

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md">
      <Link href={detailHref} className="relative block aspect-[4/3] overflow-hidden bg-secondary" aria-label={t("ui.outletMenu.viewProduct", { product: product.name })}>
        {product.cover_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={productImageUrl(product.cover_url) || ''} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : fallbackImage(categoryLabel, t("ui.outlet.photoComingSoon"))}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 via-black/20 to-transparent px-4 pb-3 pt-12">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
            {product.requires_booking ? <Ticket size={11} aria-hidden="true" /> : <Utensils size={11} aria-hidden="true" />}
            {categoryLabel}
          </span>
          {product.featured && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black">{t("ui.map.featured")}</span>}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <Link href={detailHref} className="min-w-0">
            <h3 className="line-clamp-2 text-base font-bold leading-snug text-foreground">{product.name}</h3>
          </Link>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">{t("ui.outletMenu.from")}</p>
          <p className="font-[family-name:var(--font-mono)] text-lg font-bold leading-tight text-primary">{priceLabel}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{product.description || descriptionFallback}</p>

        <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate"><MapPin size={13} aria-hidden="true" className="shrink-0 text-primary/70" /> {t("ui.outletMenu.availableAt", { outlet: outlet.name })}</span>
            {model.ratingLabel && <span className="inline-flex shrink-0 items-center gap-1 text-amber-600"><Star size={12} fill="currentColor" aria-hidden="true" /> {model.ratingLabel}</span>}
          </div>
          <span className={`inline-flex items-center gap-1.5 font-semibold ${action.kind === "details" ? "text-muted-foreground" : "text-primary"}`}>
            {product.requires_booking ? <Clock3 size={13} aria-hidden="true" /> : <ShoppingBag size={13} aria-hidden="true" />}
            {product.available_stock === 0 ? t("ui.cart.outOfStock") : product.requires_booking ? t("ui.outlet.bookingRequired") : product.available_stock != null ? t("ui.cart.inStock", { count: product.available_stock }) : t("ui.outlet.availableToExplore")}
          </span>
        </div>

        {action.kind === "cart" ? (
          <CartActions outlet={outlet} product={product} />
        ) : (
          <Link href={detailHref} className="mt-auto inline-flex min-h-10 items-center justify-center rounded-full border border-primary/20 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/5">
            {t(action.reason === "slot_required" ? "ui.outletMenu.chooseTime" : action.reason === "out_of_stock" ? "ui.outletMenu.viewDetails" : "ui.outletMenu.chooseOptions")}
          </Link>
        )}
      </div>
    </article>
  );
}

export function OutletMenu({ outlet, products }: { outlet: OutletRendererOutlet; products: OutletRendererProduct[] }) {
  const { t } = useTranslation("customer");
  const menuGridClass = products.length <= 2 ? "max-w-3xl sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4";
  return (
    <section id="full-menu" aria-labelledby="full-menu-title" className="rounded-3xl border border-primary/10 bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("ui.labels.mywisataOutlet")}</p>
          <h2 id="full-menu-title" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t("ui.outletMenu.availableAt", { outlet: outlet.name })}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("ui.outletMenu.description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-primary">
          <ShoppingBag size={16} aria-hidden="true" /> {t("ui.outletMenu.listingCount", { count: products.length })}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-primary/20 bg-secondary/40 px-5 py-10 text-center">
          <p className="font-semibold text-foreground">{t("ui.outletMenu.emptyTitle")}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("ui.outletMenu.emptyDescription")}</p>
        </div>
      ) : (
        <div className={`mt-6 grid gap-5 ${menuGridClass}`}>
          {products.map((product) => <OutletProductCard key={product.id} outlet={outlet} product={product} />)}
        </div>
      )}
    </section>
  );
}
