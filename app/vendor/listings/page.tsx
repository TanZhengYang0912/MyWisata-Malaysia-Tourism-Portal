"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMYR } from "@/lib/i18n/format";
import { VendorPageHeader } from "@/components/vendor/vendor-page-header";

interface Listing {
  id: string;
  name: string;
  outlet_id: string;
  outlet: { id: string; name: string };
  category: string;
  requires_booking: boolean;
  price: number;
}

interface ListingPage {
  items: Listing[];
  totalPages: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isListing(value: unknown): value is Listing {
  if (!isRecord(value) || !isRecord(value.outlet)) return false;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.outlet_id === "string"
    && typeof value.outlet.id === "string"
    && typeof value.outlet.name === "string"
    && typeof value.category === "string"
    && typeof value.requires_booking === "boolean"
    && typeof value.price === "number";
}

function parseListingPage(payload: unknown): ListingPage | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  const items = payload.data.items;
  const pagination = payload.data.pagination;
  if (!Array.isArray(items) || !items.every(isListing) || !isRecord(pagination)) return null;
  if (typeof pagination.totalPages !== "number" || !Number.isInteger(pagination.totalPages) || pagination.totalPages < 1) return null;
  return { items, totalPages: pagination.totalPages };
}

export default function VendorListingsPage() {
  const { t } = useTranslation("vendor");
  const { activeVendorId, activeOutletIds } = useAuth();
  const activeOutletId = activeOutletIds?.[0];
  const scopeKey = `${activeVendorId ?? ""}:${activeOutletId ?? ""}`;
  const [listingState, setListingState] = useState<{ scopeKey: string; items: Listing[] }>({ scopeKey: "", items: [] });

  useEffect(() => {
    if (!activeVendorId) return;

    const controller = new AbortController();
    const requestPage = async (page: number): Promise<ListingPage> => {
      const params = new URLSearchParams({
        view: "listing_metadata",
        status: "active",
        review_status: "approved",
        page: String(page),
        pageSize: "100",
      });
      if (activeOutletId) params.set("outlet_id", activeOutletId);

      const response = await fetch(`/api/vendors/${encodeURIComponent(activeVendorId)}/products?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Vendor listings request failed with status ${response.status}`);
      const result = parseListingPage(await response.json());
      if (!result) throw new Error("Vendor listings response did not match the expected shape");
      return result;
    };

    void (async () => {
      try {
        const firstPage = await requestPage(1);
        const items = [...firstPage.items];
        for (let page = 2; page <= firstPage.totalPages; page += 1) {
          const nextPage = await requestPage(page);
          items.push(...nextPage.items);
        }
        if (!controller.signal.aborted) setListingState({ scopeKey: `${activeVendorId}:${activeOutletId ?? ""}`, items });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Failed to load vendor listings", error);
          setListingState({ scopeKey: `${activeVendorId}:${activeOutletId ?? ""}`, items: [] });
        }
      }
    })();

    return () => controller.abort();
  }, [activeOutletId, activeVendorId]);

  const listings = listingState.scopeKey === scopeKey ? listingState.items : [];

  return (
    <div className="space-y-5">
      <VendorPageHeader title={t("ui.listings.title")} />
      {listings.length === 0 ? (
        <EmptyState title={t("ui.listings.emptyTitle")} description={t("ui.listings.emptyDescription")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <div data-mobile-listing-list className="divide-y divide-border md:hidden">
            {listings.map((listing) => (
              <article key={listing.id} className="space-y-3 p-4">
                <h2 className="break-words font-semibold text-foreground">{listing.name}</h2>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="min-w-0"><dt className="font-semibold text-muted-foreground">{t("ui.listings.outlet")}</dt><dd className="mt-1 break-words text-foreground">{listing.outlet.name}</dd></div>
                  <div className="min-w-0"><dt className="font-semibold text-muted-foreground">{t("ui.listings.category")}</dt><dd className="mt-1 break-words text-foreground">{listing.category}</dd></div>
                  <div><dt className="font-semibold text-muted-foreground">{t("ui.listings.bookingRequired")}</dt><dd className="mt-1 text-foreground">{listing.requires_booking ? t("ui.common.yes") : t("ui.common.no")}</dd></div>
                  <div><dt className="font-semibold text-muted-foreground">{t("ui.listings.price")}</dt><dd className="mt-1 font-bold text-primary font-[family-name:var(--font-mono)]">{formatMYR(listing.price)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="bg-muted">
                {[t("ui.listings.listing"), t("ui.listings.outlet"), t("ui.listings.category"), t("ui.listings.bookingRequired"), t("ui.listings.price")].map((heading) => (
                  <th key={heading} className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td className="px-6 py-4 font-semibold text-sm text-foreground">{listing.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{listing.outlet.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{listing.category}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{listing.requires_booking ? t("ui.common.yes") : t("ui.common.no")}</td>
                  <td className="px-6 py-4 text-sm font-bold text-primary font-[family-name:var(--font-mono)]">{formatMYR(listing.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
