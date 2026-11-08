"use client";

import { useTranslation } from "react-i18next";
import { formatMYRNumber } from "@/lib/i18n/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ImageOff } from "lucide-react";
import { useCart } from "@/components/providers/cart";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";
import { getOutletProductAction } from "@/lib/customer/outlet-shop";
import { productImageUrl } from "@/lib/storage/product-image";
import { LocalizedContent } from "@/components/customer/localized-content";
import { ProductSaveButton } from "@/components/customer/product-save-button";

function productDetailHref(productId: string, outletId: string) {
  // Always navigate with outlet scope: outletId pre-selects the outlet in the
  // product detail page and returnTo points back to the outlet shop so that
  // relatedScope resolves to "outlet" (not "vendor") on the server.
  return `/customer/products/${productId}?outletId=${encodeURIComponent(outletId)}&returnTo=${encodeURIComponent(`/customer/outlets/${outletId}`)}`;
}

function fallbackImage(photoComingSoon: string) {
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center bg-secondary text-primary">
      <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
      <span className="mt-2 text-xs text-muted-foreground/70">{photoComingSoon}</span>
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

export function OutletProductCard({ outlet, product, canUseCustomerActions = true }: { outlet: OutletRendererOutlet; product: OutletRendererProduct; canUseCustomerActions?: boolean }) {
  const { t } = useTranslation("customer");
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const action = getOutletProductAction({
    requiresBooking: Boolean(product.requires_booking),
    variantId: product.variant_id,
    firstAvailableSlotId: product.first_available_slot_id,
    availableStock: product.available_stock,
  });
  const detailHref = productDetailHref(product.id, outlet.id);
  const priceLabel = t("ui.outletMenu.price", { price: formatMYRNumber(Number(product.base_price)) });
  const imageUrl = product.cover_url ? productImageUrl(product.cover_url) : null;

  return (
    <article className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <Link href={detailHref} className="group/product-media relative block aspect-[4/3] overflow-hidden bg-secondary" aria-label={t("ui.outletMenu.viewProduct", { product: product.name })}>
        {imageUrl && failedImageUrl !== imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt={product.name} onError={() => setFailedImageUrl(imageUrl)} className="h-full w-full object-cover transition duration-500 group-hover/product-media:scale-105" />
        ) : fallbackImage(t("ui.outlet.photoComingSoon"))}
      </Link>
      {canUseCustomerActions && <ProductSaveButton productId={product.id} productName={product.name} className="absolute right-3 top-3 z-10" />}

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <LocalizedContent entityType="product" entityId={product.id} field="name" sourceText={product.name}>
            {({ text, control }) => <><Link href={detailHref} className="min-w-0"><h3 className="break-words text-base font-bold leading-snug text-foreground">{text}</h3></Link>{control}</>}
          </LocalizedContent>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">{t("ui.outletMenu.from")}</p>
          <p className="font-[family-name:var(--font-mono)] text-lg font-bold leading-tight text-primary">{priceLabel}</p>
          </div>
        </div>
        {action.kind === "cart" ? (
          canUseCustomerActions && <CartActions outlet={outlet} product={product} />
        ) : (
          <Link href={detailHref} className="mt-auto inline-flex min-h-10 items-center justify-center rounded-full border border-primary/20 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/5">
            {t(action.reason === "slot_required" ? "ui.outletMenu.chooseTime" : action.reason === "out_of_stock" ? "ui.outletMenu.viewDetails" : "ui.outletMenu.chooseOptions")}
          </Link>
        )}
      </div>
    </article>
  );
}

export function OutletMenu({ outlet, products, canUseCustomerActions = true }: { outlet: OutletRendererOutlet; products: OutletRendererProduct[]; canUseCustomerActions?: boolean }) {
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
          {products.map((product) => <OutletProductCard key={product.id} outlet={outlet} product={product} canUseCustomerActions={canUseCustomerActions} />)}
        </div>
      )}
    </section>
  );
}
