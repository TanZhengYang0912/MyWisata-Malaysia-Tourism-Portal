"use client";

import { ExternalLink, Pencil, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { OutletPageRenderer } from "@/components/outlet/outlet-page-renderer";
import type { OutletRendererOutlet } from "@/components/outlet/outlet-block-types";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import { relationOne, resolveStaySearch, selectPublicOutletPreviewProducts } from "@/lib/customer/outlet-shop";
import { loadOutletPreviewProductPages } from "@/lib/vendor/outlet-preview-products";
import { useTranslation } from "react-i18next";
import { isAppLocale } from "@/lib/i18n/locale";
import { formatDateTime } from "@/lib/i18n/format";
import {
  createDefaultOutletPageDocument,
  type OutletPageDocument,
} from "@/lib/vendor/outlet-page-schema";
import type { HotelProfile } from "@/lib/validation/vendor-schemas";

interface HotelAmenityOption {
  code: string;
  label_en: string;
  label_ms: string;
  label_zh: string;
  icon: string;
}

interface HotelProfileResponse {
  isHotel: boolean;
  live: HotelProfile;
  pending: HotelProfile | null;
  lastRejection: { note: string | null; reviewedAt: string | null } | null;
  amenities: HotelAmenityOption[];
}

interface HotelProfilePreview {
  profile: HotelProfile;
  amenities: HotelAmenityOption[];
  state: "live" | "pending" | "rejected";
  rejectionNote: string | null;
}

interface OutletPreviewData {
  document: OutletPageDocument;
  isPublished: boolean;
  publishedAt: string | null;
  hotelProfile: HotelProfilePreview | null;
}

interface Product {
  id: string;
  name: string;
  base_price: number;
  status: string;
  review_status: string;
  cover_url?: string | null;
  description?: string | null;
  requires_booking?: boolean;
  categories?: { name?: string | null; slug?: string | null } | { name?: string | null; slug?: string | null }[] | null;
  category?: string | null;
  category_slug?: string | null;
}

interface Props {
  vendorId: string;
  outlet: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    operating_hours?: unknown;
    isAccommodationOutlet?: boolean;
  };
  onEdit: () => void;
}

export default function OutletShopPreview({ vendorId, outlet, onEdit }: Props) {
  const { t, i18n } = useTranslation("vendor");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";
  const [preview, setPreview] = useState<OutletPreviewData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");

    Promise.all([
      fetch(`/api/vendors/${vendorId}/outlets/${outlet.id}/page`, {
        cache: "no-store",
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error?.message || t("shopPreview.loadPageFailed"));
        return payload.data;
      }),
      outlet.isAccommodationOutlet
        ? fetch(`/api/vendors/${vendorId}/outlets/${outlet.id}/hotel-profile`, {
            cache: "no-store",
          }).then(async (response): Promise<HotelProfileResponse | null> => {
            if (response.status === 409) return null;
            const payload = await response.json();
            if (!response.ok || !payload.data?.isHotel)
              throw new Error(payload.error?.message || t("shopPreview.loadPageFailed"));
            return payload.data as HotelProfileResponse;
          })
        : Promise.resolve(null),
      loadOutletPreviewProductPages<Product>(async (page) => {
        const query = new URLSearchParams({
          outlet_id: outlet.id,
          status: "active",
          review_status: "approved",
          page: String(page),
          pageSize: "24",
        });
        const response = await fetch(
          `/api/vendors/${vendorId}/products?${query.toString()}`,
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error?.message || t("shopPreview.loadProductsFailed"));
        return {
          items: payload.data?.items || [],
          totalPages: Number(payload.data?.pagination?.totalPages),
        };
      }),
    ])
      .then(([page, hotelProfileData, productItems]) => {
        if (!active) return;
        const hotelProfile = hotelProfileData
          ? {
              profile: hotelProfileData.pending ?? hotelProfileData.live,
              amenities: hotelProfileData.amenities,
              state: hotelProfileData.pending ? "pending" as const : hotelProfileData.lastRejection ? "rejected" as const : "live" as const,
              rejectionNote: hotelProfileData.lastRejection?.note ?? null,
            }
          : null;
        setPreview({
          document:
            page?.isPublished && page.published
              ? page.published
              : page?.draft || createDefaultOutletPageDocument(outlet.name),
          isPublished: Boolean(page?.isPublished),
          publishedAt: page?.publishedAt || null,
          hotelProfile,
        });
        setProducts(
          selectPublicOutletPreviewProducts(productItems).map((product) => ({
            ...product,
            base_price: Number(product.base_price),
            category: relationOne(product.categories)?.name ?? product.category ?? null,
            category_slug: relationOne(product.categories)?.slug ?? null,
          })),
        );
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : t("shopPreview.loadPageFailed"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [outlet.id, outlet.isAccommodationOutlet, outlet.name, t, vendorId]);

  if (loading)
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-3xl bg-gray-100" />
        <div className="h-[520px] animate-pulse rounded-3xl bg-gray-100" />
      </div>
    );

  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {error}
      </div>
    );

  if (!preview) return null;

  const hotelProfile = preview.hotelProfile;
  const hotel = hotelProfile?.profile;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const staySearch = resolveStaySearch({}, today);
  const rendererOutlet: OutletRendererOutlet = hotelProfile && hotel ? {
    ...outlet,
    address: hotel.address ?? outlet.address,
    city: hotel.city ?? outlet.city,
    state: hotel.state ?? outlet.state,
    country: hotel.country ?? undefined,
    phone: hotel.phone ?? undefined,
    email: hotel.email ?? undefined,
    stay: {
      ...staySearch,
      checkInTime: hotel.checkInTime || null,
      checkOutTime: hotel.checkOutTime || null,
      policies: hotel.policies || null,
      about: hotel.about.trim() || null,
      photos: hotel.photos.map((url) => ({ url })),
      amenities: hotelProfile.amenities
        .filter((amenity) => hotel.amenityCodes.includes(amenity.code))
        .map((amenity) => ({
          code: amenity.code,
          label: locale === "ms" ? amenity.label_ms : locale === "zh-CN" ? amenity.label_zh : amenity.label_en,
          icon: amenity.icon,
        })),
      rating: 0,
      reviews: 0,
    },
  } : outlet;

  return (
    <div className="space-y-3 sm:space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-primary/10 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Store size={15} /> {t("shopPreview.title")}
          </div>
          <h1 className="break-words text-2xl font-bold tracking-tight text-gray-950">
            {outlet.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${preview.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}
            >
              {preview.isPublished ? t("shopPreview.published") : t("shopPreview.previewOnly")}
            </span>
            {hotelProfile && <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${hotelProfile.state === "pending" ? "bg-amber-100 text-amber-800" : hotelProfile.state === "rejected" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
              {t("hotelProfile.eyebrow")}: {t(`shopPreview.hotelProfileStatus.${hotelProfile.state}`, { note: hotelProfile.rejectionNote ?? "" })}
            </span>}
            {preview.publishedAt && (
              <span>
                {t("shopPreview.liveSince", { date: formatDateTime(preview.publishedAt, locale) })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {preview.isPublished ? (
            <a
              href={getOutletShopHref(outlet.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary/15 px-3 py-2.5 text-sm font-semibold text-primary transition hover:bg-secondary sm:flex-none sm:px-4"
            >
              {t("shopPreview.viewPublicShop")} <ExternalLink size={15} />
            </a>
          ) : (
              <span className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-400 sm:flex-none sm:px-4">
              {t("shopPreview.publishToGoLive")}
            </span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="order-first inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 sm:order-last sm:w-auto sm:py-2.5"
          >
            <Pencil size={15} /> {t("shopPreview.editShopPage")}
          </button>
        </div>
      </header>

      {!preview.isPublished && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("shopPreview.privatePreview")}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:rounded-3xl">
        <div className="flex flex-col gap-1 border-b border-gray-100 bg-gray-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t("shopPreview.customerPreview")}
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-400">
            {preview.isPublished ? t("shopPreview.liveVersion") : t("shopPreview.draftVersion")}
          </span>
        </div>
        <div className="bg-[#f8fafc] p-0 sm:p-6">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-none border-0 bg-white shadow-none sm:rounded-3xl sm:border sm:border-gray-100 sm:shadow-sm">
            <OutletPageRenderer
              document={preview.document}
              outlet={rendererOutlet}
              products={products}
              mode="public"
              previewOnly={Boolean(hotelProfile)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
