"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Info, Layers, Save, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatMYRFromSen } from "@/lib/i18n/format";
import { feeLabel, type FeeTier } from "@/lib/vendor/fee-tiers";

type Campaign = { id: string; title: string; status: string; endsAt: string; perItemSen: number | null };
type Settings = { tiers: FeeTier[]; vendorCounts: Record<string, number>; eventDefaultPerItemSen: number | null; campaigns: Campaign[]; canEdit: boolean };
/** Form values are kept as typed text so a field can be left blank. */
type TierForm = { rank: 1 | 2 | 3; name: string; feeType: "percent" | "fixed"; value: string; minSales: string };
type Form = { tiers: TierForm[]; eventDefault: string; campaigns: Record<string, string> };

const LOAD_TIMEOUT_MS = 8_000;
const CURRENCY = "RM";
const rm = (sen: number | null) => (sen === null ? "" : String(sen / 100));
const toSen = (text: string) => (text.trim() === "" ? null : Math.round(Number(text) * 100));

function toForm(settings: Settings): Form {
  return {
    tiers: settings.tiers.map((tier) => ({
      rank: tier.rank, name: tier.name, feeType: tier.feeType,
      value: tier.feeType === "percent" ? String(Number(((tier.percentRate ?? 0) * 100).toFixed(2))) : rm(tier.fixedPerItemSen),
      minSales: rm(tier.minSalesSen),
    })),
    eventDefault: rm(settings.eventDefaultPerItemSen),
    campaigns: Object.fromEntries(settings.campaigns.map((campaign) => [campaign.id, rm(campaign.perItemSen)])),
  };
}

function toTier(form: TierForm): FeeTier {
  const value = Number(form.value);
  return {
    rank: form.rank, name: form.name.trim(), feeType: form.feeType,
    percentRate: form.feeType === "percent" ? Math.round(value * 100) / 10_000 : null,
    fixedPerItemSen: form.feeType === "fixed" ? Math.round(value * 100) : null,
    minSalesSen: toSen(form.minSales) ?? 0,
  };
}

export default function PlatformFeesPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const formatSen = (sen: number) => formatMYRFromSen(sen, locale);
  const { showFeedback } = useActionFeedback();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    setLoadError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    try {
      const response = await fetch("/api/admin/vendor-fee-tiers", { cache: "no-store", signal: controller.signal });
      const body = await response.json() as { data?: Settings; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("ui.platformFees.errors.load"));
      setSettings(body.data);
      setForm(toForm(body.data));
    } catch (err) {
      setLoadError(err instanceof Error && err.name !== "AbortError" ? err.message : t("ui.platformFees.errors.load"));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  function updateTier(rank: number, patch: Partial<TierForm>) {
    setForm((current) => current && { ...current, tiers: current.tiers.map((tier) => tier.rank === rank ? { ...tier, ...patch } : tier) });
  }

  function requestSave() {
    if (!form) return;
    setError("");
    const values = [...form.tiers.flatMap((tier) => [tier.value, tier.minSales]), form.eventDefault, ...Object.values(form.campaigns)].filter((value) => value.trim() !== "");
    if (form.tiers.some((tier) => tier.value.trim() === "" || !tier.name.trim()) || values.some((value) => !(Number(value) >= 0))) { setError(t("ui.platformFees.errors.invalid")); return; }
    if (form.tiers.some((tier) => tier.feeType === "percent" && Number(tier.value) >= 100)) { setError(t("ui.platformFees.errors.percentTooHigh")); return; }
    const [first, second, third] = form.tiers.map((tier) => toSen(tier.minSales) ?? 0);
    if (!(first === 0 && first < second && second < third)) { setError(t("ui.platformFees.errors.thresholdOrder")); return; }
    if (reason.trim().length < 10) { setError(t("ui.platformFees.errors.reason")); return; }
    setConfirming(true);
  }

  async function save() {
    if (!form || !settings) return;
    setSaving(true);
    try {
      const campaignFees = settings.campaigns
        .map((campaign) => ({ id: campaign.id, perItemSen: toSen(form.campaigns[campaign.id] ?? "") }))
        .filter((campaign) => campaign.perItemSen !== settings.campaigns.find((row) => row.id === campaign.id)?.perItemSen);
      const response = await fetch("/api/admin/vendor-fee-tiers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tiers: form.tiers.map(toTier), eventDefaultPerItemSen: toSen(form.eventDefault), campaignFees, reason: reason.trim() }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t("ui.platformFees.errors.save"));
      setReason("");
      setConfirming(false);
      showFeedback("success", t("ui.platformFees.saved"));
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("ui.platformFees.errors.save");
      setError(message);
      setConfirming(false);
      showFeedback("error", message);
    } finally {
      setSaving(false);
    }
  }

  const readOnly = !settings?.canEdit;
  const sampleSen = 2000;
  const sampleQty = 3;

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow={<span className="flex items-center gap-2"><Layers size={14} /> {t("ui.platformFees.eyebrow")}</span>}
      title={t("ui.platformFees.title")}
      actions={<Link href="/admin/vendors" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground shadow-sm transition hover:border-ring hover:text-primary"><ArrowLeft size={16} /> {t("ui.platformFees.back")}</Link>}
    />
    {error && <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle size={16} /> {error}</p>}
    {loadError ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-8 text-center"><AlertCircle size={22} className="mx-auto text-destructive" /><p className="mt-3 text-sm text-destructive">{loadError}</p><Button className="mt-4" variant="outline" onClick={() => void load()}>{t("ui.platformFees.retry")}</Button></div>
      : !form || !settings ? <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">{t("ui.platformFees.loading")}</p>
      : <div className="space-y-5">
        <p className="flex items-start gap-2 rounded-xl border border-primary/10 bg-secondary/50 p-3 text-xs leading-5 text-muted-foreground"><Info size={15} className="mt-0.5 shrink-0 text-primary" /> {readOnly ? t("ui.platformFees.readOnly") : t("ui.platformFees.howItWorks")}</p>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground">{t("ui.platformFees.tiers.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.platformFees.tiers.description")}</p>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {form.tiers.map((tier) => {
              const preview = tier.value.trim() === "" ? null : toTier(tier);
              const previewFee = preview === null ? null : preview.feeType === "fixed"
                ? Math.min((preview.fixedPerItemSen ?? 0) * sampleQty, sampleSen * sampleQty)
                : Math.round(sampleSen * sampleQty * (preview.percentRate ?? 0));
              return <fieldset key={tier.rank} disabled={readOnly} className="rounded-xl border border-border p-4">
                <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("ui.platformFees.tiers.tier", { rank: tier.rank })}</legend>
                <label className="block text-sm"><span className="mb-1.5 block font-medium text-foreground">{t("ui.platformFees.tiers.name")}</span><input value={tier.name} maxLength={40} onChange={(event) => updateTier(tier.rank, { name: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></label>
                <label className="mt-3 block text-sm"><span className="mb-1.5 block font-medium text-foreground">{t("ui.platformFees.tiers.feeType")}</span><select value={tier.feeType} onChange={(event) => updateTier(tier.rank, { feeType: event.target.value as TierForm["feeType"], value: "" })} className={`${adminFilterControlClassName} w-full`}><option value="percent">{t("ui.platformFees.tiers.percent")}</option><option value="fixed">{t("ui.platformFees.tiers.fixed")}</option></select></label>
                <label className="mt-3 block text-sm"><span className="mb-1.5 block font-medium text-foreground">{tier.feeType === "percent" ? t("ui.platformFees.tiers.percentValue") : t("ui.platformFees.tiers.fixedValue")}</span><span className="relative block"><input type="number" min={0} max={tier.feeType === "percent" ? 99.99 : 1000} step={0.01} value={tier.value} onChange={(event) => updateTier(tier.rank, { value: event.target.value })} className={`${adminFilterControlClassName} w-full pr-12`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{tier.feeType === "percent" ? "%" : CURRENCY}</span></span></label>
                <label className="mt-3 block text-sm"><span className="mb-1.5 block font-medium text-foreground">{t("ui.platformFees.tiers.minSales")}</span><span className="relative block"><input type="number" min={0} step={0.01} value={tier.minSales} disabled={tier.rank === 1} onChange={(event) => updateTier(tier.rank, { minSales: event.target.value })} className={`${adminFilterControlClassName} w-full pr-12`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{CURRENCY}</span></span><span className="mt-1 block text-[11px] text-muted-foreground">{tier.rank === 1 ? t("ui.platformFees.tiers.entryTier") : t("ui.platformFees.tiers.minSalesHint")}</span></label>
                <div className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p>{t("ui.platformFees.tiers.vendors", { count: settings.vendorCounts[tier.rank] ?? 0 })}</p>
                  {preview && previewFee !== null && <p>{t("ui.platformFees.tiers.preview", { qty: sampleQty, price: formatSen(sampleSen), fee: formatSen(previewFee), label: feeLabel(preview, formatSen, t("ui.platformFees.perItem")) })}</p>}
                </div>
              </fieldset>;
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground"><Ticket size={16} className="text-primary" /> {t("ui.platformFees.events.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.platformFees.events.description")}</p>
          <fieldset disabled={readOnly}>
            <label className="mt-4 block max-w-xs text-sm"><span className="mb-1.5 block font-medium text-foreground">{t("ui.platformFees.events.default")}</span><span className="relative block"><input type="number" min={0} max={1000} step={0.01} value={form.eventDefault} placeholder={t("ui.platformFees.events.useTier")} onChange={(event) => setForm({ ...form, eventDefault: event.target.value })} className={`${adminFilterControlClassName} w-full pr-12`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{CURRENCY}</span></span><span className="mt-1 block text-[11px] text-muted-foreground">{t("ui.platformFees.events.defaultHint")}</span></label>
            {settings.campaigns.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">{t("ui.platformFees.events.none")}</p> : <div className="mt-4 divide-y divide-border rounded-xl border border-border">
              {settings.campaigns.map((campaign) => <label key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0"><span className="block truncate font-semibold text-foreground">{campaign.title}</span><span className="text-xs capitalize text-muted-foreground">{campaign.status.replaceAll("_", " ")}</span></span>
                <span className="relative block w-40"><input type="number" min={0} max={1000} step={0.01} aria-label={t("ui.platformFees.events.campaignFee", { title: campaign.title })} value={form.campaigns[campaign.id] ?? ""} placeholder={t("ui.platformFees.events.useDefault")} onChange={(event) => setForm({ ...form, campaigns: { ...form.campaigns, [campaign.id]: event.target.value } })} className={`${adminFilterControlClassName} w-full pr-12`} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{CURRENCY}</span></span>
              </label>)}
            </div>}
          </fieldset>
        </section>

        {!readOnly && <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <label className="block text-sm"><span className="mb-1.5 block font-medium text-foreground">{t("ui.platformFees.reasonLabel")}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder={t("ui.platformFees.reasonPlaceholder")} className={`${adminFilterControlClassName} min-h-24 w-full resize-none py-3`} /></label>
          <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => { setForm(toForm(settings)); setReason(""); setError(""); }}>{t("ui.actions.discardChanges")}</Button><Button disabled={saving} onClick={requestSave}><Save size={15} /> {t("ui.actions.saveSettings")}</Button></div>
        </section>}
      </div>}
    <AdminConfirmDialog open={confirming} title={t("ui.platformFees.confirm.title")} description={t("ui.platformFees.confirm.description")} confirmLabel={t("ui.actions.saveSettings")} busy={saving} onCancel={() => setConfirming(false)} onConfirm={() => void save()} />
  </AdminPageShell>;
}
