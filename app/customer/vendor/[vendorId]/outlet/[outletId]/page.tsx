import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { selectPublicDocument } from "@/lib/vendor/outlet-page-persistence";
import { getOutletProductIds } from "@/backend/domains/catalogue";
import { buildPublicOutletProfile, getOutletNavigationModel, selectFullOutletMenu } from "@/lib/customer/outlet-shop";
import { OutletPageRenderer } from "@/components/outlet/outlet-page-renderer";
import { ShareButton } from "@/components/shared/share-button";
import { OutletChatButton } from "@/components/customer/outlet-chat-button";
import { getServerTranslation } from "@/lib/i18n/server";
import { productImageUrl } from "@/lib/storage/product-image";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ vendorId: string; outletId: string }>;
}

async function getPublicOutletPage(outletId: string, vendorId: string) {
  const db = await createClient();
  const [{ data: outlet }, { data: page }, { data: outlets }] = await Promise.all([
    db
      .from("outlets")
      .select("id,name,address,city,state,country,phone,email,operating_hours,wheelchair_accessible,pet_friendly,vendors(id,name)")
      .eq("id", outletId)
      .eq("vendor_id", vendorId)
      .eq("status", "active")
      .maybeSingle(),
    db.from("public_outlet_pages").select("*").eq("outlet_id", outletId).maybeSingle(),
    db.from("outlets").select("id,name").eq("vendor_id", vendorId).eq("status", "active").order("name"),
  ]);
  return { outlet, page, outlets: outlets || [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { outletId, vendorId } = await params;
  const { outlet, page } = await getPublicOutletPage(outletId, vendorId);
  const { t } = await getServerTranslation("customer");
  if (!outlet) return { title: t("ui.outletPage.notFound") };
  const document = selectPublicDocument(page || {});
  const vendor = Array.isArray(outlet.vendors) ? outlet.vendors[0] : undefined;
  return {
    title: document.seoTitle || `${outlet.name}${vendor ? ` — ${vendor.name}` : ""} | MyWisata`,
    description: document.seoDescription || t("ui.outletPage.metaDescription", { name: outlet.name }),
    openGraph: {
      title: document.seoTitle || outlet.name,
      description: document.seoDescription || t("ui.outletPage.metaDescription", { name: outlet.name }),
      images: document.hero.imageUrl ? [{ url: document.hero.imageUrl }] : undefined,
    },
  };
}

export default async function VendorOutletPage({ params }: Props) {
  const { outletId, vendorId } = await params;
  const { outlet, page, outlets } = await getPublicOutletPage(outletId, vendorId);
  if (!outlet) notFound();
  const { t } = await getServerTranslation("customer");

  const outletNavigation = getOutletNavigationModel(outlets, outlet.id);

  const document = selectPublicDocument(page || {});
  const vendor = Array.isArray(outlet.vendors) ? outlet.vendors[0] : undefined;
  const profile = buildPublicOutletProfile({
    outletName: outlet.name,
    vendorName: vendor?.name,
    address: outlet.address,
    city: outlet.city,
    state: outlet.state,
    country: outlet.country,
    phone: outlet.phone,
    email: outlet.email,
    operatingHours: outlet.operating_hours,
  });
  const publicOutlet = {
    ...outlet,
    vendorName: vendor?.name ?? null,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    phone: profile.phone,
    email: profile.email,
    operating_hours: profile.operatingHours,
  };
  const publicDocument = {
    ...document,
    hero: {
      ...document.hero,
      title:
        document.hero.title === "Discover this outlet" || !document.hero.title.trim()
          ? t("ui.outletPage.heroTitle")
          : document.hero.title,
      body:
        document.hero.body === "Discover local food, culture and experiences from this outlet."
          ? profile.introBody
          : document.hero.body,
    },
    blocks: document.blocks.map((block) =>
      block.type === "intro"
        ? { ...block, title: block.title === "Welcome to this outlet" ? profile.introTitle : block.title, body: block.body || profile.introBody }
        : block
    ),
  };

  const db = await createClient();
  const sellable = await getOutletProductIds(db, outletId);
  const sellableIds = [...sellable];
  const sellableSet = new Set(sellableIds);
  const featuredIds = publicDocument.featuredIds.filter((id) => sellableSet.has(id));
  const [{ data: products }, { data: offers }, { data: slots }, { data: reviewMetrics }] = sellableIds.length
    ? await Promise.all([
        db.from("products").select("id,name,description,base_price,requires_booking,cover_url,product_type,outlet_id,categories(name),product_variants(id,name,inventory(quantity,reserved))").eq("status", "active").eq("review_status", "approved").in("id", sellableIds),
        db.from("outlet_offers").select("product_id,price").eq("outlet_id", outletId).eq("status", "active").in("product_id", sellableIds),
        db.from("booking_slots").select("id,product_id,starts_at,status").in("product_id", sellableIds).eq("status", "available").gt("starts_at", new Date().toISOString()).order("starts_at"),
        db.from("product_review_metrics").select("product_id,rating,reviews").in("product_id", sellableIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const offerPriceByProduct = new Map((offers || []).map((offer) => [offer.product_id, Number(offer.price)]));
  const firstSlotByProduct = new Map<string, string>();
  for (const slot of slots || []) if (!firstSlotByProduct.has(slot.product_id)) firstSlotByProduct.set(slot.product_id, slot.id);
  const metricByProduct = new Map((reviewMetrics || []).map((metric) => [metric.product_id, { rating: Number(metric.rating), reviews: Number(metric.reviews) }]));
  const menuProducts = selectFullOutletMenu(
    (products || []).map((product) => {
      const variants = product.product_variants || [];
      const inventoryRows = variants.flatMap((variant) => variant.inventory || []);
      const availableStock =
        inventoryRows.length > 0
          ? inventoryRows.reduce((total, inventory) => total + Math.max(0, Number(inventory.quantity) - Number(inventory.reserved)), 0)
          : undefined;
      const metric = metricByProduct.get(product.id) || { rating: 0, reviews: 0 };
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        base_price: offerPriceByProduct.get(product.id) ?? Number(product.base_price),
        category: product.categories?.[0]?.name ?? null,
        product_type: product.product_type,
        requires_booking: product.requires_booking,
        cover_url: productImageUrl(product.cover_url),
        outlet_id: outletId,
        variant_id: variants[0]?.id ?? null,
        variant_label: variants[0]?.name ?? null,
        first_available_slot_id: firstSlotByProduct.get(product.id) ?? null,
        available_stock: availableStock,
        rating: metric.rating,
        reviews: metric.reviews,
      };
    }),
    featuredIds
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: outlet.name,
    description: publicDocument.seoDescription || profile.introBody,
    telephone: profile.phone,
    email: profile.email,
    address: { "@type": "PostalAddress", streetAddress: profile.address, addressLocality: profile.city, addressRegion: profile.state, addressCountry: profile.country === "Malaysia" ? "MY" : profile.country },
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/customer/vendor/${vendorId}/outlet/${outlet.id}`,
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 pt-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("ui.outletPage.verified")}</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{outlet.name}</p>
          {vendor && (
            <p className="mt-0.5 text-xs text-muted-foreground/60">
              {t("ui.outletPage.by")} {" "}
              <a href={`/customer/vendor/${vendorId}`} className="font-semibold text-primary hover:underline">
                {vendor.name}
              </a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShareButton shareType="outlet" contentId={outlet.id} title={outlet.name} />
          <OutletChatButton outletId={outlet.id} />
        </div>
      </div>
      {outletNavigation.hasMultipleOutlets && <div className="mx-auto max-w-7xl px-6 pt-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/10 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("ui.outlet.exploreOutlet")}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{t("ui.labels.location")} {outletNavigation.currentPosition} / {outletNavigation.total} · {outlet.name}</p>
          </div>
          <a href={`/customer/vendor/${vendorId}#locations`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">{t("ui.actions.viewAll")} {t("ui.vendor.activeOutletCount", { count: outletNavigation.total })} <ArrowRight size={15} /></a>
        </div>
      </div>}
      <OutletPageRenderer document={publicDocument} outlet={publicOutlet} products={menuProducts} mode="public" />
    </main>
  );
}
