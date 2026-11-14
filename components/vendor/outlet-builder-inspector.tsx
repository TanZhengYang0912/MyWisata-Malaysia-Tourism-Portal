"use client";

import type {
  GalleryItem,
  OutletBlockOverrides,
  OutletPageBlock,
  OutletPageBlockType,
} from "@/lib/vendor/outlet-page-schema";
import { canResizeBlockTo } from "@/lib/vendor/outlet-page-schema";
import { GRID_SIZE_PRESETS } from "@/lib/vendor/outlet-grid";
import ProductMediaUploader from "@/components/vendor/product-media-uploader";
import AiWritingAssistant from "@/components/vendor/ai-writing-assistant";
import { resolveBlockContent } from "@/components/outlet/outlet-block-renderer";
import type { OutletRendererOutlet } from "@/components/outlet/outlet-block-types";
import { canonicalCategorySlug, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMYR } from "@/lib/i18n/format";

export type HeroAiDraft = { title: string; body: string; cta?: string; seoDescription?: string };
type HeroAiField = keyof HeroAiDraft;

interface ProductOption {
  id: string;
  name: string;
  base_price: number;
  category?: string | null;
  category_slug?: string | null;
}

interface Props {
  vendorId: string;
  block?: OutletPageBlock | null;
  blocks: OutletPageBlock[];
  hero?: {
    title: string;
    body: string;
    imageUrl?: string;
    cta?: string;
    buttonLink?: string;
    overlayOpacity?: number;
    imagePosition?: string;
    textAlign?: "left" | "center" | "right";
  } | null;
  gallery: GalleryItem[];
  products: ProductOption[];
  mediaUrls: string[];
  onUpdateBlock: (updates: Partial<OutletPageBlock>) => void;
  onUpdateHero: (updates: Record<string, unknown>) => void;
  onUpdateGallery: (gallery: GalleryItem[]) => void;
  heroAiDraft?: HeroAiDraft | null;
  /** Current page SEO description, so the AI draft can be compared against it. */
  seoDescription?: string;
  heroAiBusy?: boolean;
  heroAiError?: string | null;
  onGenerateHeroAi?: () => void;
  onApplyHeroAi?: (picked: Partial<HeroAiDraft>) => void;
  onDiscardHeroAi?: () => void;
  outlet: OutletRendererOutlet;
}

/**
 * Side-by-side review of an AI hero suggestion. Each changed field can be
 * ticked off individually; nothing reaches the draft until Apply.
 */
function HeroAiDraftReview({
  draft,
  current,
  busy,
  error,
  onGenerate,
  onApply,
  onDiscard,
}: {
  draft: HeroAiDraft | null | undefined;
  current: Partial<HeroAiDraft>;
  busy?: boolean;
  error?: string | null;
  onGenerate: () => void;
  onApply?: (picked: Partial<HeroAiDraft>) => void;
  onDiscard?: () => void;
}) {
  const { t } = useTranslation("vendor");
  const [skipped, setSkipped] = useState<Set<HeroAiField>>(() => new Set());
  const [reviewedDraft, setReviewedDraft] = useState(draft);
  // A new suggestion resets the ticks (derived during render, no effect needed).
  if (draft !== reviewedDraft) {
    setReviewedDraft(draft);
    setSkipped(new Set());
  }
  const labels: Record<HeroAiField, string> = {
    title: t("builder.inspector.title"),
    body: t("builder.inspector.supportingCopy"),
    cta: t("builder.inspector.buttonLabel"),
    seoDescription: t("builder.seoDescription"),
  };
  const rows = draft
    ? (Object.keys(labels) as HeroAiField[])
      .map((field) => ({ field, before: (current[field] ?? "").trim(), after: (draft[field] ?? "").trim() }))
      .filter((row) => row.after && row.after !== row.before)
    : [];
  const picked = rows.filter((row) => !skipped.has(row.field));
  const apply = onApply && picked.length > 0
    ? () => onApply(Object.fromEntries(picked.map((row) => [row.field, row.after])) as Partial<HeroAiDraft>)
    : undefined;

  return (
    <AiWritingAssistant
      compact
      label={t("assistant.heroLabel")}
      buttonLabel={t("assistant.generate")}
      busy={busy}
      error={error}
      onGenerate={onGenerate}
      onApply={apply}
      onDiscard={onDiscard}
      draft={draft && (rows.length === 0
        ? <p className="text-xs text-gray-600">{t("builder.inspector.aiNoChanges")}</p>
        : (
          <ul className="divide-y divide-violet-100">
            {rows.map((row) => (
              <li key={row.field} className="py-2 first:pt-0 last:pb-0">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary"
                    checked={!skipped.has(row.field)}
                    onChange={(event) => setSkipped((prev) => {
                      const next = new Set(prev);
                      if (event.target.checked) next.delete(row.field);
                      else next.add(row.field);
                      return next;
                    })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-gray-500">{labels[row.field]}</span>
                    {row.before && <span className="block break-words text-xs text-gray-500 line-through decoration-gray-400/70">{row.before}</span>}
                    <span className="block break-words text-sm text-gray-900">{row.after}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ))}
    />
  );
}

function MediaLibrary({
  urls,
  onUse,
}: {
  urls: string[];
  onUse: (url: string) => void;
}) {
  const { t } = useTranslation("vendor");
  if (!urls.length) return null;

  return (
    <div className="rounded-2xl border border-primary/10 bg-secondary/40 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
        {t("builder.inspector.outletMedia")}
      </p>
      <p className="mt-1 text-[10px] text-gray-500">
        {t("builder.inspector.reuseMedia")}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {urls.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onUse(url)}
            className="group overflow-hidden rounded-lg border border-white bg-card text-left shadow-sm hover:border-primary"
            title={t("builder.inspector.useImage")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="aspect-square w-full object-cover transition group-hover:scale-105"
            />
            <span className="block truncate px-1 py-1 text-[9px] font-semibold text-primary">
              {t("builder.inspector.useImage")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function fieldLabel(label: string, children: React.ReactNode) {
  return (
    <label className="block text-xs font-semibold text-gray-600">
      {label}
      {children}
    </label>
  );
}

/**
 * Next overrides object after editing one field. A blank value deletes the
 * key so the block falls back to live outlet data; when nothing is left the
 * whole object is dropped rather than stored empty.
 */
export function overrideUpdate(
  current: OutletBlockOverrides | undefined,
  key: keyof OutletBlockOverrides,
  value: string,
): OutletBlockOverrides | undefined {
  const next = { ...current };
  if (value.trim()) next[key] = value;
  else delete next[key];
  return Object.keys(next).length ? next : undefined;
}

/** Which live values each block type lets a vendor override. */
const OVERRIDE_FIELDS: Partial<Record<OutletPageBlockType, { key: keyof OutletBlockOverrides; label: string }[]>> = {
  hours: [{ key: "hours", label: "Opening hours" }],
  contact: [
    { key: "address", label: "Address" },
    { key: "phone", label: "Phone" },
  ],
  review_highlight: [{ key: "review", label: "Review quote" }],
};

export default function OutletBuilderInspector({
  vendorId,
  block,
  blocks,
  hero,
  gallery,
  products,
  mediaUrls,
  onUpdateBlock,
  onUpdateHero,
  onUpdateGallery,
  heroAiDraft,
  seoDescription,
  heroAiBusy,
  heroAiError,
  onGenerateHeroAi,
  onApplyHeroAi,
  onDiscardHeroAi,
  outlet,
}: Props) {
  const { t } = useTranslation(["vendor", "customer"]);
  const productGroups = Array.from(products.reduce((groups, product) => {
    const normalizedSlug = product.category_slug?.trim().toLowerCase();
    const key = canonicalCategorySlug(normalizedSlug) || normalizedSlug || product.category?.trim().toLowerCase() || "uncategorized";
    const existing = groups.get(key);
    if (existing) existing.products.push(product);
    else {
      const labelKey = getOptionalDiscoveryCategoryLabelKey(product.category_slug);
      groups.set(key, {
        label: labelKey ? t(labelKey, { ns: "customer" }) : product.category || t("builder.inspector.uncategorized"),
        products: [product],
      });
    }
    return groups;
  }, new Map<string, { label: string; products: ProductOption[] }>()));
  const categoryOrder = ["accommodation", "food", "activity", "retail"];
  productGroups.sort(([left], [right]) => {
    const leftIndex = categoryOrder.indexOf(left);
    const rightIndex = categoryOrder.indexOf(right);
    return (leftIndex < 0 ? categoryOrder.length : leftIndex) - (rightIndex < 0 ? categoryOrder.length : rightIndex);
  });
  const panelClassName =
    "min-h-0 h-full overflow-y-auto border-t border-primary/10 bg-card p-4 sm:p-5 lg:sticky lg:top-0 lg:border-l lg:border-t-0";

  if (hero)
    return (
      <aside className={panelClassName} aria-label={t("builder.inspector.editSelected")}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          {t("builder.inspector.editingHero")}
        </p>
        <div className="mt-4 space-y-3">
          {onGenerateHeroAi && <HeroAiDraftReview
            draft={heroAiDraft}
            current={{ title: hero.title, body: hero.body, cta: hero.cta, seoDescription }}
            busy={heroAiBusy}
            error={heroAiError}
            onGenerate={onGenerateHeroAi}
            onApply={onApplyHeroAi}
            onDiscard={onDiscardHeroAi}
          />}
          {fieldLabel(
            t("builder.inspector.title"),
            <input
              value={hero.title}
              onChange={(event) => onUpdateHero({ title: event.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
          <MediaLibrary
            urls={mediaUrls}
            onUse={(url) => onUpdateHero({ imageUrl: url })}
          />
          {fieldLabel(
            t("builder.inspector.supportingCopy"),
            <textarea
              value={hero.body}
              onChange={(event) => onUpdateHero({ body: event.target.value })}
              rows={3}
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />,
          )}
          <div>
            <p className="text-xs font-semibold text-gray-600">{t("builder.inspector.heroImage")}</p>
            <div className="mt-1">
              <ProductMediaUploader
                shape="banner"
                vendorId={vendorId}
                value={hero.imageUrl}
                onUploaded={(media) => onUpdateHero({ imageUrl: media.url })}
              />
            </div>
          </div>
          {fieldLabel(
            t("builder.inspector.imageUrl"),
            <input
              value={hero.imageUrl || ""}
              onChange={(event) =>
                onUpdateHero({ imageUrl: event.target.value })
              }
              placeholder={t("builder.inspector.imageUrlPlaceholder")}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
          <div className="grid grid-cols-2 gap-3">
            {fieldLabel(
              t("builder.inspector.textAlignment"),
              <select
                value={hero.textAlign || "left"}
                onChange={(event) =>
                  onUpdateHero({ textAlign: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-card px-2 text-xs"
              >
                <option value="left">{t("builder.inspector.left")}</option>
                <option value="center">{t("builder.inspector.center")}</option>
                <option value="right">{t("builder.inspector.right")}</option>
              </select>,
            )}
            {fieldLabel(
              t("builder.inspector.imagePosition"),
              <select
                value={hero.imagePosition || "center"}
                onChange={(event) =>
                  onUpdateHero({ imagePosition: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-card px-2 text-xs"
              >
                <option value="center">{t("builder.inspector.center")}</option>
                <option value="top">{t("builder.inspector.top")}</option>
                <option value="bottom">{t("builder.inspector.bottom")}</option>
              </select>,
            )}
          </div>
          {fieldLabel(
            t("builder.inspector.buttonLabel"),
            <input
              value={hero.cta || ""}
              onChange={(event) => onUpdateHero({ cta: event.target.value })}
              placeholder={t("builder.inspector.explorePlaceholder")}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
          {fieldLabel(
            t("builder.inspector.buttonLink"),
            <input
              value={hero.buttonLink || ""}
              onChange={(event) =>
                onUpdateHero({ buttonLink: event.target.value })
              }
              placeholder="/customer/products/..."
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
        </div>
      </aside>
    );

  if (!block)
    return (
      <aside className={panelClassName} aria-label={t("builder.inspector.editSelected")}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          {t("builder.inspector.editElement")}
        </p>
        <div className="mt-5 rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs leading-5 text-gray-400">
          {t("builder.inspector.selectElement")}
        </div>
      </aside>
    );

  const update = (key: keyof OutletPageBlock, value: string) =>
    onUpdateBlock({ [key]: value || undefined });
  const isPhoto = block.type === "image" || block.type === "image_text";
  const isPhotoStory = block.type === "image_text";

  return (
    <aside className={panelClassName} aria-label={t("builder.inspector.editSelected")}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
        {t("builder.inspector.editing", { label: t(`builder.blockTypes.${block.type}`) })}
      </p>
      <div className="mt-4 space-y-3">
        {isPhoto && fieldLabel(
          t("builder.inspector.photoLayout"),
          <select
            aria-label={t("builder.inspector.photoLayout")}
            value={block.type}
            onChange={(event) =>
              onUpdateBlock({
                type: event.target.value as OutletPageBlock["type"],
              })
            }
            className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-card px-2 text-sm"
          >
            <option value="image">{t("builder.inspector.imageOnly")}</option>
            <option value="image_text">{t("builder.inspector.imageStory")}</option>
          </select>,
        )}
        {(!isPhoto || isPhotoStory) && fieldLabel(
          t("builder.inspector.title"),
          <input
            value={block.title || ""}
            onChange={(event) => update("title", event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
          />,
        )}
        {(!isPhoto || isPhotoStory) && fieldLabel(
          t("builder.inspector.supportingCopy"),
          <textarea
            value={block.body || ""}
            onChange={(event) => update("body", event.target.value)}
            rows={4}
            className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />,
        )}
        {isPhoto && (
          <>
            <div>
              <p className="text-xs font-semibold text-gray-600">{t("builder.inspector.image")}</p>
              <div className="mt-1">
                <ProductMediaUploader
                  vendorId={vendorId}
                  value={block.imageUrl || block.image}
                  onUploaded={(media) =>
                    onUpdateBlock({ imageUrl: media.url, image: media.url })
                  }
                />
              </div>
            </div>
            {fieldLabel(
              t("builder.inspector.imageUrl"),
              <input
                value={block.imageUrl || block.image || ""}
                onChange={(event) =>
                  onUpdateBlock({
                    imageUrl: event.target.value,
                    image: event.target.value,
                  })
                }
                placeholder={t("builder.inspector.imageUrlPaste")}
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              />,
            )}
            <MediaLibrary
              urls={mediaUrls}
              onUse={(url) => onUpdateBlock({ imageUrl: url, image: url })}
            />
          </>
        )}
        {["cta", "voucher_banner"].includes(block.type) &&
          fieldLabel(
            t("builder.inspector.buttonLabel"),
            <input
              value={block.cta || ""}
              onChange={(event) => update("cta", event.target.value)}
              placeholder={t("builder.inspector.explorePlaceholder")}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
        {block.type === "product_grid" && (
          <div>
            <p className="text-xs font-semibold text-gray-600">
              {t("builder.inspector.productsFromOutlet")}
            </p>
            <div className="mt-2 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-gray-200 p-2">
              {productGroups.map(([categoryKey, group]) => (
                <section key={categoryKey}>
                  <h4 className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-white px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    <span className="min-w-0 break-words">{group.label}</span>
                    <span className="shrink-0 font-mono">{group.products.length}</span>
                  </h4>
                  <div className="space-y-1">
                    {group.products.map((product) => (
                      <label
                        key={product.id}
                        className="flex min-h-10 items-start gap-2 rounded-lg px-1.5 py-2 text-xs hover:bg-secondary"
                      >
                        <input
                          type="checkbox"
                          checked={block.productIds?.includes(product.id) || false}
                          onChange={() => {
                            const current = block.productIds || [];
                            onUpdateBlock({
                              productIds: current.includes(product.id)
                                ? current.filter((id) => id !== product.id)
                                : [...current, product.id].slice(0, 12),
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1 break-words leading-4">
                          {product.name}
                        </span>
                        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-gray-400">
                          {formatMYR(Number(product.base_price))}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
        {block.type === "gallery" && (
          <div>
            <p className="text-xs font-semibold text-gray-600">
              {t("builder.inspector.galleryImages")}
            </p>
            <p className="mt-1 text-[11px] font-normal text-gray-400">
              {t("builder.inspector.galleryHint")}
            </p>
            <div className="mt-2 space-y-3">
              {gallery.map((item, index) => (
                <div
                  key={`${item.url}-${index}`}
                  className="rounded-xl border border-gray-200 p-2"
                >
                  <ProductMediaUploader
                    shape="photo"
                    vendorId={vendorId}
                    value={item.url}
                    onUploaded={(media) =>
                      onUpdateGallery(
                        gallery.map((current, currentIndex) =>
                          currentIndex === index
                            ? { ...current, url: media.url }
                            : current,
                        ),
                      )
                    }
                  />
                  {fieldLabel(
                    t("builder.inspector.imageUrl"),
                    <input
                      value={item.url}
                      onChange={(event) =>
                        onUpdateGallery(
                          gallery.map((current, currentIndex) =>
                            currentIndex === index
                              ? { ...current, url: event.target.value }
                              : current,
                          ),
                        )
                      }
                      className="mt-2 h-9 w-full rounded-lg border border-gray-200 px-2 text-xs"
                    />,
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateGallery(
                        gallery.filter(
                          (_, currentIndex) => currentIndex !== index,
                        ),
                      )
                    }
                    className="mt-2 text-xs font-semibold text-red-600 hover:underline"
                  >
                    {t("builder.inspector.removeImage")}
                  </button>
                </div>
              ))}
              {gallery.length < 50 && (
                <ProductMediaUploader
                  shape="photo"
                  vendorId={vendorId}
                  onUploaded={(media) =>
                    onUpdateGallery(
                      [...gallery, { url: media.url }].slice(0, 50),
                    )
                  }
                />
              )}
            </div>
            <p className="mt-2 text-[10px] text-gray-400">{t("builder.inspector.maxImages", { count: 50 })}</p>
          </div>
        )}
        {fieldLabel(
          t("builder.inspector.sizeOnPage"),
          <div className="mt-1 grid grid-cols-4 gap-1">
            {GRID_SIZE_PRESETS.map(([w, h]) => {
              const active = block.w === w && block.h === h;
              const allowed = canResizeBlockTo(blocks, block, w, h);
              return <button
                key={`${w}x${h}`}
                type="button"
                disabled={!allowed}
                onClick={() => onUpdateBlock({ w, h })}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-bold ${active ? "bg-primary text-white" : allowed ? "border border-gray-200 text-gray-700 hover:bg-secondary" : "cursor-not-allowed text-gray-300"}`}
              >{w}×{h}</button>;
            })}
          </div>,
        )}

        {OVERRIDE_FIELDS[block.type]?.map(({ key, label }) => {
          const live = resolveBlockContent({}, outlet, {
            scheduleUnavailable: t("customer:ui.outlet.scheduleBeforeBooking"),
            closed: t("customer:ui.outlet.closed"),
            day: (day) => t(`customer:ui.labels.days.${day.slice(0, 3).toLowerCase()}`),
            verifiedReview: t("customer:ui.outlet.verifiedGuestsRecommend"),
          })[key];
          const custom = Boolean(block.overrides?.[key]);
          return <div key={key}>
            {fieldLabel(
              label,
              <input
                value={block.overrides?.[key] || ""}
                placeholder={live || t("builder.inspector.notSetOnOutlet")}
                onChange={(event) =>
                  onUpdateBlock({ overrides: overrideUpdate(block.overrides, key, event.target.value) })
                }
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              />,
            )}
            <p className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
              {custom ? t("builder.inspector.custom") : t("builder.inspector.usingOutletData")}
              {custom && <button
                type="button"
                onClick={() => onUpdateBlock({ overrides: overrideUpdate(block.overrides, key, "") })}
                className="font-semibold text-primary hover:underline"
              >{t("builder.inspector.resetToOutlet")}</button>}
            </p>
          </div>;
        })}

        {fieldLabel(
          t("builder.inspector.backgroundColour"),
          <input
            type="color"
            value={block.style?.backgroundColor || "#ffffff"}
            onChange={(event) =>
              onUpdateBlock({
                style: { ...block.style, backgroundColor: event.target.value },
              })
            }
            className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-card p-1"
          />,
        )}
      </div>
    </aside>
  );
}

export type { OutletPageBlockType };
