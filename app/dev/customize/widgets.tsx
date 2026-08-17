"use client";

// Editable bodies for each widget type in the /dev/customize sandbox, plus a
// small image picker that mirrors the look of the real vendor media uploader
// (components/vendor/product-media-uploader.tsx) without its backend — this
// sandbox has no authenticated vendor/outlet to upload against.
// ponytail: object-URL preview, no backend — in the real vendor area this
// becomes <ProductMediaUploader> unchanged.

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Clock, FileUp, ImageIcon, MapPin, Megaphone, Plus, ShoppingBag, Star, Tag, Trash2, User } from "lucide-react";

export type WidgetType = "cover" | "about" | "hours" | "gallery" | "contact" | "products" | "promo" | "reviews" | "announcement" | "social";

export interface DayHours { open: string; close: string; closed: boolean }
export interface CoverContent { title: string; subtitle: string; imageUrl: string; buttonLabel: string }
export interface AboutContent { title: string; body: string }
export interface HoursContent { days: DayHours[] }
export interface GalleryContent { images: { url: string }[] }
export interface ContactContent { address: string; phone: string }
export interface ProductsContent { items: { name: string; price: string }[] }
export interface PromoContent { title: string; code: string }
export interface ReviewsContent { items: { text: string; rating: number }[] }
export interface AnnouncementContent { text: string }
export interface SocialContent { links: { platform: string; url: string }[] }
export type WidgetTranslate = (key: string) => string;

export type ContentFor<T extends WidgetType> = T extends "cover" ? CoverContent
  : T extends "about" ? AboutContent
  : T extends "hours" ? HoursContent
  : T extends "gallery" ? GalleryContent
  : T extends "contact" ? ContactContent
  : T extends "products" ? ProductsContent
  : T extends "promo" ? PromoContent
  : T extends "reviews" ? ReviewsContent
  : T extends "announcement" ? AnnouncementContent
  : SocialContent;

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const WIDGET_CATALOG: Record<WidgetType, { icon: typeof Clock; defaultSize: [number, number] }> = {
  cover: { icon: ImageIcon, defaultSize: [4, 2] },
  about: { icon: User, defaultSize: [2, 1] },
  hours: { icon: Clock, defaultSize: [2, 3] },
  gallery: { icon: ImageIcon, defaultSize: [3, 2] },
  contact: { icon: MapPin, defaultSize: [2, 2] },
  products: { icon: ShoppingBag, defaultSize: [3, 2] },
  promo: { icon: Tag, defaultSize: [2, 1] },
  reviews: { icon: Star, defaultSize: [2, 2] },
  announcement: { icon: Megaphone, defaultSize: [4, 1] },
  social: { icon: User, defaultSize: [2, 1] },
};
export const WIDGET_ORDER = Object.keys(WIDGET_CATALOG) as WidgetType[];

export function defaultContent(type: WidgetType, t: WidgetTranslate): unknown {
  switch (type) {
    case "cover": return { title: t("dev.customize.defaults.coverTitle"), subtitle: t("dev.customize.defaults.coverSubtitle"), imageUrl: "", buttonLabel: t("dev.customize.defaults.coverButton") } satisfies CoverContent;
    case "about": return { title: t("dev.customize.defaults.aboutTitle"), body: t("dev.customize.defaults.aboutBody") } satisfies AboutContent;
    case "hours": return { days: DAY_KEYS.map((_, i) => ({ open: "09:00", close: "18:00", closed: i === 6 })) } satisfies HoursContent;
    case "gallery": return { images: [{ url: "" }, { url: "" }, { url: "" }] } satisfies GalleryContent;
    case "contact": return { address: t("dev.customize.defaults.contactAddress"), phone: t("dev.customize.defaults.contactPhone") } satisfies ContactContent;
    case "products": return { items: [{ name: t("dev.customize.defaults.productOne"), price: "18" }, { name: t("dev.customize.defaults.productTwo"), price: "42" }] } satisfies ProductsContent;
    case "promo": return { title: t("dev.customize.defaults.promoTitle"), code: "MYWISATA20" } satisfies PromoContent;
    case "reviews": return { items: [{ text: t("dev.customize.defaults.reviewText"), rating: 5 }] } satisfies ReviewsContent;
    case "announcement": return { text: t("dev.customize.defaults.announcementText") } satisfies AnnouncementContent;
    case "social": return { links: [{ platform: "Instagram", url: "" }, { platform: "WhatsApp", url: "" }] } satisfies SocialContent;
  }
}

// Stops the drag handle's onDragStart-triggering parent from swallowing clicks
// inside form controls (inputs aren't draggable, but the pointerdown still
// bubbles into the drag-handle's row in some browsers).
function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function ImagePicker({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  const { t } = useTranslation("auth");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2" onPointerDown={stop}>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object-URL/pasted preview, not an optimizable static asset
        <img src={value} alt="" className="h-12 w-16 shrink-0 rounded-lg border border-border object-cover" />
      ) : (
        <div className="grid h-12 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
          <FileUp size={16} />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(URL.createObjectURL(file));
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:border-primary hover:text-primary">
          {value ? t("dev.customize.image.replace") : t("dev.customize.image.upload")} {label}
        </button>
        <input
          type="text"
          value={value.startsWith("blob:") ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("dev.customize.image.pasteUrl")}
          className="block w-full rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

export function WidgetEditor({ type, content, onChange }: { type: WidgetType; content: unknown; onChange: (next: unknown) => void }) {
  const { t } = useTranslation("auth");
  switch (type) {
    case "cover": {
      const c = content as CoverContent;
      const set = (patch: Partial<CoverContent>) => onChange({ ...c, ...patch });
      return (
        <div className="flex h-full flex-col gap-1.5" onPointerDown={stop}>
          <ImagePicker value={c.imageUrl} onChange={(imageUrl) => set({ imageUrl })} label={t("dev.customize.image.cover")} />
          <input value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("dev.customize.fields.title")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[13px] font-bold text-foreground outline-none focus:border-primary" />
          <input value={c.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder={t("dev.customize.fields.subtitle")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary" />
          <input value={c.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} placeholder={t("dev.customize.fields.buttonLabel")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary" />
        </div>
      );
    }
    case "about": {
      const c = content as AboutContent;
      const set = (patch: Partial<AboutContent>) => onChange({ ...c, ...patch });
      return (
        <div className="flex h-full flex-col gap-1.5" onPointerDown={stop}>
          <input value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("dev.customize.fields.title")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[13px] font-bold text-foreground outline-none focus:border-primary" />
          <textarea value={c.body} onChange={(e) => set({ body: e.target.value })} placeholder={t("dev.customize.fields.story")} rows={3} className="w-full flex-1 resize-none rounded-md border border-border bg-card px-2 py-1 text-[12px] leading-5 text-foreground outline-none focus:border-primary" />
        </div>
      );
    }
    case "hours": {
      const c = content as HoursContent;
      const setDay = (i: number, patch: Partial<DayHours>) => {
        const days = c.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d));
        onChange({ days });
      };
      return (
        <div className="flex h-full flex-col gap-1 overflow-y-auto" onPointerDown={stop}>
          {c.days.map((d, i) => (
            <div key={DAY_KEYS[i]} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-8 shrink-0 font-semibold text-foreground">{t(`dev.customize.weekdays.${DAY_KEYS[i]}`)}</span>
              {d.closed ? (
                <span className="flex-1 text-muted-foreground">{t("dev.customize.actions.closed")}</span>
              ) : (
                <>
                  <input type="time" value={d.open} onChange={(e) => setDay(i, { open: e.target.value })} className="min-w-0 flex-1 rounded-md border border-border bg-card px-1 py-0.5 text-[11px] text-foreground outline-none focus:border-primary" />
                  <span className="text-muted-foreground">–</span>
                  <input type="time" value={d.close} onChange={(e) => setDay(i, { close: e.target.value })} className="min-w-0 flex-1 rounded-md border border-border bg-card px-1 py-0.5 text-[11px] text-foreground outline-none focus:border-primary" />
                </>
              )}
              <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <input type="checkbox" checked={d.closed} onChange={(e) => setDay(i, { closed: e.target.checked })} className="h-3 w-3 accent-primary" /> {t("dev.customize.actions.closed")}
              </label>
            </div>
          ))}
        </div>
      );
    }
    case "gallery": {
      const c = content as GalleryContent;
      const setImg = (i: number, url: string) => onChange({ images: c.images.map((im, idx) => (idx === i ? { url } : im)) });
      const addImg = () => onChange({ images: [...c.images, { url: "" }] });
      const removeImg = (i: number) => onChange({ images: c.images.filter((_, idx) => idx !== i) });
      return (
        <div className="flex h-full flex-col gap-1.5 overflow-y-auto" onPointerDown={stop}>
          {c.images.map((im, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="flex-1"><ImagePicker value={im.url} onChange={(url) => setImg(i, url)} label={t("dev.customize.image.photo", { index: i + 1 })} /></div>
              <button type="button" onClick={() => removeImg(i)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label={t("dev.customize.actions.removePhoto")}><Trash2 size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={addImg} className="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"><Plus size={12} /> {t("dev.customize.actions.addPhoto")}</button>
        </div>
      );
    }
    case "contact": {
      const c = content as ContactContent;
      const set = (patch: Partial<ContactContent>) => onChange({ ...c, ...patch });
      return (
        <div className="flex h-full flex-col gap-1.5" onPointerDown={stop}>
          <div className="min-h-[40px] flex-1 rounded-lg bg-[repeating-linear-gradient(45deg,#eef2ff,#eef2ff_10px,#e0e7ff_10px,#e0e7ff_20px)]" />
          <input value={c.address} onChange={(e) => set({ address: e.target.value })} placeholder={t("dev.customize.fields.address")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary" />
          <input value={c.phone} onChange={(e) => set({ phone: e.target.value })} placeholder={t("dev.customize.fields.phone")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary" />
        </div>
      );
    }
    case "products": {
      const c = content as ProductsContent;
      const setItem = (i: number, patch: Partial<ProductsContent["items"][number]>) => onChange({ items: c.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
      const addItem = () => onChange({ items: [...c.items, { name: "", price: "" }] });
      const removeItem = (i: number) => onChange({ items: c.items.filter((_, idx) => idx !== i) });
      return (
        <div className="flex h-full flex-col gap-1.5 overflow-y-auto" onPointerDown={stop}>
          {c.items.map((it, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder={t("dev.customize.fields.productName")} className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary" />
              <input value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} placeholder={t("dev.customize.fields.price")} className="w-14 shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary" />
              <button type="button" onClick={() => removeItem(i)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label={t("dev.customize.actions.removeProduct")}><Trash2 size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"><Plus size={12} /> {t("dev.customize.actions.addProduct")}</button>
        </div>
      );
    }
    case "promo": {
      const c = content as PromoContent;
      const set = (patch: Partial<PromoContent>) => onChange({ ...c, ...patch });
      return (
        <div className="flex h-full flex-col justify-center gap-1.5" onPointerDown={stop}>
          <input value={c.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("dev.customize.fields.promoTitle")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[12px] font-bold text-foreground outline-none focus:border-primary" />
          <input value={c.code} onChange={(e) => set({ code: e.target.value })} placeholder={t("dev.customize.fields.code")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[12px] text-foreground outline-none focus:border-primary" />
        </div>
      );
    }
    case "reviews": {
      const c = content as ReviewsContent;
      const setItem = (i: number, patch: Partial<ReviewsContent["items"][number]>) => onChange({ items: c.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
      const addItem = () => onChange({ items: [...c.items, { text: "", rating: 5 }] });
      const removeItem = (i: number) => onChange({ items: c.items.filter((_, idx) => idx !== i) });
      return (
        <div className="flex h-full flex-col gap-1.5 overflow-y-auto" onPointerDown={stop}>
          {c.items.map((it, i) => (
            <div key={i} className="rounded-lg border border-border p-1.5">
              <div className="mb-1 flex items-center gap-1.5">
                <select value={it.rating} onChange={(e) => setItem(i, { rating: Number(e.target.value) })} className="rounded-md border border-border bg-card px-1 py-0.5 text-[11px] text-foreground outline-none focus:border-primary">
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★</option>)}
                </select>
                <button type="button" onClick={() => removeItem(i)} className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label={t("dev.customize.actions.removeReview")}><Trash2 size={12} /></button>
              </div>
              <textarea value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} placeholder={t("dev.customize.fields.reviewText")} rows={2} className="w-full resize-none rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary" />
            </div>
          ))}
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"><Plus size={12} /> {t("dev.customize.actions.addReview")}</button>
        </div>
      );
    }
    case "announcement": {
      const c = content as AnnouncementContent;
      return (
        <div className="flex h-full items-center" onPointerDown={stop}>
          <input value={c.text} onChange={(e) => onChange({ text: e.target.value })} placeholder={t("dev.customize.fields.announcement")} className="w-full rounded-md border border-border bg-card px-2 py-1 text-[12px] font-semibold text-foreground outline-none focus:border-primary" />
        </div>
      );
    }
    case "social": {
      const c = content as SocialContent;
      const setLink = (i: number, patch: Partial<SocialContent["links"][number]>) => onChange({ links: c.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
      const addLink = () => onChange({ links: [...c.links, { platform: "", url: "" }] });
      const removeLink = (i: number) => onChange({ links: c.links.filter((_, idx) => idx !== i) });
      return (
        <div className="flex h-full flex-col gap-1.5 overflow-y-auto" onPointerDown={stop}>
          {c.links.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={l.platform} onChange={(e) => setLink(i, { platform: e.target.value })} placeholder={t("dev.customize.fields.platform")} className="w-20 shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary" />
              <input value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder={t("dev.customize.fields.url")} className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary" />
              <button type="button" onClick={() => removeLink(i)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label={t("dev.customize.actions.removeLink")}><Trash2 size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={addLink} className="inline-flex items-center gap-1 self-start rounded-md border border-dashed border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"><Plus size={12} /> {t("dev.customize.actions.addLink")}</button>
        </div>
      );
    }
  }
}
