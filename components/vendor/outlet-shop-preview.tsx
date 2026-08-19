"use client";

import { ExternalLink, Pencil, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { OutletPageRenderer } from "@/components/outlet/outlet-page-renderer";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import {
  createDefaultOutletPageDocument,
  type OutletPageDocument,
} from "@/lib/vendor/outlet-page-schema";

interface OutletPreviewData {
  document: OutletPageDocument;
  isPublished: boolean;
  publishedAt: string | null;
}

interface Product {
  id: string;
  name: string;
  base_price: number;
  cover_url?: string | null;
}

interface Props {
  vendorId: string;
  outlet: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  onEdit: () => void;
}

export default function OutletShopPreview({ vendorId, outlet, onEdit }: Props) {
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
          throw new Error(payload.error?.message || "Could not load shop page");
        return payload.data;
      }),
      fetch(
        `/api/vendors/${vendorId}/products?outlet_id=${outlet.id}&page=1&pageSize=24`,
        { cache: "no-store" },
      ).then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error?.message || "Could not load shop products");
        return payload.data?.items || [];
      }),
    ])
      .then(([page, productItems]) => {
        if (!active) return;
        setPreview({
          document:
            page?.isPublished && page.published
              ? page.published
              : page?.draft || createDefaultOutletPageDocument(outlet.name),
          isPublished: Boolean(page?.isPublished),
          publishedAt: page?.publishedAt || null,
        });
        setProducts(
          productItems.map((product: Product) => ({
            ...product,
            base_price: Number(product.base_price),
          })),
        );
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not load shop page");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [outlet.id, outlet.name, vendorId]);

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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-3xl border border-primary/10 bg-white p-5 shadow-sm sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Store size={15} /> Shop page
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            {outlet.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Review the page customers see, then edit it when you are ready.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${preview.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}
            >
              {preview.isPublished ? "Published" : "Preview only"}
            </span>
            {preview.publishedAt && (
              <span>
                Live since {new Date(preview.publishedAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {preview.isPublished ? (
            <a
              href={getOutletShopHref(outlet.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/15 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-secondary"
            >
              View public shop <ExternalLink size={15} />
            </a>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-400">
              Publish to go live
            </span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
          >
            <Pencil size={15} /> Edit shop page
          </button>
        </div>
      </header>

      {!preview.isPublished && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This is a private preview. Customers will not see these changes until you publish the shop page.
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-1 border-b border-gray-100 bg-gray-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Customer preview
            </p>
            <p className="mt-1 text-xs text-gray-500">
              This preview uses the same page renderer as the public shop.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-400">
            {preview.isPublished ? "Live version" : "Draft version"}
          </span>
        </div>
        <div className="bg-[#f8fafc] p-3 sm:p-6">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <OutletPageRenderer
              document={preview.document}
              outlet={outlet}
              products={products}
              mode="public"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
