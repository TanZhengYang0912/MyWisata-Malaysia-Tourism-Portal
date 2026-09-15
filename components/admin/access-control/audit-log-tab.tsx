"use client";

import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import {
  auditActionSummaryKey,
  deriveAuditChanges,
  hasTechnicalAuditPayload,
  type AuditPrimitive,
} from "@/components/admin/access-control/audit-log-presentation";
import { buildAccessControlQuery, errorMessage, focusTargetForAuditEvent } from "@/components/admin/access-control/types";
import type { ApiEnvelope, AuditFocus, AuditRecord, EntityFocus, PageResult } from "@/components/admin/access-control/types";
import { getMalaysiaDateRangeDefaults } from "@/lib/datetime/date-input";

const PAGE_SIZE = 25;
const CAPABILITIES = ["", "platform.browse", "commerce.booking", "commerce.purchase", "commerce.checkout", "ai.basic_recommendation", "recommendation.submit", "affiliate.limited", "affiliate.full", "affiliate.earn_commission", "wallet.request_withdrawal", "wallet.approve_withdrawal"];

export function AuditLogTab({ focus, onViewEntity }: { focus: AuditFocus | null; onViewEntity: (focus: EntityFocus) => void }) {
  const { t } = useTranslation("admin");
  const [result, setResult] = useState<PageResult<AuditRecord>>({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [actorId, setActorId] = useState(""); const [actionPrefix, setActionPrefix] = useState(""); const [entityType, setEntityType] = useState(""); const [capabilityKey, setCapabilityKey] = useState(""); const [traceReference, setTraceReference] = useState(""); const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState(""); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [expanded, setExpanded] = useState<string | null>(null);

  function primeDateRange() {
    const defaults = getMalaysiaDateRangeDefaults();
    setDateFrom((value) => value || defaults.from);
    setDateTo((value) => value || defaults.to);
  }

  const query = useMemo(() => buildAccessControlQuery({ page, pageSize: PAGE_SIZE, actorId, actionPrefix, entityType, capabilityKey, traceReference, entityId: focus?.entityId, dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : "", dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : "" }), [actionPrefix, actorId, capabilityKey, dateFrom, dateTo, entityType, focus?.entityId, page, traceReference]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/access-control/audit-log?${query}`, { cache: "no-store" });
      const body = await response.json() as ApiEnvelope<PageResult<AuditRecord>>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.loadAudit")));
      setResult(body.data);
      if (focus?.eventId && body.data.items.some((item) => item.id === focus.eventId)) setExpanded(focus.eventId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.errors.loadAudit")); }
    finally { setLoading(false); }
  }, [focus, query, t]);
  useEffect(() => {
    const timeoutId = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);
  useEffect(() => {
    const timeoutId = setTimeout(() => setPage(1), 0);
    return () => clearTimeout(timeoutId);
  }, [actionPrefix, actorId, capabilityKey, dateFrom, dateTo, entityType, focus?.entityId, traceReference]);

  return <div className="space-y-4">
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"><strong className="text-foreground">{t("accessControl.audit.readOnlyTitle")}</strong> {t("accessControl.audit.readOnlyDescription")}</div>
    <AdminFilterBar><label className="min-w-[220px] flex-1"><span className="sr-only">{t("accessControl.filters.actionPrefix")}</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={actionPrefix} onChange={(event) => setActionPrefix(event.target.value)} placeholder={t("accessControl.filters.actionPrefix")} className={`${adminFilterControlClassName} w-full pl-9`} /></div></label><input value={actorId} onChange={(event) => setActorId(event.target.value)} placeholder={t("accessControl.filters.actorId")} aria-label={t("accessControl.filters.actorId")} className={adminFilterControlClassName} /><input value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder={t("accessControl.filters.entityType")} aria-label={t("accessControl.filters.entityType")} className={adminFilterControlClassName} /><select value={capabilityKey} onChange={(event) => setCapabilityKey(event.target.value)} aria-label={t("accessControl.filters.capability")} className={adminFilterControlClassName}>{CAPABILITIES.map((value) => <option key={value || "all"} value={value}>{value || t("accessControl.filters.allCapabilities")}</option>)}</select><input value={traceReference} onChange={(event) => setTraceReference(event.target.value)} placeholder={t("accessControl.filters.traceReference")} aria-label={t("accessControl.filters.traceReference")} className={adminFilterControlClassName} /><label className="text-xs text-muted-foreground">{t("accessControl.filters.dateFrom")}<input type="date" value={dateFrom} onFocus={primeDateRange} onChange={(event) => setDateFrom(event.target.value)} className={`${adminFilterControlClassName} ml-2`} /></label><label className="text-xs text-muted-foreground">{t("accessControl.filters.dateTo")}<input type="date" value={dateTo} onFocus={primeDateRange} onChange={(event) => setDateTo(event.target.value)} className={`${adminFilterControlClassName} ml-2`} /></label><Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> {t("accessControl.actions.refresh")}</Button></AdminFilterBar>
    {focus && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span>{t("accessControl.audit.focusedEvent", { id: focus.eventId })}</span>{!result.items.some((item) => item.id === focus.eventId) && !loading && <span className="text-xs">{t("accessControl.audit.focusNotOnPage")}</span>}</div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 whitespace-nowrap">{t("accessControl.audit.when")}</th><th className="px-4 py-3 whitespace-nowrap">{t("accessControl.audit.actor")}</th><th className="px-4 py-3 whitespace-nowrap">{t("accessControl.audit.action")}</th><th className="px-4 py-3 whitespace-nowrap">{t("accessControl.audit.target")}</th><th className="px-4 py-3 whitespace-nowrap">{t("accessControl.audit.policyVersion")}</th><th className="px-4 py-3 whitespace-nowrap">{t("accessControl.audit.trace")}</th><th className="px-4 py-3 whitespace-nowrap text-right">{t("accessControl.audit.details")}</th></tr></thead><tbody className="divide-y divide-border">{result.items.map((item) => { const target = focusTargetForAuditEvent(item.entityType, item.entityId); const policyVersion = field(item.after, "policyVersionId") ?? field(item.before, "policyVersionId"); const trace = field(item.after, "traceReference") ?? field(item.before, "traceReference"); return <AuditRow key={item.id} item={item} selected={focus?.eventId === item.id} expanded={expanded === item.id} policyVersion={policyVersion} trace={trace} target={target} onExpand={() => setExpanded((value) => value === item.id ? null : item.id)} onViewEntity={() => target && onViewEntity(target)} />; })}</tbody></table></div>{loading && result.items.length === 0 ? <State text={t("accessControl.states.loading")} /> : result.items.length === 0 ? <State text={t("accessControl.states.noAuditEvents")} /> : <Pager page={result.page} totalPages={result.totalPages} loading={loading} setPage={setPage} />}</section>
  </div>;
}

function AuditRow({ item, selected, expanded, policyVersion, trace, target, onExpand, onViewEntity }: { item: AuditRecord; selected: boolean; expanded: boolean; policyVersion: string | null; trace: string | null; target: EntityFocus | null; onExpand: () => void; onViewEntity: () => void }) {
  const { t } = useTranslation("admin");
  const actionSummary = t(`accessControl.audit.actionSummaries.${auditActionSummaryKey(item.action)}`);

  return <>
    <tr className={selected ? "bg-primary/10" : "hover:bg-muted/30"}>
      <td className="px-4 py-4 align-top whitespace-nowrap text-xs">{formatDate(item.createdAt)}</td>
      <td className="px-4 py-4 align-top max-w-40 truncate font-mono text-xs">{item.actorId ?? t("accessControl.audit.systemActor")}</td>
      <td className="px-4 py-4 align-top min-w-56">
        <p className="text-sm font-semibold text-foreground">{actionSummary}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.action}</p>
        {item.reason && <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">{item.reason}</p>}
      </td>
      <td className="px-4 py-4 align-top min-w-48"><p className="text-xs">{item.entityType}</p><p className="max-w-40 truncate font-mono text-xs text-muted-foreground">{item.entityId ?? t("accessControl.states.none")}</p>{target && <button type="button" onClick={onViewEntity} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{t("accessControl.actions.openTarget")}<ArrowUpRight className="h-3 w-3" /></button>}</td>
      <td className="px-4 py-4 align-top whitespace-nowrap font-mono text-xs">{policyVersion ?? "—"}</td>
      <td className="px-4 py-4 align-top whitespace-nowrap font-mono text-xs">{trace ?? "—"}</td>
      <td className="px-4 py-4 align-top whitespace-nowrap text-right"><Button size="sm" variant="outline" onClick={onExpand}>{expanded ? t("accessControl.actions.hide") : t("accessControl.actions.inspect")}</Button></td>
    </tr>
    {expanded && <tr><td colSpan={7} className="bg-muted/20 px-5 py-4"><div className="space-y-3">
      <AuditChangeSummary before={item.before} after={item.after} />
      {hasTechnicalAuditPayload(item.before, item.after) && <details className="rounded-xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("accessControl.audit.technicalDetails")}</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><AuditPayload title={t("accessControl.audit.before")} value={item.before} /><AuditPayload title={t("accessControl.audit.after")} value={item.after} /></div>
      </details>}
    </div></td></tr>}
  </>;
}

const AUDIT_FIELD_LABELS: Readonly<Record<string, string>> = {
  status: "status",
  submissionId: "submissionId",
  submission_id: "submissionId",
  reasonCode: "reasonCode",
  reason_code: "reasonCode",
  enabled: "enabled",
  effect: "effect",
  riskLevel: "riskLevel",
  risk_level: "riskLevel",
  customerVisible: "customerVisible",
  customer_visible: "customerVisible",
  manuallyAssignable: "manuallyAssignable",
  manually_assignable: "manuallyAssignable",
  generation: "generation",
};

const AUDIT_VALUE_LABELS = new Set([
  "pending", "pending_approval", "approved", "rejected", "info_requested",
  "active", "inactive", "enabled", "disabled", "allow", "deny", "scheduled",
  "revoked", "processing", "failed", "held",
]);

function AuditChangeSummary({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const { t } = useTranslation("admin");
  const changes = deriveAuditChanges(before, after);
  const translate = (key: string) => t(key);
  return <section aria-label={t("accessControl.audit.changeSummary")} className="rounded-xl border border-border bg-card p-3">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("accessControl.audit.changeSummary")}</h4>
    {changes.length === 0
      ? <p className="mt-2 text-xs text-muted-foreground">{t("accessControl.audit.noChangeSummary")}</p>
      : <dl className="mt-2 divide-y divide-border">{changes.map((change) => <div key={change.field} className="grid gap-2 py-2 text-xs sm:grid-cols-[minmax(120px,0.7fr)_minmax(0,1fr)] sm:items-center">
        <dt className="font-medium text-foreground">{auditFieldLabel(translate, change.field)}</dt>
        <dd className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <span className="min-w-0 break-all">{auditValueLabel(translate, change.before)}</span>
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-all font-medium text-foreground">{auditValueLabel(translate, change.after)}</span>
        </dd>
      </div>)}</dl>}
  </section>;
}

function auditFieldLabel(t: (key: string) => string, fieldName: string) {
  const key = AUDIT_FIELD_LABELS[fieldName];
  return key ? t(`accessControl.audit.fieldLabels.${key}`) : fieldName;
}

function auditValueLabel(t: (key: string) => string, value: AuditPrimitive | undefined) {
  if (value === undefined) return t("accessControl.audit.valueLabels.missing");
  if (value === null) return t("accessControl.audit.valueLabels.null");
  if (typeof value === "boolean") return t(`accessControl.audit.valueLabels.${value}`);
  if (typeof value === "string" && AUDIT_VALUE_LABELS.has(value)) return t(`accessControl.audit.valueLabels.${value}`);
  return String(value);
}
function AuditPayload({ title, value }: { title: string; value: Record<string, unknown> | null }) { return <div className="rounded-xl border border-border bg-card p-3"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs text-foreground">{value ? JSON.stringify(value, null, 2) : "—"}</pre></div>; }
function field(value: Record<string, unknown> | null, key: string) { return value && typeof value[key] === "string" ? value[key] as string : null; }
function formatDate(value: string) { const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value; }
function State({ text }: { text: string }) { return <div className="px-5 py-12 text-center text-sm text-muted-foreground">{text}</div>; }
function Pager({ page, totalPages, loading, setPage }: { page: number; totalPages: number; loading: boolean; setPage: React.Dispatch<React.SetStateAction<number>> }) { const { t } = useTranslation("admin"); return <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{t("accessControl.pagination.pageOf", { page, total: Math.max(totalPages, 1) })}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><Button size="sm" variant="outline" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>; }
