"use client";

import { Plus, RefreshCw, Search, ShieldCheck, UserMinus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Pagination } from "@/components/shared/pagination";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { capabilityLabel } from "@/components/admin/access-control/capability-label";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMobileRecordCard } from "@/components/admin/admin-mobile-record-card";
import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { Button } from "@/components/ui/button";
import { buildAccessControlQuery, errorMessage } from "@/components/admin/access-control/types";
import type { ApiEnvelope, AssignmentRecord, AuditFocus, CapabilityRecord, MutationReceipt, PageResult } from "@/components/admin/access-control/types";
import { getMalaysiaDateTimeLocalValue } from "@/lib/datetime/date-input";

const PAGE_SIZE = 25;
const SUBJECT_TYPES = ["user", "role", "plan", "partner"];
type AssignmentForm = { subjectType: string; subjectId: string; capabilityKey: string; effect: "allow" | "deny"; startsAt: string; expiresAt: string; reason: string };
type UserCandidate = { id: string; name: string; email: string };
type PendingMutation = { type: "create"; form: AssignmentForm } | { type: "revoke"; assignment: AssignmentRecord; reason: string };
const initialForm = (): AssignmentForm => ({ subjectType: "user", subjectId: "", capabilityKey: "recommendation.submit", effect: "allow", startsAt: getMalaysiaDateTimeLocalValue(), expiresAt: "", reason: "" });

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
  const pageSize = PAGE_SIZE;
  const [search, setSearch] = useState(""); const [subjectType, setSubjectType] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [showCreate, setShowCreate] = useState(false); const [form, setForm] = useState(initialForm);
  const [pending, setPending] = useState<PendingMutation | null>(null); const [assignmentConfirmOpen, setAssignmentConfirmOpen] = useState(false); const [saving, setSaving] = useState(false); const [receipt, setReceipt] = useState<MutationReceipt | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserCandidate | null>(null);
  const loadRequestId = useRef(0);
  const query = useMemo(() => buildAccessControlQuery({ page, pageSize, search, subjectType, status }), [page, pageSize, search, status, subjectType]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setLoading(true); setError("");
    try {
      const assignmentsResponse = await fetch(`/api/admin/access-control/assignments?${query}`, { cache: "no-store" });
      const assignmentsBody = await assignmentsResponse.json() as ApiEnvelope<PageResult<AssignmentRecord>>;
      if (requestId !== loadRequestId.current) return;
      if (!assignmentsResponse.ok || !assignmentsBody.data) {
        throw new Error(errorMessage(assignmentsBody, t("accessControl.errors.loadAssignments")));
      }
      setResult(assignmentsBody.data);
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
    if (!showCreate) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "100", manuallyAssignable: "true" });
      try {
        const response = await fetch(`/api/admin/access-control/capabilities?${params}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as ApiEnvelope<PageResult<CapabilityRecord>>;
        if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.loadCapabilities")));
        let items = body.data.items;
        const selectedKey = form.capabilityKey;
        if (selectedKey && !items.some((item) => item.key === selectedKey)) {
          const selectedParams = new URLSearchParams({ page: "1", pageSize: "1", key: selectedKey });
          const selectedResponse = await fetch(`/api/admin/access-control/capabilities?${selectedParams}`, { cache: "no-store", signal: controller.signal });
          const selectedBody = await selectedResponse.json() as ApiEnvelope<PageResult<CapabilityRecord>>;
          if (selectedResponse.ok && selectedBody.data) items = [...items, ...selectedBody.data.items];
        }
        if (!controller.signal.aborted) {
          setCapabilities(items);
          setForm((current) => {
            if (items.some((item) => item.key === current.capabilityKey)) return current;
            return { ...current, capabilityKey: items.find((item) => capabilityAvailability(item, current.effect) === "available")?.key ?? "" };
          });
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setCapabilities([]);
          setForm((current) => ({ ...current, capabilityKey: "" }));
          setPending(null);
          setAssignmentConfirmOpen(false);
          setError(caught instanceof Error ? caught.message : t("accessControl.errors.loadCapabilities"));
        }
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [form.capabilityKey, showCreate, t]);
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
      setReceipt(body.data); setPending(null); setAssignmentConfirmOpen(false); setShowCreate(false); setForm(initialForm()); setSelectedUser(null); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.errors.assignmentAction")); setPending(null); setAssignmentConfirmOpen(false); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <AdminFilterBar><label className="min-w-[220px] flex-1"><span className="sr-only">{t("accessControl.filters.searchAssignments")}</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("accessControl.filters.searchAssignments")} className={`${adminFilterControlClassName} w-full pl-9`} /></div></label><select value={subjectType} onChange={(event) => setSubjectType(event.target.value)} aria-label={t("accessControl.filters.subjectType")} className={adminFilterControlClassName}><option value="">{t("accessControl.filters.allSubjects")}</option>{SUBJECT_TYPES.map((value) => <option key={value} value={value}>{t(`accessControl.subjectTypes.${value}`)}</option>)}</select><AdminSegmentedFilter fullWidth={false} value={status} onChange={setStatus} ariaLabel="accessControl.accessibility.assignmentStatus" items={[{ value: "", label: t("accessControl.filters.all") }, { value: "active", label: t("accessControl.status.active") }, { value: "scheduled", label: t("accessControl.status.scheduled") }, { value: "expired", label: t("accessControl.status.expired") }, { value: "revoked", label: t("accessControl.status.revoked") }]} /><Button size="sm" onClick={() => { setReceipt(null); setShowCreate((value) => !value); }}><Plus /> {t("accessControl.actions.newAssignment")}</Button><Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></AdminFilterBar>
    {receipt && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span>{receipt.receiptAvailable === false ? t("accessControl.feedback.committedReceiptUnavailable") : t("accessControl.feedback.assignmentUpdated")}</span>{receipt.auditEventId && <Button size="sm" variant="outline" onClick={() => onViewAudit({ eventId: receipt.auditEventId!, entityId: receipt.assignmentId })}>{t("accessControl.actions.viewAuditEvent")}</Button>}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    {showCreate && <section className="rounded-2xl border border-primary/25 bg-card p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">{t("accessControl.assignments.createTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("accessControl.assignments.hardGuardNote")}</p></div><Button variant="ghost" onClick={() => setShowCreate(false)}>{t("accessControl.actions.close")}</Button></div><div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"><Label text={t("accessControl.assignments.subjectType")}><select value={form.subjectType} onChange={(event) => { setForm({ ...form, subjectType: event.target.value, subjectId: "" }); setSelectedUser(null); }} className={`${adminFilterControlClassName} w-full`}>{SUBJECT_TYPES.map((value) => <option key={value} value={value}>{t(`accessControl.subjectTypes.${value}`)}</option>)}</select></Label>{form.subjectType === "user" ? <AssignmentUserPicker selected={selectedUser} onSelect={(user) => { setSelectedUser(user); setForm((current) => ({ ...current, subjectId: user?.id ?? "" })); }} /> : <Label text={t("accessControl.assignments.subjectId")}><input value={form.subjectId} onChange={(event) => setForm({ ...form, subjectId: event.target.value })} className={`${adminFilterControlClassName} w-full`} placeholder={t("accessControl.assignments.subjectPlaceholder")} /></Label>}<Label text={t("accessControl.assignments.capability")}><select value={form.capabilityKey} onChange={(event) => setForm({ ...form, capabilityKey: event.target.value })} disabled={capabilities.length === 0} className={`${adminFilterControlClassName} w-full`}><option value="" disabled>{t("accessControl.assignments.selectCapability")}</option>{capabilities.map((capability) => { const availability = capabilityAvailability(capability, form.effect); const suffix = availability === "disabled" ? t("accessControl.assignments.disabledOption") : availability === "system-managed" ? t("accessControl.assignments.systemManagedOption") : ""; return <option key={capability.key} value={capability.key} disabled={availability !== "available"}>{capabilityLabel(capability.key, t)}{suffix ? ` — ${suffix}` : ""}</option>; })}</select><span className="mt-1 block text-xs text-muted-foreground">{t(form.effect === "allow" ? "accessControl.assignments.allowCapabilityHelp" : "accessControl.assignments.denyCapabilityHelp")}</span></Label><Label text={t("accessControl.assignments.effect")}><select value={form.effect} onChange={(event) => changeEffect(event.target.value as "allow" | "deny")} className={`${adminFilterControlClassName} w-full`}><option value="allow">{t("accessControl.effects.allow")}</option><option value="deny">{t("accessControl.effects.deny")}</option></select></Label><Label text={t("accessControl.assignments.startsAt")}><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Label><Label text={t("accessControl.assignments.expiresAt")}><input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Label></div><Label text={t("accessControl.forms.reason")}><textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={2000} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /></Label><div className="mt-4 flex justify-end"><Button disabled={!form.subjectId.trim() || (form.subjectType === "user" && !selectedUser) || form.reason.trim().length < 10 || selectedCapabilityAvailability !== "available"} onClick={() => { setPending({ type: "create", form }); setAssignmentConfirmOpen(true); }}><ShieldCheck /> {t("accessControl.actions.reviewAssignment")}</Button></div></section>}
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="space-y-3 p-3 lg:hidden">
        {result.items.map((item) => <AdminMobileRecordCard key={item.id} className={focusId === item.id ? "bg-primary/10" : ""} header={<div className="min-w-0"><p className="break-words font-semibold">{item.subjectType === "user" ? item.subjectName ?? t("accessControl.assignments.unavailableUser") : t(`accessControl.subjectTypes.${item.subjectType}`)}</p><p className="mt-1 break-all text-xs text-muted-foreground">{item.subjectType === "user" ? item.subjectEmail : item.subjectId}</p></div>} footer={!['revoked', 'expired'].includes(item.status) ? <Button size="sm" variant="outline" onClick={() => setPending({ type: "revoke", assignment: item, reason: "" })}><UserMinus /> {t("accessControl.actions.revoke")}</Button> : undefined}>
          <div><p className="text-xs text-muted-foreground">{t("accessControl.assignments.capability")}</p><p className="break-words font-medium">{capabilityLabel(item.capabilityKey, t)}</p></div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{t("accessControl.assignments.effect")} <Badge value={item.effect} /></span><span>{t("accessControl.assignments.status")} <Badge value={item.status} /></span></div>
          <div><p className="text-xs text-muted-foreground">{t("accessControl.assignments.period")}</p><p className="text-sm">{formatDate(item.startsAt)}</p><p className="break-words text-sm text-muted-foreground">{item.expiresAt ? formatDate(item.expiresAt) : t("accessControl.assignments.noExpiry")}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("accessControl.assignments.reason")}</p><p className="break-words text-sm">{item.reason}</p></div>
        </AdminMobileRecordCard>)}
      </div>
      <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">{t("accessControl.assignments.subject")}</th><th>{t("accessControl.assignments.capability")}</th><th>{t("accessControl.assignments.effect")}</th><th>{t("accessControl.assignments.period")}</th><th>{t("accessControl.assignments.reason")}</th><th>{t("accessControl.assignments.status")}</th><th className="px-5 text-right">{t("accessControl.assignments.actions")}</th></tr></thead><tbody className="divide-y divide-border">{result.items.map((item) => <tr key={item.id} className={focusId === item.id ? "bg-primary/10" : "hover:bg-muted/30"}><td className="px-5 py-4"><p className="font-semibold">{item.subjectType === "user" ? item.subjectName ?? t("accessControl.assignments.unavailableUser") : t(`accessControl.subjectTypes.${item.subjectType}`)}</p><p className="max-w-48 truncate text-xs text-muted-foreground">{item.subjectType === "user" ? item.subjectEmail : item.subjectId}</p></td><td className="text-sm">{capabilityLabel(item.capabilityKey, t)}</td><td><Badge value={item.effect} /></td><td className="text-xs"><p>{formatDate(item.startsAt)}</p><p className="text-muted-foreground">{item.expiresAt ? formatDate(item.expiresAt) : t("accessControl.assignments.noExpiry")}</p></td><td className="max-w-64 truncate text-xs text-muted-foreground" title={item.reason}>{item.reason}</td><td><Badge value={item.status} /></td><td className="px-5 text-right">{!["revoked", "expired"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => setPending({ type: "revoke", assignment: item, reason: "" })}><UserMinus /> {t("accessControl.actions.revoke")}</Button>}</td></tr>)}</tbody></table></div>
      {loading && result.items.length === 0 ? <State text={t("accessControl.states.loading")} /> : result.items.length === 0 ? <State text={t("accessControl.states.noAssignments")} /> : <Pagination currentPage={result.page} totalPages={result.totalPages} totalItems={result.total} pageSize={result.pageSize} onPageChange={setPage} disabled={loading} className="mt-0 border-t border-border px-5 py-3" />}
    </section>
    {pending?.type === "revoke" && <section className="rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">{t("accessControl.assignments.revokeTitle")}</h3><textarea value={pending.reason} onChange={(event) => setPending({ ...pending, reason: event.target.value })} maxLength={2000} className="mt-3 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /><div className="mt-3 flex justify-end"><Button disabled={pending.reason.trim().length < 10} onClick={() => setAssignmentConfirmOpen(true)}>{t("accessControl.actions.reviewChange")}</Button></div></section>}
    <AdminConfirmDialog open={assignmentConfirmOpen} title={pending?.type === "revoke" ? "accessControl.confirm.revokeTitle" : "accessControl.confirm.assignmentTitle"} description={pending?.type === "create" && pending.form.subjectType === "user" && selectedUser ? <span>{t("accessControl.confirm.assignmentDescription")} {selectedUser.name} · {selectedUser.email}</span> : pending?.type === "revoke" ? "accessControl.confirm.revokeDescription" : "accessControl.confirm.assignmentDescription"} confirmLabel="accessControl.confirm.confirm" confirmVariant={pending?.type === "revoke" ? "destructive" : "default"} confirmationPhrase="CONFIRM" confirmationResetKey={JSON.stringify(pending)} busy={saving} onCancel={() => setAssignmentConfirmOpen(false)} onConfirm={() => void mutate()} />
  </div>;
}

function AssignmentUserPicker({ selected, onSelect }: { selected: UserCandidate | null; onSelect: (user: UserCandidate | null) => void }) {
  const { t } = useTranslation("admin");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<UserCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setSearching(true);
      setAttempted(false);
      setError("");
      try {
        const response = await fetch(`/api/admin/access-control/user-candidates?search=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json() as ApiEnvelope<{ candidates: UserCandidate[] }>;
        if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.assignments.userSearchError")));
        if (!controller.signal.aborted) { setCandidates(body.data.candidates); setAttempted(true); }
      } catch (caught) {
        if (!controller.signal.aborted) { setCandidates([]); setError(caught instanceof Error ? caught.message : t("accessControl.assignments.userSearchError")); }
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { clearTimeout(timeoutId); controller.abort(); };
  }, [query, selected, t]);

  return <div className="mt-3 text-sm font-medium">
    <label htmlFor="assignment-user-search">{t("accessControl.assignments.selectUser")}</label>
    {selected ? <div className="mt-1 rounded-xl border border-primary/25 bg-primary/10 p-3">
      <p className="font-medium">{selected.name}</p>
      <p className="text-xs text-muted-foreground">{selected.email}</p>
      <button type="button" className="mt-1 text-xs font-semibold text-primary" onClick={() => { onSelect(null); setQuery(""); setCandidates([]); setAttempted(false); }}>{t("accessControl.assignments.changeUser")}</button>
    </div> : <div className="relative mt-1">
      <input id="assignment-user-search" value={query} onChange={(event) => { setQuery(event.target.value); setCandidates([]); setAttempted(false); setSearching(false); setError(""); }} className={`${adminFilterControlClassName} w-full`} placeholder={t("accessControl.assignments.userSearchPlaceholder")} role="combobox" aria-expanded={candidates.length > 0} aria-autocomplete="list" aria-controls={candidates.length > 0 ? "assignment-user-results" : undefined} />
      {searching && <p className="mt-1 text-xs text-muted-foreground">{t("accessControl.assignments.searchingUsers")}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      {attempted && candidates.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{t("accessControl.assignments.noUsers")}</p>}
      {candidates.length > 0 && <ul id="assignment-user-results" role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl">{candidates.map((candidate) => <li key={candidate.id} role="option" aria-selected={false}><button type="button" className="w-full rounded-lg p-2 text-left text-sm hover:bg-muted/50" onClick={() => { onSelect(candidate); setCandidates([]); }}><span className="block font-medium">{candidate.name}</span><span className="block text-xs text-muted-foreground">{candidate.email}</span></button></li>)}</ul>}
    </div>}
  </div>;
}

function Label({ text, children }: { text: string; children: React.ReactNode }) { return <label className="mt-3 block text-sm font-medium"><span>{text}</span><div className="mt-1">{children}</div></label>; }
function Badge({ value }: { value: string }) { const { t } = useTranslation("admin"); const tone = value === "deny" || value === "revoked" || value === "expired" ? "bg-destructive/10 text-destructive" : value === "scheduled" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" : "bg-primary/10 text-primary"; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{t(`accessControl.${value === "allow" || value === "deny" ? "effects" : "status"}.${value}`)}</span>; }
function State({ text }: { text: string }) { return <div className="px-5 py-12 text-center text-sm text-muted-foreground">{text}</div>; }
function formatDate(value: string) { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value; }
