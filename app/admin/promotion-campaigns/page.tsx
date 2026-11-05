"use client";

import { useCallback, useEffect, useState } from "react";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { CalendarClock, ChevronLeft, ChevronRight, ImagePlus, Loader2, MapPin, Megaphone, RefreshCw, Save, Send, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { paginateStaffConductRecords } from "@/components/admin/staff-conduct-filtering";
import { campaignCreateSchema } from "@/lib/promotion-campaigns/validation";
import { getAdminEventScheduleStatus } from "@/lib/promotion-campaigns/locations";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppDialog } from "@/components/providers/app-dialog";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { getMalaysiaDateRangeDefaults } from "@/lib/datetime/date-input";
import { isInvalidMalaysiaDateRange, isMalaysiaFullDayRange, malaysiaCalendarDateToIso } from "@/lib/datetime/malaysia";
import { PROMOTION_CAMPAIGN_STATUSES, type PromotionCampaignStatus } from "@/lib/promotion-campaigns/types";
import { EventLocationsEditor, toLocationPayload, type EditableLocation, type LocationDefaults } from "./event-locations-editor";

type LocationRow = {
  id: string; name: string; address: string | null; lat: number | null; lng: number | null;
  starts_on: string; ends_on: string; opens_at: string; closes_at: string; status?: string; updated_at?: string;
  max_stalls?: number | null; applications_open?: boolean; applications_close_at?: string | null;
  approvals_close_at?: string | null; setup_starts_at?: string | null; registrations?: { status: string }[];
};
type CampaignRow = {
  id: string; slug: string; title: string; summary: string; description: string;
  poster_url: string | null; operating_hours: string | null;
  status: PromotionCampaignStatus; starts_at: string; ends_at: string;
  created_by: string; updated_at: string; rejection_note: string | null;
  locations?: LocationRow[];
};

function toEditableLocations(rows: LocationRow[] | undefined): EditableLocation[] {
  return [...(rows ?? [])]
    .sort((left, right) => left.starts_on.localeCompare(right.starts_on))
    .map((row) => ({
      id: row.id, key: row.id, name: row.name, address: row.address ?? "", lat: row.lat, lng: row.lng,
      startsOn: row.starts_on, endsOn: row.ends_on, opensAt: row.opens_at.slice(0, 5), closesAt: row.closes_at.slice(0, 5),
      status: row.status === "cancelled" ? "cancelled" as const : "active" as const,
      updatedAt: row.updated_at,
      maxStalls: row.max_stalls ?? null, applicationsOpen: row.applications_open ?? false,
      applicationsCloseAt: row.applications_close_at ?? null, approvalsCloseAt: row.approvals_close_at ?? null, setupStartsAt: row.setup_starts_at ?? null,
      occupiedStalls: row.registrations?.filter((r) => r.status === "approved").length ?? 0,
      pendingReviewCount: row.registrations?.filter((r) => r.status === "pending").length ?? 0,
      changesRequestedCount: row.registrations?.filter((r) => r.status === "changes_requested").length ?? 0,
    }));
}
type DraftForm = {
  title: string; slug: string; summary: string; description: string;
  startsAt: string; endsAt: string; posterUrl: string | null; operatingHours: string;
};

function malaysiaLocalDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}

function initialForm(): DraftForm {
  const defaults = getMalaysiaDateRangeDefaults();
  return { title: "", slug: "", summary: "", description: "", startsAt: defaults.from, endsAt: defaults.to, posterUrl: null, operatingHours: composeOperatingHours("10:00", "22:00") };
}

function formatTimeOfDay(hhmm: string): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(2000, 0, 1, hour, minute));
}

function composeOperatingHours(from: string, to: string): string {
  if (!from || !to) return "";
  return `${formatTimeOfDay(from)} – ${formatTimeOfDay(to)} daily`;
}

function parseOperatingHours(text: string): { from: string; to: string } | null {
  const match = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  const to24 = (hourText: string, minuteText: string, meridiem: string) => {
    let hour = Number(hourText) % 12;
    if (meridiem.toUpperCase() === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${minuteText}`;
  };
  return { from: to24(match[1], match[2], match[3]), to: to24(match[4], match[5], match[6]) };
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
  const { confirm, prompt } = useAppDialog();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [newFormBaseline, setNewFormBaseline] = useState<DraftForm>(initialForm);
  const [form, setForm] = useState<DraftForm>(newFormBaseline);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const { showFeedback } = useActionFeedback();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { t: tCommon } = useTranslation("common");
  const [hoursFrom, setHoursFrom] = useState("10:00");
  const [hoursTo, setHoursTo] = useState("22:00");
  const [formLocations, setFormLocations] = useState<EditableLocation[]>([]);
  const [openLocationsFor, setOpenLocationsFor] = useState<string | null>(null);
  const [formLocationEditing, setFormLocationEditing] = useState(false);
  const [listLocationEditing, setListLocationEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [clock, setClock] = useState(() => new Date());
  const childEditing = formLocationEditing || listLocationEditing;
  const awaitingApproval = editing?.status === "pending_approval";
  // Live and paused events can be corrected in place; the address stays fixed (shared links).
  const live = editing?.status === "approved" || editing?.status === "paused";
  const actualLocations = editing ? [...(campaigns.find(row => row.id === editing.id)?.locations ? toEditableLocations(campaigns.find(row => row.id === editing.id)?.locations) : toEditableLocations(editing.locations)), ...formLocations] : formLocations;
  let draftFields: Record<string, unknown>;
  try { draftFields = { ...form, startsAt: malaysiaCalendarDateToIso(form.startsAt, "start"), endsAt: malaysiaCalendarDateToIso(form.endsAt, "end") }; }
  catch { draftFields = { ...form, startsAt: "", endsAt: "" }; }
  const parsedFields = campaignCreateSchema.safeParse(draftFields);
  const fieldIssues = parsedFields.success ? [] : [...new Set(parsedFields.error.issues.map(issue => String(issue.path[0])))];
  const hoursInvalid = !hoursFrom || !hoursTo || hoursTo <= hoursFrom;
  const basicReady = parsedFields.success && !hoursInvalid;
  const hasOpenLocation = actualLocations.some(location => location.status !== "cancelled" && location.startsOn >= form.startsAt && location.endsOn <= form.endsAt && Date.parse(`${location.endsOn}T${location.closesAt.slice(0, 5)}:00+08:00`) > clock.getTime());
  const publishChecks = [
    { key: "basics", done: basicReady }, { key: "poster", done: Boolean(form.posterUrl) },
    { key: "location", done: hasOpenLocation }, { key: "savedLocations", done: !childEditing },
  ];
  const publishReady = publishChecks.every(check => check.done);
  const dirty = childEditing || Boolean(formLocations.length) || (editing
    ? [form.title !== editing.title, form.slug !== editing.slug, form.summary !== editing.summary, form.description !== editing.description, form.posterUrl !== editing.poster_url, form.operatingHours !== editing.operating_hours, form.startsAt !== malaysiaLocalDateTime(editing.starts_at).slice(0, 10), form.endsAt !== malaysiaLocalDateTime(editing.ends_at).slice(0, 10)].some(Boolean)
    : Boolean(form.title || form.slug || form.summary || form.description || form.posterUrl || form.startsAt !== newFormBaseline.startsAt || form.endsAt !== newFormBaseline.endsAt || form.operatingHours !== newFormBaseline.operatingHours));
  useEffect(() => {
    if (childEditing) return;
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, [childEditing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const rangeInvalid = Boolean(dateFrom && dateTo && dateTo < dateFrom);
  const filteredCampaigns = campaigns.filter(campaign => !rangeInvalid && (!query.trim() || `${campaign.title} ${campaign.slug}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    && (statusFilter === "all" || campaign.status === statusFilter)
    && (scheduleFilter === "all" || getAdminEventScheduleStatus(campaign, clock) === scheduleFilter)
    && (!dateFrom || malaysiaLocalDateTime(campaign.ends_at).slice(0, 10) >= dateFrom)
    && (!dateTo || malaysiaLocalDateTime(campaign.starts_at).slice(0, 10) <= dateTo));
  const pagedCampaigns = paginateStaffConductRecords(filteredCampaigns, page, pageSize);
  function canPublishRow(campaign: CampaignRow) { return Boolean(campaign.poster_url && campaign.locations?.some(location => location.status !== "cancelled" && Date.parse(`${location.ends_on}T${location.closes_at.slice(0, 5)}:00+08:00`) > clock.getTime())); }
  function fieldProps(field: string) { return { name: field, disabled: busy || awaitingApproval, "aria-invalid": Boolean(touched[field] && fieldIssues.includes(field)), onBlur: () => setTouched(old => ({ ...old, [field]: true })) }; }
  function fieldError(field: string) { return touched[field] && fieldIssues.includes(field) ? <span role="alert" className="mt-1 block text-xs font-normal text-destructive">{t(`promotionCampaigns.form.fieldErrors.${field}`)}</span> : null; }


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
      setForbidden(false);
      return payload.data?.campaigns as CampaignRow[];
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("promotionCampaigns.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const reload = useCallback(async () => {
    if (childEditing) return;
    setRefreshing(true);
    setError(null);
    try { await load(); } finally { setRefreshing(false); }
  }, [load, childEditing]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    const next = initialForm();
    setNewFormBaseline(next);
    setForm(next);
    setEditing(null);
    setHoursFrom("10:00");
    setHoursTo("22:00");
    setTouched({});
    setFormLocations([]);
  }

  // New locations start on the event's dates and default hours; the admin adjusts per stop.
  function locationDefaultsFor(startsAt: string, endsAt: string): LocationDefaults {
    return { startsOn: startsAt.slice(0, 10), endsOn: endsAt.slice(0, 10), opensAt: hoursFrom || "10:00", closesAt: hoursTo || "22:00" };
  }

  async function editCampaign(campaign: CampaignRow) {
    if (uploading || childEditing || (dirty && !await confirm(t("promotionCampaigns.form.discardConfirm")))) return;
    setFormLocations([]);
    setTouched({});
    setEditing(campaign);
    setForm({
      title: campaign.title,
      slug: campaign.slug,
      summary: campaign.summary,
      description: campaign.description,
      startsAt: malaysiaLocalDateTime(campaign.starts_at).slice(0, 10),
      endsAt: malaysiaLocalDateTime(campaign.ends_at).slice(0, 10),
      posterUrl: campaign.poster_url,
      operatingHours: campaign.operating_hours ?? "",
    });
    const parsedHours = parseOperatingHours(campaign.operating_hours ?? "");
    setHoursFrom(parsedHours?.from ?? "");
    setHoursTo(parsedHours?.to ?? "");
  }

  function updateOperatingHours(nextFrom: string, nextTo: string) {
    setHoursFrom(nextFrom);
    setHoursTo(nextTo);
    setForm((prev) => ({ ...prev, operatingHours: composeOperatingHours(nextFrom, nextTo) }));
  }

  async function handlePosterChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/promotion-campaigns/upload", { method: "POST", body: formData });
      const body = await response.json() as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !body.data?.url) throw new Error(body.error?.message ?? t("promotionCampaigns.errors.upload"));
      setForm((prev) => ({ ...prev, posterUrl: body.data!.url! }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("promotionCampaigns.errors.upload"));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  function removePoster() {
    setForm((prev) => ({ ...prev, posterUrl: null }));
  }

  async function publishCampaign(campaign: CampaignRow, progress?: (row: CampaignRow) => void) {
    let current = campaign;
    if (current.status === "draft" || current.status === "rejected") {
      const response = await fetch(`/api/admin/promotion-campaigns/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", expectedUpdatedAt: current.updated_at }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("promotionCampaigns.errors.transition"));
      current = { ...current, ...payload.data };
      progress?.(current);
    }
    if (current.status !== "pending_approval") throw new Error(t("promotionCampaigns.errors.transition"));
    const response = await fetch(`/api/admin/promotion-campaigns/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", expectedUpdatedAt: current.updated_at }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || t("promotionCampaigns.errors.transition"));
    return { ...current, ...payload.data } as CampaignRow;
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    if (uploading || childEditing || !basicReady || (publish && !publishReady)) {
      setTouched(Object.fromEntries(fieldIssues.map(field => [field, true])));
      setError(t("promotionCampaigns.form.completeChecklist"));
      return;
    }
    if (live && !await confirm(t("promotionCampaigns.form.liveSaveConfirm"))) return;
    setBusy(true); setError(null);
    let saved = editing;
    try {
      if (!awaitingApproval && (!editing || dirty || editing.status === "rejected")) {
        const datesUnchanged = editing && form.startsAt === malaysiaLocalDateTime(editing.starts_at).slice(0, 10) && form.endsAt === malaysiaLocalDateTime(editing.ends_at).slice(0, 10);
        const campaignPayload = { ...parsedFields.data!, startsAt: datesUnchanged ? editing.starts_at : malaysiaCalendarDateToIso(form.startsAt, "start"), endsAt: datesUnchanged ? editing.ends_at : malaysiaCalendarDateToIso(form.endsAt, "end") };
        const response = await fetch(editing ? `/api/admin/promotion-campaigns/${editing.id}` : "/api/admin/promotion-campaigns", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { action: "save_draft", campaign: { ...campaignPayload, expectedUpdatedAt: editing.updated_at } } : campaignPayload) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || t("promotionCampaigns.errors.save"));
        saved = payload.data as CampaignRow;
        setEditing(saved);
        const savedLocations = [...(saved.locations ?? campaigns.find(row => row.id === saved!.id)?.locations ?? [])];
        const pendingLocations = [...formLocations];
        for (let index = 0; index < pendingLocations.length; index += 1) {
          const location = pendingLocations[index];
          const locationResponse = await fetch(`/api/admin/promotion-campaigns/${saved.id}/locations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toLocationPayload(location)) });
          const locationPayload = await locationResponse.json().catch(() => ({}));
          if (!locationResponse.ok) throw new Error(locationPayload.error?.message ?? t("promotionCampaigns.locations.saveError"));
          if (locationPayload.data) savedLocations.push(locationPayload.data);
          saved = { ...saved, locations: savedLocations };
          setEditing(saved);
          setFormLocations(pendingLocations.slice(index + 1));
        }
      }
      if (!saved) throw new Error(t("promotionCampaigns.errors.save"));
      if (publish) await publishCampaign(saved, setEditing);
      showFeedback("success", t(publish ? "promotionCampaigns.form.published" : live ? "promotionCampaigns.form.liveSaved" : "promotionCampaigns.form.draftSaved"));
      resetForm();
      await load();
    } catch (reason) {
      await load();
      setError(`${reason instanceof Error ? reason.message : t("promotionCampaigns.errors.save")}${saved ? ` ${t("promotionCampaigns.form.savedRecovery")}` : ""}`);
    } finally { setBusy(false); }
  }

  async function transition(campaign: CampaignRow, action: "submit" | "approve" | "reject" | "pause" | "resume" | "archive") {
    if (uploading || childEditing || editing?.id === campaign.id) return;
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
        case "resume": confirmationMessage = t("promotionCampaigns.prompts.confirm.resume"); break;
        case "archive": confirmationMessage = t("promotionCampaigns.prompts.confirm.archive"); break;
      }
      if (confirmationMessage && !await confirm(confirmationMessage)) return;
    }
    setBusy(true);
    setError(null);
    try {
      if (action === "submit") { await publishCampaign(campaign); await load(); return; }
      const response = await fetch(`/api/admin/promotion-campaigns/${campaign.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedUpdatedAt: campaign.updated_at, ...(note ? { note } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("promotionCampaigns.errors.transition"));
      await reload();
    } catch (reason) {
      await load();
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
        actions={<Button type="button" variant="outline" onClick={() => void reload()} disabled={loading || refreshing || busy || childEditing}><RefreshCw size={15} /> {t("promotionCampaigns.refresh")}</Button>}
      />

      {loading ? <p role="status" className="text-sm text-muted-foreground">{t("promotionCampaigns.states.loading")}</p> : forbidden ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">{t("promotionCampaigns.errors.forbidden")}</div>
      ) : (
        <>
          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
          <form noValidate onSubmit={(event) => void saveDraft(event)} className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-lg font-bold text-foreground">{editing ? t("promotionCampaigns.form.editTitle") : t("promotionCampaigns.form.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("promotionCampaigns.form.guidance")}</p></div>
              {editing && <Button type="button" variant="ghost" disabled={childEditing || busy || uploading} onClick={async () => { if (!dirty || await confirm(t("promotionCampaigns.form.discardConfirm"))) resetForm(); }}><X size={15} /> {t("promotionCampaigns.form.cancelEdit")}</Button>}
            </div>
            {dirty && <p className="text-xs text-muted-foreground">{t("promotionCampaigns.form.unsaved")}</p>}
            {awaitingApproval && <p role="status" className="text-sm text-muted-foreground">{t("promotionCampaigns.form.pendingRecovery")}</p>}
            {live && <p role="status" data-live-event-edit className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">{t("promotionCampaigns.form.liveEditing")}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.name")}<Input {...fieldProps("title")} required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background dark:bg-background px-3 font-normal" />{fieldError("title")}</label>
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.slug")}<Input {...fieldProps("slug")} disabled={busy || awaitingApproval || live} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minLength={3} maxLength={120} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background dark:bg-background px-3 font-normal" />{fieldError("slug")}</label>
              <p className="text-xs text-muted-foreground md:col-span-2">{t(live ? "promotionCampaigns.form.slugLocked" : "promotionCampaigns.form.slugHint")} <span className="break-all font-mono">/customer/events/{form.slug || "event-name"}</span></p>
              <label className="text-sm font-semibold text-foreground md:col-span-2">{t("promotionCampaigns.form.summary")}<Input {...fieldProps("summary")} required minLength={10} maxLength={240} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background dark:bg-background px-3 font-normal" />{fieldError("summary")}</label>
              <label className="text-sm font-semibold text-foreground md:col-span-2">{t("promotionCampaigns.form.description")}<Textarea {...fieldProps("description")} required minLength={10} maxLength={5000} rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 w-full rounded-lg border border-input bg-background dark:bg-background px-3 py-2 font-normal" />{fieldError("description")}</label>
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.startsAt")}<Input {...fieldProps("startsAt")} required type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background dark:bg-background px-3 font-normal" />{fieldError("startsAt")}</label>
              <label className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.endsAt")}<Input {...fieldProps("endsAt")} required type="date" min={form.startsAt || undefined} value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-input bg-background dark:bg-background px-3 font-normal" />{fieldError("endsAt")}</label>
              <div className="md:col-span-2">
                <span className="text-sm font-semibold text-foreground">{t("promotionCampaigns.form.operatingHours")}</span>
                <p className="mt-1 text-xs text-muted-foreground">{t("promotionCampaigns.form.defaultsHint")}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-muted-foreground">{t("promotionCampaigns.form.operatingHoursFrom")}<Input disabled={busy || awaitingApproval} required type="time" value={hoursFrom} onChange={(event) => updateOperatingHours(event.target.value, hoursTo)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background dark:bg-background px-3 font-normal text-foreground" /></label>
                  <label className="text-xs font-semibold text-muted-foreground">{t("promotionCampaigns.form.operatingHoursTo")}<Input disabled={busy || awaitingApproval} required type="time" value={hoursTo} min={hoursFrom || undefined} onChange={(event) => updateOperatingHours(hoursFrom, event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background dark:bg-background px-3 font-normal text-foreground" /></label>
                </div>
                {form.operatingHours && <p className="mt-1.5 text-xs text-muted-foreground">{form.operatingHours}</p>}
                {hoursFrom && hoursTo && hoursTo <= hoursFrom && <p role="alert" className="mt-1.5 text-xs text-destructive">{t("promotionCampaigns.form.invalidOperatingHours")}</p>}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-sm font-semibold text-foreground">{t("promotionCampaigns.form.poster")}</span>
              {form.posterUrl ? (
                <div className="flex items-center gap-3">
                  <button type="button" aria-label={t("promotionCampaigns.form.previewPoster")} onClick={() => setPreviewUrl(form.posterUrl)} className="rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.posterUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  </button>
                  {live ? (
                    // A live event must keep a poster, so it can be replaced but not removed.
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                      {uploading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                      {t("promotionCampaigns.form.replacePoster")}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handlePosterChange(event)} disabled={uploading || busy} />
                    </label>
                  ) : <Button type="button" variant="destructive" size="sm" disabled={busy || awaitingApproval} onClick={removePoster}><X size={14} aria-hidden="true" /> {t("promotionCampaigns.form.removePoster")}</Button>}
                </div>
              ) : (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                  {uploading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                  {t("promotionCampaigns.form.choosePoster")}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handlePosterChange(event)} disabled={uploading || busy || awaitingApproval} />
                </label>
              )}
            </div>
            <div className="rounded-xl border border-border p-4">
              <EventLocationsEditor
                campaignId={editing?.id ?? null}
                locations={actualLocations}
                defaults={locationDefaultsFor(form.startsAt, form.endsAt)}
                onLocalChange={setFormLocations}
                onDraftChange={setFormLocationEditing}
                onSavedLocation={key => setFormLocations(old => old.filter(location => location.key !== key))}
                disabled={busy || awaitingApproval}
                onSaved={async () => { await load(); }}
              />
            </div>
            {isInvalidMalaysiaDateRange(form.startsAt, form.endsAt) && <p role="alert" className="text-sm text-destructive">{t("promotionCampaigns.form.invalidRange")}</p>}
            {!live && <section className="rounded-xl border border-border bg-background p-4" aria-label={t("promotionCampaigns.form.checklistTitle")}>
              <h3 className="text-sm font-semibold">{t("promotionCampaigns.form.checklistTitle")}</h3>
              <ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2">{publishChecks.map(check => <li key={check.key} className={check.done ? "text-foreground" : "text-muted-foreground"}>{t(check.done ? "promotionCampaigns.form.checkDone" : "promotionCampaigns.form.checkMissing", { item: t(`promotionCampaigns.form.checks.${check.key}`) })}</li>)}</ul>
              {!publishReady && <p className="mt-2 text-xs text-muted-foreground">{t("promotionCampaigns.form.completeChecklist")}</p>}
            </section>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="intent" value="draft" variant="outline" disabled={busy || uploading || childEditing || !basicReady || awaitingApproval}><Save size={15} /> {editing ? t("promotionCampaigns.form.saveChanges") : t("promotionCampaigns.form.saveOnly")}</Button>
              {!live && <Button type="submit" name="intent" value="publish" disabled={busy || uploading || childEditing || !publishReady}><Send size={15} /> {t("promotionCampaigns.form.saveDraft")}</Button>}
              <span className="self-center text-xs text-muted-foreground">{t("promotionCampaigns.form.timezone")}</span>
            </div>
          </form>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4"><h2 className="font-bold text-foreground">{t("promotionCampaigns.list.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("promotionCampaigns.list.description", { count: filteredCampaigns.length })}</p></div>
            <div className="p-4"><AdminFilterBar>
              <label className="text-xs text-muted-foreground">{t("promotionCampaigns.list.search")}<input disabled={childEditing} className={`${adminFilterControlClassName} ml-2`} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
              <label className="text-xs text-muted-foreground">{t("promotionCampaigns.list.statusFilter")}<select disabled={childEditing} className={`${adminFilterControlClassName} ml-2`} value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">{tCommon("filters.all")}</option>{PROMOTION_CAMPAIGN_STATUSES.map(status => <option key={status} value={status}>{t(`promotionCampaigns.status.${status}`)}</option>)}</select></label>
              <label className="text-xs text-muted-foreground">{t("promotionCampaigns.list.scheduleLabel")}<select disabled={childEditing} className={`${adminFilterControlClassName} ml-2`} value={scheduleFilter} onChange={event => { setScheduleFilter(event.target.value); setPage(1); }}><option value="all">{tCommon("filters.all")}</option>{["unconfigured", "upcoming", "operating", "between_sessions", "ended"].map(status => <option key={status} value={status}>{t(`promotionCampaigns.schedule.${status}`)}</option>)}</select></label>
              <label className="text-xs text-muted-foreground">{t("promotionCampaigns.list.dateFrom")}<input disabled={childEditing} type="date" className={`${adminFilterControlClassName} ml-2`} value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} /></label>
              <label className="text-xs text-muted-foreground">{t("promotionCampaigns.list.dateTo")}<input disabled={childEditing} type="date" className={`${adminFilterControlClassName} ml-2`} min={dateFrom || undefined} value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} /></label>
              <select disabled={childEditing} aria-label={t("ui.pagination.perPage", { count: pageSize })} className={adminFilterControlClassName} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[15,25,50].map(size => <option key={size} value={size}>{t("ui.pagination.perPage", { count: size })}</option>)}</select>
              <Button type="button" disabled={childEditing} variant="ghost" onClick={() => { setQuery(""); setStatusFilter("all"); setScheduleFilter("all"); setDateFrom(""); setDateTo(""); setPage(1); }}>{tCommon("filters.clear")}</Button>
            </AdminFilterBar>{rangeInvalid && <p role="alert" className="mt-2 text-xs text-destructive">{t("promotionCampaigns.form.invalidRange")}</p>}</div>
            {filteredCampaigns.length === 0 ? <div className="p-8 text-center"><CalendarClock size={24} className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold text-foreground">{t(campaigns.length ? "promotionCampaigns.list.noMatches" : "promotionCampaigns.states.empty")}</p><p className="mt-1 text-sm text-muted-foreground">{t("promotionCampaigns.states.emptyDescription")}</p></div> : <div className="divide-y divide-border">{pagedCampaigns.items.map((campaign) => <article key={campaign.id} className="grid gap-4 p-5 xl:grid-cols-[minmax(220px,1fr)_220px_130px_minmax(260px,auto)] xl:items-center">
              {openLocationsFor === campaign.id && (
                <div className="order-last rounded-xl border border-border bg-background p-4 xl:col-span-4">
                  <EventLocationsEditor
                    campaignId={campaign.id}
                    locations={toEditableLocations(campaign.locations)}
                    defaults={locationDefaultsFor(malaysiaLocalDateTime(campaign.starts_at), malaysiaLocalDateTime(campaign.ends_at))}
                    onSaved={async () => { await load(); }}
                    onDraftChange={setListLocationEditing}
                    disabled={busy || campaign.status === "archived"}
                  />
                </div>
              )}
              <div className="min-w-0"><h3 className="break-words font-semibold text-foreground">{campaign.title}</h3><p className="mt-1 break-all text-xs text-muted-foreground">/customer/events/{campaign.slug}</p>{campaign.rejection_note && <p className="mt-2 break-words rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"><span>{t("promotionCampaigns.list.rejection")}</span><span aria-hidden="true">: </span><span>{campaign.rejection_note}</span></p>}</div>
              <div className="text-xs text-muted-foreground"><p><span>{t("promotionCampaigns.form.startsAt")}</span><span aria-hidden="true">: </span><span>{isMalaysiaFullDayRange(campaign.starts_at, campaign.ends_at) ? formatDate(campaign.starts_at, locale, { timeZone: "Asia/Kuala_Lumpur" }) : formatDateTime(campaign.starts_at, locale, { timeZone: "Asia/Kuala_Lumpur" })}</span></p><p className="mt-1"><span>{t("promotionCampaigns.form.endsAt")}</span><span aria-hidden="true">: </span><span>{isMalaysiaFullDayRange(campaign.starts_at, campaign.ends_at) ? formatDate(campaign.ends_at, locale, { timeZone: "Asia/Kuala_Lumpur" }) : formatDateTime(campaign.ends_at, locale, { timeZone: "Asia/Kuala_Lumpur" })}</span></p></div>
              <div><span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-bold text-foreground">{t(`promotionCampaigns.status.${campaign.status}`)}</span>
              <p className="mt-2 text-xs text-muted-foreground">{t("promotionCampaigns.list.scheduleLine", { status: t(`promotionCampaigns.schedule.${getAdminEventScheduleStatus(campaign, clock)}`) })}</p>
              {campaign.locations?.length && campaign.locations.every((location) => location.status === "cancelled") ? <p className="text-xs text-destructive">{t("promotionCampaigns.allLocationsCancelled")}</p> : null}</div>
              <div className="flex flex-wrap gap-2 xl:justify-end"><Button type="button" variant="outline" size="sm" disabled={childEditing || busy || uploading} aria-expanded={openLocationsFor === campaign.id} onClick={() => setOpenLocationsFor((current) => (current === campaign.id ? null : campaign.id))}><MapPin size={14} /> {t("promotionCampaigns.locations.toggle", { count: campaign.locations?.length ?? 0 })}</Button>{(campaign.status === "draft" || campaign.status === "rejected" || campaign.status === "approved" || campaign.status === "paused") && <Button type="button" variant="outline" size="sm" disabled={busy || childEditing || uploading} onClick={() => void editCampaign(campaign)}><Save size={14} /> {t("promotionCampaigns.actions.edit")}</Button>}{actionForStatus(campaign.status).map((action) => <Button key={action} type="button" size="sm" variant={action === "reject" || action === "archive" ? "outline" : "default"} disabled={busy || childEditing || uploading || editing?.id === campaign.id || ((action === "submit" || action === "approve" || action === "resume") && !canPublishRow(campaign))} title={(action === "submit" || action === "approve" || action === "resume") && !canPublishRow(campaign) ? t("promotionCampaigns.form.rowNotReady") : undefined} onClick={() => void transition(campaign, action)}>{action === "approve" ? <ShieldCheck size={14} /> : action === "submit" ? <Send size={14} /> : null}{t(`promotionCampaigns.actions.${action}`)}</Button>)}</div>
            </article>)}</div>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
              <span>{tCommon("pagination.showing", { first: filteredCampaigns.length ? (pagedCampaigns.page - 1) * pageSize + 1 : 0, last: Math.min(pagedCampaigns.page * pageSize, filteredCampaigns.length), total: filteredCampaigns.length })}</span>
              <div className="flex items-center gap-2"><span>{t("ui.pagination.pageOf", { page: pagedCampaigns.page, total: pagedCampaigns.totalPages })}</span>{pagedCampaigns.totalPages > 1 && <><Button type="button" variant="outline" size="sm" aria-label={tCommon("accessibility.previousPage")} disabled={pagedCampaigns.page <= 1 || childEditing} onClick={() => setPage(pagedCampaigns.page - 1)}><ChevronLeft size={14} /></Button><Button type="button" variant="outline" size="sm" aria-label={tCommon("accessibility.nextPage")} disabled={pagedCampaigns.page >= pagedCampaigns.totalPages || childEditing} onClick={() => setPage(pagedCampaigns.page + 1)}><ChevronRight size={14} /></Button></>}</div>
            </div>
          </section>

          <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
            <DialogContent className="sm:max-w-xl">
              <DialogTitle className="sr-only">{t("promotionCampaigns.form.poster")}</DialogTitle>
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="w-full rounded-lg object-contain" />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </AdminPageShell>
  );
}
