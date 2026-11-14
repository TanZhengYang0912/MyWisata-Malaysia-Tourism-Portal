"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Building2, Clock3, ImageIcon, ImagePlus, Loader2, Pencil, ScrollText, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { ImageShapeHint, useImageCrop } from "@/components/shared/image-crop-dialog";
import { VendorPageHeader } from "@/components/vendor/vendor-page-header";
import type { HotelProfile } from "@/lib/validation/vendor-schemas";

type AmenityOption = { code: string; label_en: string; label_ms: string; label_zh: string; icon: string };
export type HotelProfileFormData = {
  isHotel: boolean;
  live: HotelProfile;
  pending: HotelProfile | null;
  lastRejection: { note: string | null; reviewedAt: string | null } | null;
  amenities: AmenityOption[];
};

const SECTION_CARD = "scroll-mt-24 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-6";
const MAX_PHOTOS = 20;

function SectionHeading({ id, icon: Icon, title, meta }: { id: string; icon: typeof Building2; title: string; meta?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-bold text-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-secondary text-primary"><Icon size={16} aria-hidden="true" /></span>
        {title}
      </h2>
      {meta && <span className="text-xs font-semibold tabular-nums text-muted-foreground">{meta}</span>}
    </div>
  );
}

/**
 * Presentational form: edits a copy of the pending profile (or the live one)
 * and submits it for review. These are hotel business facts (moderated);
 * the visual shop page is a separate surface opened with "Edit shop page".
 */
export function HotelProfileForm({ data, saving, uploading, onSubmit, onUpload }: {
  data: HotelProfileFormData;
  saving: boolean;
  uploading: boolean;
  onSubmit(profile: HotelProfile): void;
  onUpload(file: File, add: (url: string) => void): void;
}) {
  const { t, i18n } = useTranslation("vendor");
  const baseline = data.pending ?? data.live;
  const [profile, setProfile] = useState<HotelProfile>(baseline);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const label = (amenity: AmenityOption) => (language === "ms" ? amenity.label_ms : language === "zh-CN" ? amenity.label_zh : amenity.label_en);
  const update = (patch: Partial<HotelProfile>) => setProfile((current) => ({ ...current, ...patch }));
  const { cropToShape, cropDialog } = useImageCrop();
  const toggleAmenity = (code: string, on: boolean) => update({ amenityCodes: on ? [...profile.amenityCodes, code] : profile.amenityCodes.filter((item) => item !== code) });
  const movePhoto = (index: number) => update({ photos: profile.photos.map((url, i) => (i === index - 1 ? profile.photos[index] : i === index ? profile.photos[index - 1] : url)) });
  // An unchanged profile would only create a duplicate admin review.
  const isDirty = JSON.stringify(profile) !== JSON.stringify(baseline);
  const isRejected = Boolean(data.lastRejection && !data.pending);
  const status = data.pending
    ? t("hotelProfile.status.pending")
    : data.lastRejection
      ? t("hotelProfile.status.rejected", { note: data.lastRejection.note ?? "" })
      : t("hotelProfile.status.live");
  const statusTone = isRejected
    ? "border-destructive/20 bg-destructive/10 text-destructive"
    : data.pending
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
      : "border-primary/10 bg-secondary/70 text-primary";
  const sections = [
    { id: "hotel-about", label: t("hotelProfile.fields.about") },
    { id: "hotel-amenities", label: t("hotelProfile.fields.amenities") },
    { id: "hotel-stay", label: t("hotelProfile.sections.stay") },
    { id: "hotel-policies", label: t("hotelProfile.fields.policies") },
    { id: "hotel-photos", label: t("hotelProfile.fields.photos") },
  ];

  // Warn before a reload or tab close drops unsent edits.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  return (
    <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); if (isDirty) onSubmit(profile); }}>
      <p role="status" className={`rounded-2xl border px-4 py-3 text-sm sm:px-5 ${statusTone}`}>{status}</p>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="hotel-about" className={SECTION_CARD}>
            <SectionHeading id="hotel-about" icon={Building2} title={t("hotelProfile.fields.about")} meta={`${profile.about.length}/2000`} />
            <Textarea aria-labelledby="hotel-about" rows={5} maxLength={2000} value={profile.about} onChange={(event) => update({ about: event.target.value })} />
          </section>

          <fieldset aria-labelledby="hotel-amenities" className={SECTION_CARD}>
            <SectionHeading id="hotel-amenities" icon={Sparkles} title={t("hotelProfile.fields.amenities")} meta={t("hotelProfile.selectedCount", { selected: profile.amenityCodes.length, total: data.amenities.length })} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.amenities.map((amenity) => (
                // Selected amenities change border and fill too, so the state never relies on the small tick alone.
                <label key={amenity.code} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-secondary/60 has-[[data-state=checked]]:font-semibold">
                  <Checkbox checked={profile.amenityCodes.includes(amenity.code)} onCheckedChange={(checked) => toggleAmenity(amenity.code, checked === true)} />
                  <span className="min-w-0">{label(amenity)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="hotel-stay" className={SECTION_CARD}>
              <SectionHeading id="hotel-stay" icon={Clock3} title={t("hotelProfile.sections.stay")} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-foreground">
                  {t("hotelProfile.fields.checkIn")}
                  <Input type="time" className="mt-2 tabular-nums" value={profile.checkInTime} onChange={(event) => update({ checkInTime: event.target.value })} required />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  {t("hotelProfile.fields.checkOut")}
                  <Input type="time" className="mt-2 tabular-nums" value={profile.checkOutTime} onChange={(event) => update({ checkOutTime: event.target.value })} required />
                </label>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t("hotelProfile.malaysiaTime")}</p>
            </section>

            <section aria-labelledby="hotel-policies" className={SECTION_CARD}>
              <SectionHeading id="hotel-policies" icon={ScrollText} title={t("hotelProfile.fields.policies")} meta={`${profile.policies.length}/2000`} />
              <Textarea aria-labelledby="hotel-policies" rows={5} maxLength={2000} value={profile.policies} onChange={(event) => update({ policies: event.target.value })} />
            </section>
          </div>

          <section aria-labelledby="hotel-photos" className={SECTION_CARD}>
            <SectionHeading id="hotel-photos" icon={ImageIcon} title={t("hotelProfile.fields.photos")} meta={`${profile.photos.length}/${MAX_PHOTOS}`} />
            <ImageShapeHint shape="photo" className="text-xs text-muted-foreground" />
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {profile.photos.map((url, index) => (
                <li key={url} className="group relative overflow-hidden rounded-xl border border-border bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={t("hotelProfile.photoAlt", { index: index + 1 })} className="aspect-[4/3] w-full object-cover" />
                  {index === 0 && <span className="absolute left-2 top-2 rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{t("hotelProfile.coverPhoto")}</span>}
                  <div className="flex items-center justify-between border-t border-border p-1">
                    <Button type="button" size="icon" variant="ghost" disabled={index === 0} aria-label={t("hotelProfile.movePhotoUp")} title={t("hotelProfile.movePhotoUp")} onClick={() => movePhoto(index)}><ArrowUp size={14} /></Button>
                    <Button type="button" size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={t("hotelProfile.removePhoto")} title={t("hotelProfile.removePhoto")} onClick={() => update({ photos: profile.photos.filter((item) => item !== url) })}><Trash2 size={14} /></Button>
                  </div>
                </li>
              ))}
              {profile.photos.length < MAX_PHOTOS && (
                <li>
                  <label className={`flex aspect-[4/3] h-full min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-primary/25 bg-muted/40 text-sm font-semibold text-primary transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${uploading ? "cursor-wait opacity-70" : "cursor-pointer hover:border-primary hover:bg-secondary"}`}>
                    {uploading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={18} aria-hidden="true" />}
                    {t("hotelProfile.addPhoto")}
                    <Input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void cropToShape(file, "photo").then((cropped) => { if (cropped) onUpload(cropped, (url) => update({ photos: [...profile.photos, url] })); });
                      }} />
                  </label>
                </li>
              )}
            </ul>
            {cropDialog}
          </section>
        </div>

        {/* Desktop summary rail: where each section is, what changed, and the one submit action. */}
        <aside className="hidden space-y-4 xl:sticky xl:top-6 xl:block">
          <nav aria-label={t("hotelProfile.sectionsNav")} className="rounded-2xl border border-gray-100 bg-white p-2 shadow-sm dark:border-border dark:bg-card">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{section.label}</a>
            ))}
          </nav>
          <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-border dark:bg-card">
            <p className={`text-xs font-semibold ${isDirty ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`} aria-live="polite">{isDirty ? t("hotelProfile.unsaved") : t("hotelProfile.noChanges")}</p>
            <Button type="submit" disabled={saving || !isDirty} className="min-h-11 w-full">{saving ? t("hotelProfile.submitting") : t("hotelProfile.submit")}</Button>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-20 z-40 -mx-4 mt-1 grid gap-2 border-t border-border bg-card/95 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_20px_-16px_rgba(15,23,42,0.4)] backdrop-blur sm:static sm:mx-0 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none xl:hidden">
        <p className={`text-xs font-semibold ${isDirty ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{isDirty ? t("hotelProfile.unsaved") : t("hotelProfile.noChanges")}</p>
        <Button type="submit" disabled={saving || !isDirty} className="min-h-11 w-full sm:w-auto">{saving ? t("hotelProfile.submitting") : t("hotelProfile.submit")}</Button>
      </div>
    </form>
  );
}

/**
 * Keep hotel stay information in its moderated profile form and expose the existing
 * outlet page builder as a separate, on-demand editing surface.
 */
export function HotelProfileEditor({ vendorId, outletId, outletName, onClose, children }: { vendorId: string; outletId: string; outletName: string; onClose(): void; children: ReactNode | ((builderOnClose: () => void) => ReactNode) }) {
  const { t } = useTranslation("vendor");
  const { showFeedback } = useActionFeedback();
  const [state, setState] = useState<"loading" | "hotel" | "notHotel">("loading");
  const [data, setData] = useState<HotelProfileFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const endpoint = `/api/vendors/${vendorId}/outlets/${outletId}/hotel-profile`;

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.status === 409) { setState("notHotel"); return; }
    const body = (await response.json()) as { data?: HotelProfileFormData };
    setData(body.data ?? null);
    setState("hotel");
  }, [endpoint]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function submit(profile: HotelProfile) {
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t("hotelProfile.errors.submit"));
      showFeedback("success", t("hotelProfile.submitted"));
      await load();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("hotelProfile.errors.submit"));
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File, add: (url: string) => void) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${endpoint}/photos`, { method: "POST", body: form });
      const body = (await response.json()) as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !body.data?.url) throw new Error(body.error?.message ?? t("hotelProfile.errors.upload"));
      add(body.data.url);
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("hotelProfile.errors.upload"));
    } finally {
      setUploading(false);
    }
  }

  if (state === "notHotel") return <>{typeof children === "function" ? children(onClose) : children}</>;
  return (
    <div className="w-full space-y-6">
      <VendorPageHeader
        eyebrow={<><Building2 size={15} aria-hidden="true" /> {t("hotelProfile.eyebrow")}</>}
        title={outletName}
        actions={(
          // Business facts are edited below; the visual shop page is its own surface.
          <div className="flex w-full items-center justify-end gap-2 md:w-auto">
            {typeof children === "function" && (
              <Button type="button" variant="outline" className="min-h-11 flex-1 gap-2 sm:flex-none" onClick={() => setBuilderOpen(true)}>
                <Pencil size={16} aria-hidden="true" />{t("shopPreview.editShopPage")}
              </Button>
            )}
            <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label={t("hotelProfile.close")} onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        )}
      />
      {state === "loading" || !data
        ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />{t("hotelProfile.loading")}</p>
        : <HotelProfileForm key={JSON.stringify(data.pending ?? data.live)} data={data} saving={saving} uploading={uploading} onSubmit={(profile) => void submit(profile)} onUpload={(file, add) => void upload(file, add)} />}
      {builderOpen && typeof children === "function" && children(() => setBuilderOpen(false))}
    </div>
  );
}
