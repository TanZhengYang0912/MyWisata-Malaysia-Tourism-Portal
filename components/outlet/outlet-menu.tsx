"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock3, ImageOff, MapPin, ShoppingBag, Star, Ticket, Utensils } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";
import { buildOutletProductCardModel, getOutletDetailActionLabel, getOutletProductAction } from "@/lib/customer/outlet-shop";
import { productImageUrl } from "@/lib/storage/product-image";

function productDetailHref(productId: string, outletId: string) {
  return `/customer/activity/${productId}?outletId=${encodeURIComponent(outletId)}&returnTo=${encodeURIComponent(`/customer/outlet/${outletId}`)}`;
}

function fallbackImage(categoryLabel: string) {
  return (
    <div className="flex h-full min-h-44 flex-col items-center justify-center bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.18),_transparent_42%),linear-gradient(135deg,#eef2ff,#f8fafc_55%,#fff7ed)] text-primary">
      <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
      <span className="mt-2 text-xs font-bold">{categoryLabel}</span>
      <span className="mt-0.5 text-[10px] text-slate-500">Photo coming soon</span>
    </div>
  );
}

export function OutletProductCard({ outlet, product }: { outlet: OutletRendererOutlet; product: OutletRendererProduct }) {
  const router = useRouter();
  const { currentUser } = useAuth();
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

  async function handleAction(kind: "add" | "buy") {
    if (action.kind !== "cart") return;
    if (!currentUser) {
      router.push(`/login?next=${encodeURIComponent(`/customer/outlet/${outlet.id}`)}`);
      return;
    }

    setWorking(kind);
    setError(null);
    try {
      await addItem({
        activityId: product.id,
        variantId: action.variantId,
        slotId: action.slotId,
        outletId: outlet.id,
        qty: 1,
        priceOverride: product.base_price,
      });
      setAdded(true);
      if (kind === "buy") router.push("/customer/cart");
    } catch {
      setError(`We couldn't add ${product.name} to your cart. Please try again.`);
    } finally {
      setWorking(null);
    }
  }

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_28px_rgba(1,0,102,0.07)] transition duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_18px_38px_rgba(1,0,102,0.12)]">
      <Link href={detailHref} className="relative block aspect-[4/3] overflow-hidden bg-secondary" aria-label={`View ${product.name}`}>
        {product.cover_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={productImageUrl(product.cover_url) || ''} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : fallbackImage(model.categoryLabel)}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent px-4 pb-3 pt-12">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
            {product.requires_booking ? <Ticket size={11} aria-hidden="true" /> : <Utensils size={11} aria-hidden="true" />}
            {model.categoryLabel}
          </span>
          {product.featured && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-950">Featured</span>}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <Link href={detailHref} className="min-w-0">
            <h3 className="line-clamp-2 text-base font-bold leading-snug text-slate-950">{product.name}</h3>
          </Link>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">From</p>
            <p className="font-[family-name:var(--font-mono)] text-lg font-bold leading-tight text-primary">{model.priceLabel.replace("From ", "")}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{product.description || model.descriptionFallback}</p>

        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate"><MapPin size={13} className="shrink-0 text-primary/70" /> {model.locationLabel}</span>
            {model.ratingLabel && <span className="inline-flex shrink-0 items-center gap-1 text-amber-600"><Star size={12} fill="currentColor" /> {model.ratingLabel}</span>}
          </div>
          <span className={`inline-flex items-center gap-1.5 font-semibold ${action.kind === "details" ? "text-slate-500" : "text-primary"}`}>
            {product.requires_booking ? <Clock3 size={13} /> : <ShoppingBag size={13} />}
            {model.availabilityLabel}
          </span>
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

        {action.kind === "cart" ? (
          <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
            <button type="button" onClick={() => void handleAction("add")} disabled={Boolean(working)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-full border border-primary/20 px-2 py-2 text-xs font-bold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50">
              {added ? <><Check size={13} /> Added</> : model.primaryActionLabel}
            </button>
            <button type="button" onClick={() => void handleAction("buy")} disabled={Boolean(working)} className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-2 py-2 text-xs font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              {working === "buy" ? "Adding…" : model.secondaryActionLabel}
            </button>
          </div>
        ) : (
          <Link href={detailHref} className="mt-auto inline-flex min-h-10 items-center justify-center rounded-full border border-primary/20 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/5">
            {getOutletDetailActionLabel(action.reason)} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </article>
  );
}

export function OutletMenu({ outlet, products }: { outlet: OutletRendererOutlet; products: OutletRendererProduct[] }) {
  return (
    <section id="full-menu" aria-labelledby="full-menu-title" className="rounded-3xl border border-primary/10 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">From this outlet</p>
          <h2 id="full-menu-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Available at this outlet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Explore the full menu and experiences available here, with the exact price and booking options for this location.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-primary">
          <ShoppingBag size={16} aria-hidden="true" /> {products.length} {products.length === 1 ? "listing" : "listings"}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-primary/20 bg-secondary/40 px-5 py-10 text-center">
          <p className="font-semibold text-slate-900">The menu is being prepared</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">This outlet has not published a sellable item yet. Check back soon for local favourites.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => <OutletProductCard key={product.id} outlet={outlet} product={product} />)}
        </div>
      )}
    </section>
  );
}
