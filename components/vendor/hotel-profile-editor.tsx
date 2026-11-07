"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { ImageShapeHint, useImageCrop } from "@/components/shared/image-crop-dialog";
import type { HotelProfile } from "@/lib/validation/vendor-schemas";

type AmenityOption = { code: string; label_en: string; label_ms: string; label_zh: string; icon: string };
export type HotelProfileFormData = {
  isHotel: boolean;
  live: HotelProfile;
  pending: HotelProfile | null;
  lastRejection: { note: string | null; reviewedAt: string | null } | null;
  amenities: AmenityOption[];
};

/** Presentational form: edits a copy of the pending profile (or the live one) and submits it for review. */
export function HotelProfileForm({ data, saving, uploading, onSubmit, onUpload }: {
  data: HotelProfileFormData;
  saving: boolean;
  uploading: boolean;
  onSubmit(profile: HotelProfile): void;
  onUpload(file: File, add: (url: string) => void): void;
}) {
  const { t, i18n } = useTranslation("vendor");
  const [profile, setProfile] = useState<HotelProfile>(data.pending ?? data.live);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const label = (amenity: AmenityOption) => (language === "ms" ? amenity.label_ms : language === "zh-CN" ? amenity.label_zh : amenity.label_en);
  const update = (patch: Partial<HotelProfile>) => setProfile((current) => ({ ...current, ...patch }));
  const { cropToShape, cropDialog } = useImageCrop();
  const toggleAmenity = (code: string, on: boolean) => update({ amenityCodes: on ? [...profile.amenityCodes, code] : profile.amenityCodes.filter((item) => item !== code) });
  const movePhoto = (index: number) => update({ photos: profile.photos.map((url, i) => (i === index - 1 ? profile.photos[index] : i === index ? profile.photos[index - 1] : url)) });
  const status = data.pending
    ? t("hotelProfile.status.pending")
    : data.lastRejection
      ? t("hotelProfile.status.rejected", { note: data.lastRejection.note ?? "" })
      : t("hotelProfile.status.live");

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit(profile); }}>
      <p role="status" className={`rounded-xl px-4 py-3 text-sm ${data.lastRejection && !data.pending ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}`}>{status}</p>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <label className="block text-sm font-medium text-foreground">
          {t("hotelProfile.fields.about")}
          <Textarea className="mt-2" rows={5} maxLength={2000} value={profile.about} onChange={(event) => update({ about: event.target.value })} />
        </label>
      </section>

      <fieldset className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-foreground">{t("hotelProfile.fields.amenities")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {data.amenities.map((amenity) => (
            <label key={amenity.code} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-2.5 py-2 text-sm text-foreground sm:px-3">
              <Checkbox checked={profile.amenityCodes.includes(amenity.code)} onCheckedChange={(checked) => toggleAmenity(amenity.code, checked === true)} />
              <span className="min-w-0">{label(amenity)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5">
        <label className="block text-sm font-medium text-foreground">
          {t("hotelProfile.fields.checkIn")}
          <Input type="time" className="mt-2" value={profile.checkInTime} onChange={(event) => update({ checkInTime: event.target.value })} required />
        </label>
        <label className="block text-sm font-medium text-foreground">
          {t("hotelProfile.fields.checkOut")}
          <Input type="time" className="mt-2" value={profile.checkOutTime} onChange={(event) => update({ checkOutTime: event.target.value })} required />
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <label className="block text-sm font-medium text-foreground">
          {t("hotelProfile.fields.policies")}
          <Textarea className="mt-2" rows={4} maxLength={2000} value={profile.policies} onChange={(event) => update({ policies: event.target.value })} />
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <p className="text-sm font-semibold text-foreground">{t("hotelProfile.fields.photos")}</p>
        <ImageShapeHint shape="photo" className="text-xs text-muted-foreground" />
        <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {profile.photos.map((url, index) => (
            <li key={url} className="overflow-hidden rounded-xl border border-border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={t("hotelProfile.photoAlt", { index: index + 1 })} className="aspect-[4/3] w-full object-cover" />
              <div className="flex justify-between p-1.5">
                <Button type="button" size="icon" variant="ghost" disabled={index === 0} aria-label={t("hotelProfile.movePhotoUp")} onClick={() => movePhoto(index)}><ArrowUp size={14} /></Button>
                <Button type="button" size="icon" variant="ghost" aria-label={t("hotelProfile.removePhoto")} onClick={() => update({ photos: profile.photos.filter((item) => item !== url) })}><Trash2 size={14} /></Button>
              </div>
            </li>
          ))}
        </ul>
        <label className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {t("hotelProfile.addPhoto")}
          <Input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading || profile.photos.length >= 20}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void cropToShape(file, "photo").then((cropped) => { if (cropped) onUpload(cropped, (url) => update({ photos: [...profile.photos, url] })); });
            }} />
        </label>
        {cropDialog}
      </section>

      <div className="sticky bottom-0 z-40 -mx-4 grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2 border-t border-border bg-card/95 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_20px_-16px_rgba(15,23,42,0.4)] backdrop-blur sm:static sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
        <Button type="submit" disabled={saving} className="min-h-11 w-full sm:w-auto">{saving ? t("hotelProfile.submitting") : t("hotelProfile.submit")}</Button>
        <span aria-hidden="true" className="sm:hidden" />
      </div>
    </form>
  );
}

/**
 * Hotel vendors edit a fixed hotel profile instead of the widget page builder (D3).
 * Outlets that do not sell rooms render `children` (the existing builder) unchanged.
 */
export function HotelProfileEditor({ vendorId, outletId, outletName, onClose, children }: { vendorId: string; outletId: string; outletName: string; onClose(): void; children: ReactNode }) {
  const { t } = useTranslation("vendor");
  const { showFeedback } = useActionFeedback();
  const [state, setState] = useState<"loading" | "hotel" | "notHotel">("loading");
  const [data, setData] = useState<HotelProfileFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  if (state === "notHotel") return <>{children}</>;
  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t("hotelProfile.eyebrow")}</p>
          <h1 className="mt-1 break-words text-xl font-bold text-foreground">{outletName}</h1>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t("hotelProfile.close")} onClick={onClose}><X size={18} /></Button>
      </div>
      {state === "loading" || !data
        ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />{t("hotelProfile.loading")}</p>
        : <HotelProfileForm key={JSON.stringify(data.pending ?? data.live)} data={data} saving={saving} uploading={uploading} onSubmit={(profile) => void submit(profile)} onUpload={(file, add) => void upload(file, add)} />}
    </section>
  );
}
