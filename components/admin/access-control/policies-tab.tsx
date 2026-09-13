"use client";

import { ChevronDown, ChevronLeft, ChevronRight, GitCompare, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildAccessControlQuery, errorMessage } from "@/components/admin/access-control/types";
import type { ApiEnvelope, AuditFocus, MutationReceipt, PageResult, PolicyRequirement, PolicySummary, PolicyVersionSummary } from "@/components/admin/access-control/types";
import { getMalaysiaDateTimeLocalValue } from "@/lib/datetime/date-input";

const PAGE_SIZE = 25;
const STATUSES = ["", "draft", "pending_approval", "scheduled", "active", "retired"];
const FACTS = ["email_verified", "phone_verified", "profile_complete", "kyc_status", "account_status", "role", "plan", "partner"];
const OPERATORS = ["eq", "not_eq", "contains"];

type RequirementDraft = { id: string; alternativeGroup: number; factKey: string; operator: string; expectedValue: string };
type VersionForm = { effect: "allow" | "deny"; effectiveFrom: string; effectiveUntil: string; reason: string; requirements: RequirementDraft[] };
type PendingAction = { type: "approve" | "activate" | "rollback"; version: PolicyVersionSummary; reason: string };

function newRequirement(index: number): RequirementDraft { return { id: `${Date.now()}-${index}`, alternativeGroup: 1, factKey: "email_verified", operator: "eq", expectedValue: "true" }; }
function initialForm(): VersionForm { return { effect: "allow", effectiveFrom: getMalaysiaDateTimeLocalValue(), effectiveUntil: "", reason: "", requirements: [newRequirement(0)] }; }
function toOffsetTimestamp(value: string) { return value ? new Date(value).toISOString() : null; }
function requirementValue(requirement: RequirementDraft): boolean | string {
  if (["email_verified", "phone_verified", "profile_complete"].includes(requirement.factKey)) return requirement.expectedValue === "true";
  return requirement.expectedValue.trim();
}

export function PoliciesTab({ focusId, onViewAudit }: { focusId: string | null; onViewAudit: (focus: AuditFocus) => void }) {
  const { t } = useTranslation("admin");
  const [result, setResult] = useState<PageResult<PolicySummary>>({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [selected, setSelected] = useState<PolicySummary | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [versions, setVersions] = useState<PolicyVersionSummary[]>([]); const [versionsLoading, setVersionsLoading] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]); const [showCreate, setShowCreate] = useState(false); const [form, setForm] = useState<VersionForm>(initialForm);
  const [pending, setPending] = useState<PendingAction | null>(null); const [policyConfirmOpen, setPolicyConfirmOpen] = useState(false); const [saving, setSaving] = useState(false); const [receipt, setReceipt] = useState<MutationReceipt | null>(null);
  const confirmationTransitionRef = useRef(false);

  const query = useMemo(() => buildAccessControlQuery({ page, pageSize: PAGE_SIZE, search, status }), [page, search, status]);
  const loadPolicies = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/access-control/policies?${query}`, { cache: "no-store" });
      const body = await response.json() as ApiEnvelope<PageResult<PolicySummary>>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.loadPolicies")));
      setResult(body.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.errors.loadPolicies")); }
    finally { setLoading(false); }
  }, [query, t]);

  const loadVersions = useCallback(async (policy: PolicySummary) => {
    setVersionsLoading(true); setError(""); setCompareIds([]);
    try {
      const response = await fetch(`/api/admin/access-control/policies/${policy.id}/versions`, { cache: "no-store" });
      const body = await response.json() as ApiEnvelope<{ items: PolicyVersionSummary[] }>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.loadVersions")));
      setVersions(body.data.items);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.errors.loadVersions")); }
    finally { setVersionsLoading(false); }
  }, [t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadPolicies(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [loadPolicies]);
  useEffect(() => {
    const timeoutId = setTimeout(() => setPage(1), 0);
    return () => clearTimeout(timeoutId);
  }, [search, status]);
  useEffect(() => {
    if (!focusId || selected) return;
    const policy = result.items.find((item) => item.id === focusId || item.latestVersion?.id === focusId);
    if (!policy) return;
    const timeoutId = setTimeout(() => {
      setSelected(policy);
      setDetailsOpen(true);
      void loadVersions(policy);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [focusId, loadVersions, result.items, selected]);

  async function createVersion() {
    if (!selected || form.reason.trim().length < 10) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/access-control/policies/${selected.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ effect: form.effect, effectiveFrom: toOffsetTimestamp(form.effectiveFrom), effectiveUntil: toOffsetTimestamp(form.effectiveUntil), reason: form.reason.trim(), requirements: form.requirements.map((requirement) => ({ alternativeGroup: requirement.alternativeGroup, factKey: requirement.factKey, operator: requirement.operator, expectedValue: requirementValue(requirement) })) }) });
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.createVersion")));
      setReceipt(body.data); setShowCreate(false); setForm(initialForm()); await Promise.all([loadVersions(selected), loadPolicies()]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.errors.createVersion")); }
    finally { setSaving(false); }
  }

  async function executeAction() {
    if (!selected || !pending || pending.reason.trim().length < 10) return;
    setSaving(true); setError("");
    try {
      const path = pending.type === "rollback"
        ? `/api/admin/access-control/policies/${selected.id}/rollback`
        : pending.type === "approve"
          ? `/api/admin/access-control/policies/versions/${pending.version.id}/approve`
          : `/api/admin/access-control/policies/versions/${pending.version.id}/activate`;
      const payload = pending.type === "rollback" ? { targetVersion: pending.version.version, reason: pending.reason.trim() } : { reason: pending.reason.trim() };
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.policyAction")));
      confirmationTransitionRef.current = false;
      setReceipt(body.data); setPending(null); setPolicyConfirmOpen(false);
      await Promise.all([loadVersions(selected), loadPolicies()]);
      resetPolicyDetails();
    } catch (caught) {
      confirmationTransitionRef.current = false;
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.policyAction")); setPolicyConfirmOpen(false); setDetailsOpen(true);
    }
    finally { setSaving(false); }
  }

  function openPolicy(policy: PolicySummary) {
    confirmationTransitionRef.current = false;
    setSelected(policy); setReceipt(null); setVersions([]); setCompareIds([]); setShowCreate(false); setForm(initialForm()); setPending(null); setPolicyConfirmOpen(false); setDetailsOpen(true);
    void loadVersions(policy);
  }

  function resetPolicyDetails() {
    confirmationTransitionRef.current = false;
    setDetailsOpen(false); setSelected(null); setVersions([]); setCompareIds([]); setShowCreate(false); setForm(initialForm()); setPending(null); setPolicyConfirmOpen(false);
  }

  const compareVersions = compareIds.map((id) => versions.find((version) => version.id === id)).filter(Boolean) as PolicyVersionSummary[];

  return <div className="space-y-4">
    <AdminFilterBar><label className="min-w-[220px] flex-1"><span className="sr-only">{t("accessControl.filters.searchPolicies")}</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("accessControl.filters.searchPolicies")} className={`${adminFilterControlClassName} w-full pl-9`} /></div></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={t("accessControl.filters.policyStatus")} className={adminFilterControlClassName}>{STATUSES.map((value) => <option key={value || "all"} value={value}>{value ? t(`accessControl.status.${value}`) : t("accessControl.filters.allStatuses")}</option>)}</select><Button variant="outline" size="sm" onClick={() => void loadPolicies()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> {t("accessControl.actions.refresh")}</Button></AdminFilterBar>
    {receipt && !detailsOpen && <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span>{t("accessControl.feedback.policyUpdated")}</span><Button size="sm" variant="outline" onClick={() => onViewAudit({ eventId: receipt.auditEventId, entityId: receipt.policyVersionId ?? receipt.policyId })}>{t("accessControl.actions.viewAuditEvent")}</Button></div>}
    {error && !detailsOpen && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">{t("accessControl.policies.name")}</th><th>{t("accessControl.policies.capability")}</th><th>{t("accessControl.policies.scope")}</th><th>{t("accessControl.policies.latest")}</th><th>{t("accessControl.policies.versions")}</th><th className="px-5 text-right">{t("accessControl.policies.actions")}</th></tr></thead><tbody className="divide-y divide-border">{result.items.map((policy) => <tr key={policy.id} className={focusId === policy.id ? "bg-primary/10" : "hover:bg-muted/30"}><td className="px-5 py-4"><p className="font-semibold text-foreground">{policy.name}</p><p className="font-mono text-xs text-muted-foreground">{policy.key}</p></td><td className="font-mono text-xs">{policy.capabilityKey}</td><td>{policy.scope}</td><td>{policy.latestVersion ? <PolicyStatus version={policy.latestVersion} /> : t("accessControl.states.none")}</td><td>{policy.versionCount}</td><td className="px-5 text-right"><Button size="sm" variant="outline" onClick={() => openPolicy(policy)}><ChevronDown /> {t("accessControl.actions.open")}</Button></td></tr>)}</tbody></table></div>{loading && result.items.length === 0 ? <State text={t("accessControl.states.loading")} /> : result.items.length === 0 ? <State text={t("accessControl.states.noPolicies")} /> : <Pager page={result.page} totalPages={result.totalPages} loading={loading} setPage={setPage} />}</section>

    <Dialog open={detailsOpen && Boolean(selected)} onOpenChange={(open) => { setDetailsOpen(open); if (!open && !confirmationTransitionRef.current) resetPolicyDetails(); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-5xl">
        {selected && <>
          <DialogHeader>
            <DialogTitle>{selected.name}</DialogTitle>
            <DialogDescription><span className="font-mono">{selected.capabilityKey}</span></DialogDescription>
          </DialogHeader>
          {receipt && <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span>{t("accessControl.feedback.policyUpdated")}</span><Button size="sm" variant="outline" onClick={() => onViewAudit({ eventId: receipt.auditEventId, entityId: receipt.policyVersionId ?? receipt.policyId })}>{t("accessControl.actions.viewAuditEvent")}</Button></div>}
          {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          <div className="flex justify-end"><Button size="sm" onClick={() => { setShowCreate((value) => !value); setForm(initialForm()); }}><Plus /> {t("accessControl.actions.newVersion")}</Button></div>
          {showCreate && <VersionEditor form={form} setForm={setForm} saving={saving} onSave={() => void createVersion()} />}
          <div><div className="flex items-center justify-between"><h3 className="font-semibold text-foreground">{t("accessControl.policies.versionHistory")}</h3><span className="text-xs text-muted-foreground">{t("accessControl.policies.compareHint")}</span></div>{versionsLoading ? <State text={t("accessControl.states.loading")} /> : versions.length === 0 ? <State text={t("accessControl.states.noVersions")} /> : <div className="mt-3 space-y-2">{versions.map((version) => <VersionRow key={version.id} version={version} compared={compareIds.includes(version.id)} onCompare={() => setCompareIds((current) => current.includes(version.id) ? current.filter((id) => id !== version.id) : current.length < 2 ? [...current, version.id] : [current[1], version.id])} onAction={(type) => { setPolicyConfirmOpen(false); setPending({ type, version, reason: "" }); }} />)}</div>}</div>
          {compareVersions.length === 2 && <div className="rounded-xl border border-border bg-muted/20 p-4"><h3 className="flex items-center gap-2 font-semibold"><GitCompare /> {t("accessControl.policies.comparison")}</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{compareVersions.map((version) => <VersionDetail key={version.id} version={version} />)}</div></div>}
          {pending && <div className="rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">{t(`accessControl.policyActions.${pending.type}`)}</h3><p className="mt-1 text-sm text-muted-foreground">{t("accessControl.policies.actionReason")}</p><textarea value={pending.reason} onChange={(event) => setPending({ ...pending, reason: event.target.value })} maxLength={2000} className="mt-3 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /><div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => { setPending(null); setPolicyConfirmOpen(false); }}>{t("accessControl.actions.cancel")}</Button><Button onClick={() => { confirmationTransitionRef.current = true; setDetailsOpen(false); setPolicyConfirmOpen(true); }} disabled={pending.reason.trim().length < 10}>{t("accessControl.actions.reviewChange")}</Button></div></div>}
        </>}
      </DialogContent>
    </Dialog>
    <AdminConfirmDialog open={policyConfirmOpen} title={`accessControl.confirm.${pending?.type ?? "approve"}Title`} description={`accessControl.confirm.${pending?.type ?? "approve"}Description`} confirmLabel="accessControl.confirm.confirm" busy={saving} onCancel={() => { confirmationTransitionRef.current = false; setPolicyConfirmOpen(false); if (selected && pending) setDetailsOpen(true); }} onConfirm={() => void executeAction()} />
  </div>;
}

function VersionEditor({ form, setForm, saving, onSave }: { form: VersionForm; setForm: React.Dispatch<React.SetStateAction<VersionForm>>; saving: boolean; onSave: () => void }) { const { t } = useTranslation("admin"); return <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4"><h3 className="font-semibold">{t("accessControl.policies.createTitle")}</h3><div className="mt-4 grid gap-3 md:grid-cols-3"><label className="text-sm font-medium">{t("accessControl.policies.effect")}<select value={form.effect} onChange={(event) => setForm({ ...form, effect: event.target.value as "allow" | "deny" })} className={`${adminFilterControlClassName} mt-1 w-full`}><option value="allow">{t("accessControl.effects.allow")}</option><option value="deny">{t("accessControl.effects.deny")}</option></select></label><label className="text-sm font-medium">{t("accessControl.policies.effectiveFrom")}<input type="datetime-local" value={form.effectiveFrom} onChange={(event) => setForm({ ...form, effectiveFrom: event.target.value })} className={`${adminFilterControlClassName} mt-1 w-full`} /></label><label className="text-sm font-medium">{t("accessControl.policies.effectiveUntil")}<input type="datetime-local" value={form.effectiveUntil} onChange={(event) => setForm({ ...form, effectiveUntil: event.target.value })} className={`${adminFilterControlClassName} mt-1 w-full`} /></label></div><div className="mt-4 flex items-center justify-between"><div><h4 className="text-sm font-semibold">{t("accessControl.policies.requirements")}</h4><p className="text-xs text-muted-foreground">{t("accessControl.policies.groupsHelp")}</p></div><Button size="sm" variant="outline" onClick={() => setForm((current) => ({ ...current, requirements: [...current.requirements, newRequirement(current.requirements.length)] }))}><Plus /> {t("accessControl.actions.addRequirement")}</Button></div><div className="mt-3 space-y-2">{form.requirements.map((requirement, index) => <div key={requirement.id} className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-[90px_1fr_130px_1fr_auto]"><input type="number" min={1} aria-label={t("accessControl.policies.group")} value={requirement.alternativeGroup} onChange={(event) => updateRequirement(setForm, index, { alternativeGroup: Math.max(1, Number(event.target.value)) })} className={adminFilterControlClassName} /><select aria-label={t("accessControl.policies.fact")} value={requirement.factKey} onChange={(event) => updateRequirement(setForm, index, { factKey: event.target.value, operator: event.target.value === "role" || event.target.value === "plan" || event.target.value === "partner" ? "contains" : "eq", expectedValue: event.target.value.includes("verified") || event.target.value === "profile_complete" ? "true" : "" })} className={adminFilterControlClassName}>{FACTS.map((fact) => <option key={fact} value={fact}>{t(`accessControl.facts.${fact}`)}</option>)}</select><select aria-label={t("accessControl.policies.operator")} value={requirement.operator} onChange={(event) => updateRequirement(setForm, index, { operator: event.target.value })} className={adminFilterControlClassName}>{OPERATORS.map((operator) => <option key={operator} value={operator}>{t(`accessControl.operators.${operator}`)}</option>)}</select>{["email_verified", "phone_verified", "profile_complete"].includes(requirement.factKey) ? <select aria-label={t("accessControl.policies.value")} value={requirement.expectedValue} onChange={(event) => updateRequirement(setForm, index, { expectedValue: event.target.value })} className={adminFilterControlClassName}><option value="true">{t("accessControl.common.true")}</option><option value="false">{t("accessControl.common.false")}</option></select> : <input aria-label={t("accessControl.policies.value")} value={requirement.expectedValue} onChange={(event) => updateRequirement(setForm, index, { expectedValue: event.target.value })} className={adminFilterControlClassName} />}<Button size="icon" variant="ghost" aria-label={t("accessControl.actions.removeRequirement")} disabled={form.requirements.length === 1} onClick={() => setForm((current) => ({ ...current, requirements: current.requirements.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 /></Button></div>)}</div><div className="mt-4 rounded-xl bg-secondary p-3 text-sm"><strong>{t("accessControl.policies.impactPreview")}</strong><p className="mt-1 text-muted-foreground">{t("accessControl.policies.impactSummary", { groups: new Set(form.requirements.map((item) => item.alternativeGroup)).size, requirements: form.requirements.length, effect: t(`accessControl.effects.${form.effect}`) })}</p></div><label className="mt-4 block text-sm font-medium">{t("accessControl.forms.reason")}<textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={2000} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /></label><div className="mt-3 flex justify-end"><Button disabled={saving || form.reason.trim().length < 10 || form.requirements.some((item) => !item.expectedValue.trim())} onClick={onSave}><ShieldCheck /> {t("accessControl.actions.createVersion")}</Button></div></div>; }
function updateRequirement(setForm: React.Dispatch<React.SetStateAction<VersionForm>>, index: number, patch: Partial<RequirementDraft>) { setForm((current) => ({ ...current, requirements: current.requirements.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })); }
function VersionRow({ version, compared, onCompare, onAction }: { version: PolicyVersionSummary; compared: boolean; onCompare: () => void; onAction: (type: PendingAction["type"]) => void }) { const { t } = useTranslation("admin"); return <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={compared} onChange={onCompare} /> {t("accessControl.policies.compare")}</label><PolicyStatus version={version} /><span className="font-semibold">v{version.version}</span><span className="text-xs text-muted-foreground">{version.requirements?.length ?? 0} {t("accessControl.policies.requirementCount")}</span><div className="ml-auto flex flex-wrap gap-2">{version.status === "pending_approval" && <Button size="sm" variant="outline" onClick={() => onAction("approve")}>{t("accessControl.policyActions.approve")}</Button>}{version.status === "scheduled" && <Button size="sm" onClick={() => onAction("activate")}>{t("accessControl.policyActions.activate")}</Button>}{["active", "retired"].includes(version.status) && <Button size="sm" variant="outline" onClick={() => onAction("rollback")}>{t("accessControl.policyActions.rollback")}</Button>}</div></div>; }
function PolicyStatus({ version }: { version: PolicyVersionSummary }) { const { t } = useTranslation("admin"); return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${version.status === "active" ? "bg-primary/10 text-primary" : version.status === "pending_approval" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{t(`accessControl.status.${version.status}`)}</span>; }
function VersionDetail({ version }: { version: PolicyVersionSummary }) { const { t } = useTranslation("admin"); return <div className="rounded-xl border border-border bg-card p-3"><div className="flex justify-between"><strong>v{version.version}</strong><PolicyStatus version={version} /></div><p className="mt-2 text-xs text-muted-foreground">{t(`accessControl.effects.${version.effect}`)}</p><div className="mt-3 space-y-1">{(version.requirements ?? []).map((item: PolicyRequirement, index) => <p key={index} className="rounded-lg bg-muted/50 px-2 py-1 font-mono text-xs">G{item.alternativeGroup ?? item.alternative_group}: {item.factKey ?? item.fact_key} {item.operator} {JSON.stringify(item.expectedValue ?? item.expected_value)}</p>)}</div></div>; }
function State({ text }: { text: string }) { return <div className="px-5 py-12 text-center text-sm text-muted-foreground">{text}</div>; }
function Pager({ page, totalPages, loading, setPage }: { page: number; totalPages: number; loading: boolean; setPage: React.Dispatch<React.SetStateAction<number>> }) { const { t } = useTranslation("admin"); return <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{t("accessControl.pagination.pageOf", { page, total: Math.max(totalPages, 1) })}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><Button size="sm" variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>; }
