"use client";

import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search, ShieldCheck, UserMinus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { Button } from "@/components/ui/button";
import { buildAccessControlQuery, errorMessage } from "@/components/admin/access-control/types";
import type { ApiEnvelope, AssignmentRecord, AuditFocus, CapabilityRecord, MutationReceipt, PageResult } from "@/components/admin/access-control/types";

const PAGE_SIZE = 25;
const SUBJECT_TYPES = ["user", "role", "plan", "partner"];
type AssignmentForm = { subjectType: string; subjectId: string; capabilityKey: string; effect: "allow" | "deny"; startsAt: string; expiresAt: string; reason: string };
type PendingMutation = { type: "create"; form: AssignmentForm } | { type: "revoke"; assignment: AssignmentRecord; reason: string };
const initialForm = (): AssignmentForm => ({ subjectType: "user", subjectId: "", capabilityKey: "recommendation.submit", effect: "allow", startsAt: new Date().toISOString().slice(0, 16), expiresAt: "", reason: "" });

type CapabilityAvailability = "available" | "system-managed" | "disabled";

function capabilityAvailability(
  capability: CapabilityRecord | undefined,
  effect: AssignmentForm["effect"],
): CapabilityAvailability {
  if (!capability?.enabled) return "disabled";
  if (effect === "allow" && !capability.manuallyAssignable) return "system-managed";
  return "available";
}

export function AssignmentsTab({ focusId, onViewAudit }: { focusId: string | null; onViewAudit: (focus: AuditFocus) => void }) {
  const { t } = useTranslation("admin");
  const [result, setResult] = useState<PageResult<AssignmentRecord>>({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [capabilities, setCapabilities] = useState<CapabilityRecord[]>([]);
  const [search, setSearch] = useState(""); const [subjectType, setSubjectType] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [showCreate, setShowCreate] = useState(false); const [form, setForm] = useState(initialForm);
  const [pending, setPending] = useState<PendingMutation | null>(null); const [assignmentConfirmOpen, setAssignmentConfirmOpen] = useState(false); const [saving, setSaving] = useState(false); const [receipt, setReceipt] = useState<MutationReceipt | null>(null);
  const loadRequestId = useRef(0);
  const query = useMemo(() => buildAccessControlQuery({ page, pageSize: PAGE_SIZE, search, subjectType, status }), [page, search, status, subjectType]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true); setError("");
    try {
      const [assignmentsResponse, capabilitiesResponse] = await Promise.all([
        fetch(`/api/admin/access-control/assignments?${query}`, { cache: "no-store" }),
        fetch("/api/admin/access-control/capabilities?page=1&pageSize=100", { cache: "no-store" }),
      ]);
      const assignmentsBody = await assignmentsResponse.json() as ApiEnvelope<PageResult<AssignmentRecord>>;
      const capabilitiesBody = await capabilitiesResponse.json() as ApiEnvelope<PageResult<CapabilityRecord>>;
      if (requestId !== loadRequestId.current) return;
      if (!assignmentsResponse.ok || !assignmentsBody.data) {
        throw new Error(errorMessage(assignmentsBody, t("accessControl.errors.loadAssignments")));
      }
      if (!capabilitiesResponse.ok || !capabilitiesBody.data) {
        throw new Error(errorMessage(capabilitiesBody, t("accessControl.errors.loadCapabilities")));
      }
      setResult(assignmentsBody.data);
      setCapabilities(capabilitiesBody.data.items);
      setForm((current) => {
        const selected = capabilitiesBody.data!.items.find((item) => item.key === current.capabilityKey);
        if (capabilityAvailability(selected, current.effect) === "available") return current;
        const fallback = capabilitiesBody.data!.items.find(
          (item) => capabilityAvailability(item, current.effect) === "available",
        );
        return { ...current, capabilityKey: fallback?.key ?? "" };
      });
    } catch (caught) {
      if (requestId !== loadRequestId.current) return;
      setCapabilities([]);
      setForm((current) => ({ ...current, capabilityKey: "" }));
      setPending(null);
      setAssignmentConfirmOpen(false);
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.loadAssignments"));
    }
    finally { if (requestId === loadRequestId.current) setLoading(false); }
  }, [query, t]);
  useEffect(() => {
    const timeoutId = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);
  useEffect(() => {
    const timeoutId = setTimeout(() => setPage(1), 0);
    return () => clearTimeout(timeoutId);
  }, [search, status, subjectType]);

  const selectedCapability = capabilities.find((capability) => capability.key === form.capabilityKey);
  const selectedCapabilityAvailability = capabilityAvailability(selectedCapability, form.effect);

  function changeEffect(effect: AssignmentForm["effect"]) {
    setForm((current) => {
      const selected = capabilities.find((capability) => capability.key === current.capabilityKey);
      if (capabilityAvailability(selected, effect) === "available") return { ...current, effect };
      const fallback = capabilities.find(
        (capability) => capabilityAvailability(capability, effect) === "available",
      );
      return { ...current, effect, capabilityKey: fallback?.key ?? "" };
    });
  }

  async function mutate() {
    if (!pending) return;
    if (pending.type === "create") {
      const capability = capabilities.find((item) => item.key === pending.form.capabilityKey);
      if (capabilityAvailability(capability, pending.form.effect) !== "available") {
        setPending(null);
        setAssignmentConfirmOpen(false);
        setError(t("accessControl.errors.loadCapabilities"));
        return;
      }
    }
    setSaving(true); setError("");
    try {
      const creating = pending.type === "create";
      const currentForm = creating ? pending.form : null;
      const response = await fetch(creating ? "/api/admin/access-control/assignments" : `/api/admin/access-control/assignments/${pending.assignment.id}/revoke`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating ? { ...currentForm, startsAt: new Date(currentForm!.startsAt).toISOString(), expiresAt: currentForm!.expiresAt ? new Date(currentForm!.expiresAt).toISOString() : null, reason: currentForm!.reason.trim() } : { reason: pending.reason.trim() }),
      });
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.assignmentAction")));
      setReceipt(body.data); setPending(null); setAssignmentConfirmOpen(false); setShowCreate(false); setForm(initialForm()); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.errors.assignmentAction")); setPending(null); setAssignmentConfirmOpen(false); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <AdminFilterBar><label className="min-w-[220px] flex-1"><span className="sr-only">{t("accessControl.filters.searchAssignments")}</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("accessControl.filters.searchAssignments")} className={`${adminFilterControlClassName} w-full pl-9`} /></div></label><select value={subjectType} onChange={(event) => setSubjectType(event.target.value)} aria-label={t("accessControl.filters.subjectType")} className={adminFilterControlClassName}><option value="">{t("accessControl.filters.allSubjects")}</option>{SUBJECT_TYPES.map((value) => <option key={value} value={value}>{t(`accessControl.subjectTypes.${value}`)}</option>)}</select><AdminSegmentedFilter fullWidth={false} value={status} onChange={setStatus} ariaLabel="accessControl.accessibility.assignmentStatus" items={[{ value: "", label: t("accessControl.filters.all") }, { value: "active", label: t("accessControl.status.active") }, { value: "scheduled", label: t("accessControl.status.scheduled") }, { value: "expired", label: t("accessControl.status.expired") }, { value: "revoked", label: t("accessControl.status.revoked") }]} /><Button size="sm" onClick={() => { setReceipt(null); setShowCreate((value) => !value); }}><Plus /> {t("accessControl.actions.newAssignment")}</Button><Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></AdminFilterBar>
    {receipt && <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span>{t("accessControl.feedback.assignmentUpdated")}</span><Button size="sm" variant="outline" onClick={() => onViewAudit({ eventId: receipt.auditEventId, entityId: receipt.assignmentId })}>{t("accessControl.actions.viewAuditEvent")}</Button></div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    {showCreate && <section className="rounded-2xl border border-primary/25 bg-card p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">{t("accessControl.assignments.createTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("accessControl.assignments.hardGuardNote")}</p></div><Button variant="ghost" onClick={() => setShowCreate(false)}>{t("accessControl.actions.close")}</Button></div><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"><Label text={t("accessControl.assignments.subjectType")}><select value={form.subjectType} onChange={(event) => setForm({ ...form, subjectType: event.target.value })} className={`${adminFilterControlClassName} w-full`}>{SUBJECT_TYPES.map((value) => <option key={value} value={value}>{t(`accessControl.subjectTypes.${value}`)}</option>)}</select></Label><Label text={t("accessControl.assignments.subjectId")}><input value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })} className={`${adminFilterControlClassName} w-full`} placeholder={t("accessControl.assignments.subjectPlaceholder")} /></Label><Label text={t("accessControl.assignments.capability")}><select value={form.capabilityKey} onChange={(event) => setForm({ ...form, capabilityKey: event.target.value })} disabled={capabilities.length === 0} className={`${adminFilterControlClassName} w-full`}><option value="" disabled>{t("accessControl.assignments.selectCapability")}</option>{capabilities.map((capability) => { const availability = capabilityAvailability(capability, form.effect); const suffix = availability === "disabled" ? t("accessControl.assignments.disabledOption") : availability === "system-managed" ? t("accessControl.assignments.systemManagedOption") : ""; return <option key={capability.key} value={capability.key} disabled={availability !== "available"}>{capability.key}{suffix ? ` — ${suffix}` : ""}</option>; })}</select><span className="mt-1 block text-xs text-muted-foreground">{t(form.effect === "allow" ? "accessControl.assignments.allowCapabilityHelp" : "accessControl.assignments.denyCapabilityHelp")}</span></Label><Label text={t("accessControl.assignments.effect")}><select value={form.effect} onChange={(event) => changeEffect(event.target.value as "allow" | "deny")} className={`${adminFilterControlClassName} w-full`}><option value="allow">{t("accessControl.effects.allow")}</option><option value="deny">{t("accessControl.effects.deny")}</option></select></Label><Label text={t("accessControl.assignments.startsAt")}><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Label><Label text={t("accessControl.assignments.expiresAt")}><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Label></div><Label text={t("accessControl.forms.reason")}><textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={2000} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /></Label><div className="mt-4 flex justify-end"><Button disabled={!form.subjectId.trim() || form.reason.trim().length < 10 || selectedCapabilityAvailability !== "available"} onClick={() => { setPending({ type: "create", form }); setAssignmentConfirmOpen(true); }}><ShieldCheck /> {t("accessControl.actions.reviewAssignment")}</Button></div></section>}
    <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">{t("accessControl.assignments.subject")}</th><th>{t("accessControl.assignments.capability")}</th><th>{t("accessControl.assignments.effect")}</th><th>{t("accessControl.assignments.period")}</th><th>{t("accessControl.assignments.reason")}</th><th>{t("accessControl.assignments.status")}</th><th className="px-5 text-right">{t("accessControl.assignments.actions")}</th></tr></thead><tbody className="divide-y divide-border">{result.items.map((item) => <tr key={item.id} className={focusId === item.id ? "bg-primary/10" : "hover:bg-muted/30"}><td className="px-5 py-4"><p className="font-semibold">{t(`accessControl.subjectTypes.${item.subjectType}`)}</p><p className="max-w-48 truncate font-mono text-xs text-muted-foreground">{item.subjectId}</p></td><td className="font-mono text-xs">{item.capabilityKey}</td><td><Badge value={item.effect} /></td><td className="text-xs"><p>{formatDate(item.startsAt)}</p><p className="text-muted-foreground">{item.expiresAt ? formatDate(item.expiresAt) : t("accessControl.assignments.noExpiry")}</p></td><td className="max-w-64 truncate text-xs text-muted-foreground" title={item.reason}>{item.reason}</td><td><Badge value={item.status} /></td><td className="px-5 text-right">{!["revoked", "expired"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => setPending({ type: "revoke", assignment: item, reason: "" })}><UserMinus /> {t("accessControl.actions.revoke")}</Button>}</td></tr>)}</tbody></table></div>{loading && result.items.length === 0 ? <State text={t("accessControl.states.loading")} /> : result.items.length === 0 ? <State text={t("accessControl.states.noAssignments")} /> : <Pager page={result.page} totalPages={result.totalPages} loading={loading} setPage={setPage} />}</section>
    {pending?.type === "revoke" && <section className="rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">{t("accessControl.assignments.revokeTitle")}</h3><textarea value={pending.reason} onChange={(event) => setPending({ ...pending, reason: event.target.value })} maxLength={2000} className="mt-3 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /><div className="mt-3 flex justify-end"><Button disabled={pending.reason.trim().length < 10} onClick={() => setAssignmentConfirmOpen(true)}>{t("accessControl.actions.reviewChange")}</Button></div></section>}
    <AdminConfirmDialog open={assignmentConfirmOpen} title={pending?.type === "revoke" ? "accessControl.confirm.revokeTitle" : "accessControl.confirm.assignmentTitle"} description={pending?.type === "revoke" ? "accessControl.confirm.revokeDescription" : "accessControl.confirm.assignmentDescription"} confirmLabel="accessControl.confirm.confirm" confirmVariant={pending?.type === "revoke" ? "destructive" : "default"} busy={saving} onCancel={() => setAssignmentConfirmOpen(false)} onConfirm={() => void mutate()} />
  </div>;
}

function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="mt-3 block text-sm font-medium"><span>{text}</span><div className="mt-1">{children}</div></label>; }
function Badge({ value }: { value: string }) { const { t } = useTranslation("admin"); const tone = value === "deny" || value === "revoked" || value === "expired" ? "bg-destructive/10 text-destructive" : value === "scheduled" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" : "bg-primary/10 text-primary"; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{t(`accessControl.${value === "allow" || value === "deny" ? "effects" : "status"}.${value}`)}</span>; }
function State({ text }: { text: string }) { return <div className="px-5 py-12 text-center text-sm text-muted-foreground">{text}</div>; }
function formatDate(value: string) { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value; }
function Pager({ page, totalPages, loading, setPage }: { page: number; totalPages: number; loading: boolean; setPage: React.Dispatch<React.SetStateAction<number>> }) { const { t } = useTranslation("admin"); return <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{t("accessControl.pagination.pageOf", { page, total: Math.max(totalPages, 1) })}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><Button size="sm" variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>; }
