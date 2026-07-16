"use client";

import type {
  GalleryItem,
  OutletPageBlock,
  OutletPageBlockType,
} from "@/lib/vendor/outlet-page-schema";
import ProductMediaUploader from "@/components/vendor/product-media-uploader";

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
  onUpdateBlock: (updates: Partial<OutletPageBlock>) => void;
  onUpdateHero: (updates: Record<string, unknown>) => void;
  onUpdateGallery: (gallery: GalleryItem[]) => void;
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
  onUpdateBlock,
  onUpdateHero,
  onUpdateGallery,
}: Props) {
  if (hero)
    return (
      <aside className="border-t border-primary/10 bg-white p-5 lg:border-l lg:border-t-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Edit Hero banner
        </p>
        <div className="mt-4 space-y-3">
          {fieldLabel(
            "Title",
            <input
              value={hero.title}
              onChange={(event) => onUpdateHero({ title: event.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
          {fieldLabel(
            "Supporting copy",
            <textarea
              value={hero.body}
              onChange={(event) => onUpdateHero({ body: event.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />,
          )}
          <div>
            <p className="text-xs font-semibold text-gray-600">Hero image</p>
            <div className="mt-1">
              <ProductMediaUploader
                vendorId={vendorId}
                value={hero.imageUrl}
                onUploaded={(media) => onUpdateHero({ imageUrl: media.url })}
              />
            </div>
          </div>
          {fieldLabel(
            "Image URL",
            <input
              value={hero.imageUrl || ""}
              onChange={(event) =>
                onUpdateHero({ imageUrl: event.target.value })
              }
              placeholder="Upload or paste image URL"
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
          <div className="grid grid-cols-2 gap-3">
            {fieldLabel(
              "Text alignment",
              <select
                value={hero.textAlign || "left"}
                onChange={(event) =>
                  onUpdateHero({ textAlign: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>,
            )}
            {fieldLabel(
              "Image position",
              <select
                value={hero.imagePosition || "center"}
                onChange={(event) =>
                  onUpdateHero({ imagePosition: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-2 text-xs"
              >
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>,
            )}
          </div>
          {fieldLabel(
            "Button label",
            <input
              value={hero.cta || ""}
              onChange={(event) => onUpdateHero({ cta: event.target.value })}
              placeholder="Explore now"
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
          {fieldLabel(
            "Button link",
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
      <aside className="border-t border-primary/10 bg-white p-5 lg:border-l lg:border-t-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Edit element
        </p>
        <div className="mt-5 rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs leading-5 text-gray-400">
          Select an element in the canvas to edit it.
        </div>
      </aside>
    );

  const update = (key: keyof OutletPageBlock, value: string) =>
    onUpdateBlock({ [key]: value || undefined });

  return (
    <aside className="border-t border-primary/10 bg-white p-5 lg:border-l lg:border-t-0">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
        Edit {block.type.replace("_", " ")}
      </p>
      <div className="mt-4 space-y-3">
        {fieldLabel(
          "Title",
          <input
            value={block.title || ""}
            onChange={(event) => update("title", event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
          />,
        )}
        {fieldLabel(
          "Supporting copy",
          <textarea
            value={block.body || ""}
            onChange={(event) => update("body", event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />,
        )}
        {["image", "image_text"].includes(block.type) && (
          <>
            <div>
              <p className="text-xs font-semibold text-gray-600">Image</p>
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
              "Image URL",
              <input
                value={block.imageUrl || block.image || ""}
                onChange={(event) =>
                  onUpdateBlock({
                    imageUrl: event.target.value,
                    image: event.target.value,
                  })
                }
                placeholder="Or paste an image URL"
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              />,
            )}
          </>
        )}
        {["cta", "voucher_banner"].includes(block.type) &&
          fieldLabel(
            "Button label",
            <input
              value={block.cta || ""}
              onChange={(event) => update("cta", event.target.value)}
              placeholder="Explore now"
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
            />,
          )}
        {block.type === "product_grid" && (
          <div>
            <p className="text-xs font-semibold text-gray-600">
              Products from this outlet
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
              Gallery images
            </p>
            <p className="mt-1 text-[11px] font-normal text-gray-400">
              Upload images directly. They will appear in this Gallery block on
              the public shop.
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
                    "Image URL",
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
                    Remove image
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
            <p className="mt-2 text-[10px] text-gray-400">Maximum 50 images.</p>
          </div>
        )}
        {fieldLabel(
          "Background colour",
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
