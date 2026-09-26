"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Megaphone, Plus, RefreshCw, Save, Send, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/providers/app-dialog";
import { useAuth } from "@/components/providers/auth";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { getMalaysiaDateTimeRangeDefaults } from "@/lib/datetime/date-input";
import { isInvalidDateTimeRange, malaysiaDateTimeLocalToIso } from "@/lib/datetime/malaysia";
import type { PromotionCampaignOfferInput, PromotionCampaignStatus } from "@/lib/promotion-campaigns/types";

type ProductSource = {
  productId: string; productName: string; productType: string | null; vendorId: string;
  vendorName: string; outletId: string; outletName: string; city: string | null;
  state: string | null; price: number; imageUrl: string | null;
};
type VoucherSource = {
  voucherId: string; name: string; voucherType: "percent" | "fixed" | "bogo";
  discountValue: number; vendorId: string; vendorName: string; outletId: string | null;
  outletName: string | null; claimFrom: string | null; claimUntil: string | null;
  validFrom: string | null; validUntil: string | null; maxUses: number | null; usesCount: number;
};
type CampaignOfferRow = { id: string; voucher_id: string | null; product_id: string | null; outlet_id: string | null; position: number };
type CampaignRow = {
  id: string; slug: string; title: string; summary: string; description: string;
  status: PromotionCampaignStatus; starts_at: string; ends_at: string;
  created_by: string; updated_at: string; rejection_note: string | null; offers: CampaignOfferRow[];
};
type DraftForm = {
  title: string; slug: string; summary: string; description: string;
  startsAt: string; endsAt: string; offers: PromotionCampaignOfferInput[];
};
type SourceData = { products: ProductSource[]; vouchers: VoucherSource[] };
type OfferSourceChoice = { key: string; label: string; offer: PromotionCampaignOfferInput };

function malaysiaLocalDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

function initialForm(): DraftForm {
  const defaults = getMalaysiaDateTimeRangeDefaults();
  return { title: "", slug: "", summary: "", description: "", startsAt: defaults.from, endsAt: defaults.to, offers: [] };
}

function sourceChoiceKey(offer: PromotionCampaignOfferInput) {
  return offer.kind === "voucher" ? `voucher:${offer.voucherId}` : `product:${offer.productId}:${offer.outletId}`;
}

function actionForStatus(status: PromotionCampaignStatus) {
  if (status === "draft" || status === "rejected") return ["submit"] as const;
  if (status === "pending_approval") return ["approve", "reject"] as const;
  if (status === "approved") return ["pause", "archive"] as const;
  if (status === "paused") return ["resume", "archive"] as const;
  return [] as const;
}

export default function PromotionCampaignsPage() {
  const { t, i18n } = useTranslation("admin");
  const { currentUser } = useAuth();
  const { confirm, prompt } = useAppDialog();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [sources, setSources] = useState<SourceData>({ products: [], vouchers: [] });
  const [form, setForm] = useState<DraftForm>(initialForm);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"product" | "voucher">("product");
  const [sourceKey, setSourceKey] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/promotion-campaigns", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 403 || response.status === 401) {
        setForbidden(true);
        return;
      }
      if (!response.ok) throw new Error(payload.error?.message || t("promotionCampaigns.errors.load"));
      setCampaigns(payload.data?.campaigns ?? []);
      setSources({ products: payload.data?.sources?.products ?? [], vouchers: payload.data?.sources?.vouchers ?? [] });
      setForbidden(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("promotionCampaigns.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    await load();
  }, [load]);

  // load only updates component state after the campaign API request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const allChoices = useMemo<OfferSourceChoice[]>(() => [
    ...sources.products.map<OfferSourceChoice>((source) => ({
      key: `product:${source.productId}:${source.outletId}`,
      label: `${source.vendorName} · ${source.productName} · ${source.outletName}${source.city ? `, ${source.city}` : ""} · RM${Number(source.price).toFixed(2)}`,
      offer: { kind: "product", productId: source.productId, outletId: source.outletId, position: 0 },
    })),
    ...sources.vouchers.map<OfferSourceChoice>((source) => ({
      key: `voucher:${source.voucherId}`,
      label: `${source.vendorName} · ${source.name} · ${source.outletName ?? t("promotionCampaigns.form.vendorWide")}`,
      offer: { kind: "voucher", voucherId: source.voucherId, position: 0 },
    })),
  ], [sources, t]);
  const choices = useMemo(() => allChoices.filter((choice) => choice.offer.kind === sourceKind), [allChoices, sourceKind]);

  function resetForm() {
    setForm(initialForm());
    setEditing(null);
    setSourceKey("");
  }

  function editCampaign(campaign: CampaignRow) {
    setEditing(campaign);
    setForm({
      title: campaign.title,
      slug: campaign.slug,
      summary: campaign.summary,
      description: campaign.description,
      startsAt: malaysiaLocalDateTime(campaign.starts_at),
      endsAt: malaysiaLocalDateTime(campaign.ends_at),
      offers: campaign.offers.map((offer) => offer.voucher_id
        ? { kind: "voucher", voucherId: offer.voucher_id, position: offer.position }
        : { kind: "product", productId: offer.product_id!, outletId: offer.outlet_id!, position: offer.position }),
    });
    setSourceKey("");
  }

  function addOffer() {
    const choice = choices.find((item) => item.key === sourceKey);
    if (!choice || form.offers.some((offer) => sourceChoiceKey(offer) === choice.key) || form.offers.length >= 24) return;
    setForm((current) => ({ ...current, offers: [...current.offers, { ...choice.offer, position: current.offers.length }] }));
    setSourceKey("");
  }

  function removeOffer(index: number) {
    setForm((current) => ({ ...current, offers: current.offers.filter((_, itemIndex) => itemIndex !== index).map((offer, position) => ({ ...offer, position })) }));
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isInvalidDateTimeRange(form.startsAt, form.endsAt)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(editing ? `/api/admin/promotion-campaigns/${editing.id}` : "/api/admin/promotion-campaigns", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? {
          action: "save_draft",
          campaign: { ...form, startsAt: malaysiaDateTimeLocalToIso(form.startsAt), endsAt: malaysiaDateTimeLocalToIso(form.endsAt), expectedUpdatedAt: editing.updated_at },
        } : { ...form, startsAt: malaysiaDateTimeLocalToIso(form.startsAt), endsAt: malaysiaDateTimeLocalToIso(form.endsAt) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("promotionCampaigns.errors.save"));
      resetForm();
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("promotionCampaigns.errors.save"));
    } finally {
      setBusy(false);
    }
  }

  async function transition(campaign: CampaignRow, action: "submit" | "approve" | "reject" | "pause" | "resume" | "archive") {
    let note: string | undefined;
    let confirmationMessage: string | null = null;
    if (action === "reject") {
      const value = await prompt(t("promotionCampaigns.prompts.rejectReason"));
      if (value === null) return;
      note = value;
    } else {
      switch (action) {
        case "submit": confirmationMessage = t("promotionCampaigns.prompts.confirm.submit"); break;
        case "approve": confirmationMessage = t("promotionCampaigns.prompts.confirm.approve"); break;
        case "pause": confirmationMessage = t("promotionCampaigns.prompts.confirm.pause"); break;
        case "archive": confirmationMessage = t("promotionCampaigns.prompts.confirm.archive"); break;
      }
      if (confirmationMessage && !await confirm(confirmationMessage)) return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/promotion-campaigns/${campaign.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedUpdatedAt: campaign.updated_at, ...(note ? { note } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("promotionCampaigns.errors.transition"));
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("promotionCampaigns.errors.transition"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><Megaphone size={15} /> {t("promotionCampaigns.eyebrow")}</>}
        title={t("promotionCampaigns.title")}
        description={t("promotionCampaigns.description")}
        actions={<Button type="button" variant="outline" onClick={() => void reload()} disabled={loading || busy}><RefreshCw size={15} /> {t("promotionCampaigns.refresh")}</Button>}
      />

      {loading ? <p role="status" className="text-sm text-muted-foreground">{t("promotionCampaigns.states.loading")}</p> : forbidden ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{t("promotionCampaigns.errors.forbidden")}</div>
      ) : (
        <>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
          <form onSubmit={(event) => void saveDraft(event)} className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-foreground">{editing ? t("promotionCampaigns.form.editTitle") : t("promotionCampaigns.form.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("promotionCampaigns.form.guidance")}</p></div>
              {editing && <Button type="button" variant="ghost" onClick={resetForm}><X size={15} /> {t("promotionCampaigns.form.cancelEdit")}</Button>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.name")}<input required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /></label>
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.slug")}<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minLength={3} maxLength={120} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /></label>
              <label className="text-sm font-semibold text-foreground md:col-span-2">{t("promotionCampaigns.form.summary")}<input required minLength={10} maxLength={240} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /></label>
              <label className="text-sm font-semibold text-foreground md:col-span-2">{t("promotionCampaigns.form.description")}<textarea required minLength={10} maxLength={5000} rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 font-normal" /></label>
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.startsAt")}<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /></label>
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.endsAt")}<input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 font-normal" /></label>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-foreground">{t("promotionCampaigns.form.offers")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("promotionCampaigns.form.offerGuidance")}</p></div><span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">{t("promotionCampaigns.form.offerCount", { count: form.offers.length })}</span></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                <select aria-label={t("promotionCampaigns.form.offerType")} value={sourceKind} onChange={(event) => { setSourceKind(event.target.value as "product" | "voucher"); setSourceKey(""); }} className="h-10 rounded-lg border border-input bg-background px-3 text-sm"><option value="product">{t("promotionCampaigns.form.product")}</option><option value="voucher">{t("promotionCampaigns.form.voucher")}</option></select>
                <select aria-label={t("promotionCampaigns.form.source")} value={sourceKey} onChange={(event) => setSourceKey(event.target.value)} className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm"><option value="">{t("promotionCampaigns.form.chooseSource")}</option>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select>
                <Button type="button" variant="outline" onClick={addOffer} disabled={!sourceKey || form.offers.length >= 24}><Plus size={15} /> {t("promotionCampaigns.form.addOffer")}</Button>
              </div>
              {choices.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("promotionCampaigns.form.noSources")}</p>}
              {form.offers.length > 0 && <ol className="mt-4 space-y-2">{form.offers.map((offer, index) => {
                const choice = allChoices.find((item) => item.key === sourceChoiceKey(offer));
                const staleLabel = offer.kind === "voucher" ? t("promotionCampaigns.form.unavailableVoucher") : t("promotionCampaigns.form.unavailableProduct");
                return <li key={sourceChoiceKey(offer)} className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-background p-3 text-sm"><span className="min-w-0 break-words">{index + 1}. {choice?.label ?? staleLabel}</span><Button type="button" variant="ghost" size="sm" aria-label={t("promotionCampaigns.form.removeOffer", { name: choice?.label ?? staleLabel })} onClick={() => removeOffer(index)}><X size={14} /></Button></li>;
              })}</ol>}
            </div>
            {isInvalidDateTimeRange(form.startsAt, form.endsAt) && <p role="alert" className="text-sm text-destructive">{t("promotionCampaigns.form.invalidRange")}</p>}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || isInvalidDateTimeRange(form.startsAt, form.endsAt)}><Save size={15} /> {editing ? t("promotionCampaigns.form.saveChanges") : t("promotionCampaigns.form.saveDraft")}</Button><span className="self-center text-xs text-muted-foreground">{t("promotionCampaigns.form.timezone")}</span></div>
          </form>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4"><h2 className="font-bold text-foreground">{t("promotionCampaigns.list.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("promotionCampaigns.list.description", { count: campaigns.length })}</p></div>
            {campaigns.length === 0 ? <div className="p-8 text-center"><CalendarClock size={24} className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold text-foreground">{t("promotionCampaigns.states.empty")}</p><p className="mt-1 text-sm text-muted-foreground">{t("promotionCampaigns.states.emptyDescription")}</p></div> : <div className="divide-y divide-border">{campaigns.map((campaign) => <article key={campaign.id} className="grid gap-4 p-5 xl:grid-cols-[minmax(220px,1fr)_220px_130px_minmax(260px,auto)] xl:items-center">
              <div className="min-w-0"><h3 className="break-words font-semibold text-foreground">{campaign.title}</h3><p className="mt-1 break-all text-xs text-muted-foreground">/customer/events/{campaign.slug}</p><p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"><span>{campaign.offers.length}</span><span aria-hidden="true">·</span><span>{t("promotionCampaigns.list.linkedOffers")}</span></p>{campaign.rejection_note && <p className="mt-2 break-words rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"><span>{t("promotionCampaigns.list.rejection")}</span><span aria-hidden="true">: </span><span>{campaign.rejection_note}</span></p>}</div>
              <div className="text-xs text-muted-foreground"><p><span>{t("promotionCampaigns.form.startsAt")}</span><span aria-hidden="true">: </span><span>{formatDateTime(campaign.starts_at, locale, { timeZone: "Asia/Kuala_Lumpur" })}</span></p><p className="mt-1"><span>{t("promotionCampaigns.form.endsAt")}</span><span aria-hidden="true">: </span><span>{formatDateTime(campaign.ends_at, locale, { timeZone: "Asia/Kuala_Lumpur" })}</span></p></div>
              <span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-bold text-foreground">{t(`promotionCampaigns.status.${campaign.status}`)}</span>
              <div className="flex flex-wrap gap-2 xl:justify-end">{(campaign.status === "draft" || campaign.status === "rejected") && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => editCampaign(campaign)}><Save size={14} /> {t("promotionCampaigns.actions.edit")}</Button>}{actionForStatus(campaign.status).filter((action) => !(campaign.status === "pending_approval" && campaign.created_by === currentUser?.id && (action === "approve" || action === "reject"))).map((action) => <Button key={action} type="button" size="sm" variant={action === "reject" || action === "archive" ? "outline" : "default"} disabled={busy} onClick={() => void transition(campaign, action)}>{action === "approve" ? <ShieldCheck size={14} /> : action === "submit" ? <Send size={14} /> : null}{t(`promotionCampaigns.actions.${action}`)}</Button>)}</div>
            </article>)}</div>}
          </section>
        </>
      )}
    </AdminPageShell>
  );
}
