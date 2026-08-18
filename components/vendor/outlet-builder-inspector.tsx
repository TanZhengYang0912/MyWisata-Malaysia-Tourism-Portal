"use client";

import type {
  GalleryItem,
  OutletPageBlock,
  OutletPageBlockType,
} from "@/lib/vendor/outlet-page-schema";
import ProductMediaUploader from "@/components/vendor/product-media-uploader";
import { getBuilderBlockLabel } from "@/components/vendor/outlet-builder-ui";
import AiWritingAssistant from "@/components/vendor/ai-writing-assistant";
import { useTranslation } from "react-i18next";

interface ProductOption {
  id: string;
  name: string;
  base_price: number;
}

interface Props {
  vendorId: string;
  block?: OutletPageBlock | null;
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
  heroAiDraft?: { title: string; body: string; cta?: string } | null;
  heroAiBusy?: boolean;
  heroAiError?: string | null;
  onGenerateHeroAi?: () => void;
  onApplyHeroAi?: () => void;
  onDiscardHeroAi?: () => void;
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
            className="group overflow-hidden rounded-lg border border-white bg-white text-left shadow-sm hover:border-primary"
            title={t("builder.inspector.useImage")}
          >
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

export default function OutletBuilderInspector({
  vendorId,
  block,
  hero,
  gallery,
  products,
  mediaUrls,
  onUpdateBlock,
  onUpdateHero,
  onUpdateGallery,
  heroAiDraft,
  heroAiBusy,
  heroAiError,
  onGenerateHeroAi,
  onApplyHeroAi,
  onDiscardHeroAi,
}: Props) {
  const { t } = useTranslation("vendor");
  const panelClassName =
    "min-h-0 max-h-[42vh] overflow-y-auto border-t border-primary/10 bg-white p-5 lg:sticky lg:top-0 lg:max-h-none lg:border-l lg:border-t-0";

  if (hero)
    return (
      <aside className={panelClassName} aria-label={t("builder.inspector.editSelected")}>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          {t("builder.inspector.editingHero")}
        </p>
        <div className="mt-4 space-y-3">
          {onGenerateHeroAi && <AiWritingAssistant
            compact
            label={t("assistant.heroLabel")}
            buttonLabel={t("assistant.generate")}
            draft={heroAiDraft && <div><p className="font-semibold">{heroAiDraft.title}</p><p className="mt-1">{heroAiDraft.body}</p>{heroAiDraft.cta && <p className="mt-2 text-xs text-gray-500">{t("builder.inspector.buttonValue", { value: heroAiDraft.cta })}</p>}</div>}
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
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />,
          )}
          <div>
            <p className="text-xs font-semibold text-gray-600">{t("builder.inspector.heroImage")}</p>
            <div className="mt-1">
              <ProductMediaUploader
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
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs"
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
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs"
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
              placeholder="/customer/activity/..."
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
        {t("builder.inspector.editing", { label: t(`builder.blockTypes.${block.type}`, { defaultValue: getBuilderBlockLabel(block.type) }) })}
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
            className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-sm"
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
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
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
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
              {products.map((product) => (
                <label
                  key={product.id}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-secondary"
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
                  <span className="min-w-0 flex-1 truncate">
                    {product.name}
                  </span>
                  <span className="font-mono text-[10px] text-gray-400">
                    RM {Number(product.base_price).toFixed(2)}
                  </span>
                </label>
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
          t("builder.inspector.backgroundColour"),
          <input
            type="color"
            value={block.style?.backgroundColor || "#ffffff"}
            onChange={(event) =>
              onUpdateBlock({
                style: { ...block.style, backgroundColor: event.target.value },
              })
            }
            className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white p-1"
          />,
        )}
      </div>
    </aside>
  );
}

export type { OutletPageBlockType };
