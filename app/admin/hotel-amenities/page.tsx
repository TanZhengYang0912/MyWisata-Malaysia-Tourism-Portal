"use client";

// Admin-managed amenity checklist that hotels tick in their hotel profile (hotel plan D5).

import { useEffect, useState } from "react";
import { BedDouble, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { AdminMobileRecordCard } from "@/components/admin/admin-mobile-record-card";

interface Amenity {
  code: string;
  label_en: string;
  label_ms: string;
  label_zh: string;
  icon: string;
  is_active: boolean;
}

const EMPTY_FORM = { code: "", labelEn: "", labelMs: "", labelZh: "", icon: "check" };

export default function HotelAmenitiesPage() {
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const ready = /^[a-z0-9_]{2,40}$/.test(form.code) && form.labelEn.trim() && form.labelMs.trim() && form.labelZh.trim() && form.icon.trim();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hotel-amenities", { cache: "no-store" });
      const body = (await res.json()) as { data?: { amenities?: Amenity[] } };
      setAmenities(body.data?.amenities ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  async function addAmenity() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hotel-amenities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, labelEn: form.labelEn.trim(), labelMs: form.labelMs.trim(), labelZh: form.labelZh.trim(), icon: form.icon.trim() }),
      });
      const body = (await res.json()) as { data?: { amenity?: Amenity }; error?: { message?: string } };
      if (!res.ok || !body.data?.amenity) throw new Error(body.error?.message ?? t("hotelAmenities.errors.add"));
      setAmenities((prev) => [...prev, body.data!.amenity!]);
      setForm(EMPTY_FORM);
      showFeedback("success", t("hotelAmenities.success.added"));
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t("hotelAmenities.errors.add"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(amenity: Amenity) {
    const nextActive = !amenity.is_active;
    setAmenities((prev) => prev.map((item) => (item.code === amenity.code ? { ...item, is_active: nextActive } : item)));
    const res = await fetch("/api/admin/hotel-amenities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: amenity.code, isActive: nextActive }),
    });
    if (!res.ok) {
      setAmenities((prev) => prev.map((item) => (item.code === amenity.code ? { ...item, is_active: amenity.is_active } : item)));
      showFeedback("error", t("hotelAmenities.errors.update"));
    }
  }

  const field = (key: keyof typeof EMPTY_FORM, labelKey: string, placeholder?: string) => (
    <label className="text-sm">
      <span className="mb-1.5 block font-medium text-foreground">{t(labelKey)}</span>
      <Input value={form[key]} placeholder={placeholder} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  );

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><BedDouble size={14} /> {t("hotelAmenities.eyebrow")}</span>}
        title={t("hotelAmenities.title")}
        description={t("hotelAmenities.description")}
      />

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_8rem_auto] lg:items-end">
          {field("code", "hotelAmenities.form.code", "rooftop_bar")}
          {field("labelEn", "hotelAmenities.form.labelEn")}
          {field("labelMs", "hotelAmenities.form.labelMs")}
          {field("labelZh", "hotelAmenities.form.labelZh")}
          {field("icon", "hotelAmenities.form.icon")}
          <Button onClick={() => void addAmenity()} disabled={saving || !ready}>
            <Plus size={15} /> {t("hotelAmenities.form.add")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("hotelAmenities.form.codeHint")}</p>
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-card p-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("hotelAmenities.loading")}</p>
        ) : amenities.length === 0 ? (
          <EmptyState title={t("hotelAmenities.empty")} />
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {amenities.map((amenity) => <AdminMobileRecordCard key={amenity.code} header={<div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><p className="break-all font-mono text-sm font-semibold">{amenity.code}</p><StatusBadge status={amenity.is_active ? "active" : "inactive"} /></div>}>
                <div><p className="text-xs font-semibold text-muted-foreground">{t("hotelAmenities.table.labels")}</p><p className="mt-1 break-words text-sm">{amenity.label_en}</p><p className="break-words text-sm text-muted-foreground">{amenity.label_ms}</p><p className="break-words text-sm text-muted-foreground">{amenity.label_zh}</p></div>
                <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => void toggleActive(amenity)}>{amenity.is_active ? t("hotelAmenities.actions.deactivate") : t("hotelAmenities.actions.activate")}</Button></div>
              </AdminMobileRecordCard>)}
            </div>
            <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pr-3">{t("hotelAmenities.table.code")}</th>
                  <th className="py-3 pr-3">{t("hotelAmenities.table.labels")}</th>
                  <th className="py-3 pr-3">{t("hotelAmenities.table.status")}</th>
                  <th className="py-3 pr-3" />
                </tr>
              </thead>
              <tbody>
                {amenities.map((amenity) => (
                  <tr key={amenity.code} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-foreground">{amenity.code}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{amenity.label_en} · {amenity.label_ms} · {amenity.label_zh}</td>
                    <td className="py-3 pr-3"><StatusBadge status={amenity.is_active ? "active" : "inactive"} /></td>
                    <td className="py-3 pr-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => void toggleActive(amenity)}>
                        {amenity.is_active ? t("hotelAmenities.actions.deactivate") : t("hotelAmenities.actions.activate")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </section>
    </AdminPageShell>
  );
}
