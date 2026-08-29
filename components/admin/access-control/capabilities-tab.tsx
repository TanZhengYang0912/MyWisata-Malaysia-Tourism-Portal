"use client";

import { ChevronLeft, ChevronRight, Edit3, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { Button } from "@/components/ui/button";
import { buildAccessControlQuery, errorMessage } from "@/components/admin/access-control/types";
import type { ApiEnvelope, AuditFocus, CapabilityRecord, MutationReceipt, PageResult } from "@/components/admin/access-control/types";

const PAGE_SIZE = 25;
const CATEGORIES = ["", "platform", "commerce", "ai", "recommendation", "affiliate", "wallet"];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

type EditState = CapabilityRecord & { reason: string };

export function CapabilitiesTab({ focusId, onViewAudit }: { focusId: string | null; onViewAudit: (focus: AuditFocus) => void }) {
  const { t } = useTranslation("admin");
  const [result, setResult] = useState<PageResult<CapabilityRecord>>({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [enabled, setEnabled] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<MutationReceipt | null>(null);

  const query = useMemo(() => buildAccessControlQuery({ page, pageSize: PAGE_SIZE, search, category, enabled }), [category, enabled, page, search]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/access-control/capabilities?${query}`, { cache: "no-store" });
      const body = await response.json() as ApiEnvelope<PageResult<CapabilityRecord>>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.loadCapabilities")));
      setResult(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.loadCapabilities"));
    } finally { setLoading(false); }
  }, [query, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);
  useEffect(() => {
    const timeoutId = setTimeout(() => setPage(1), 0);
    return () => clearTimeout(timeoutId);
  }, [category, enabled, search]);

  async function save() {
    if (!edit || edit.reason.trim().length < 10) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/access-control/capabilities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: edit.key,
          category: edit.category,
          riskLevel: edit.riskLevel,
          customerVisible: edit.customerVisible,
          manuallyAssignable: edit.manuallyAssignable,
          enabled: edit.enabled,
          reason: edit.reason.trim(),
        }),
      });
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.saveCapability")));
      setReceipt(body.data); setEdit(null); setConfirmOpen(false); await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.saveCapability"));
      setConfirmOpen(false);
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <AdminFilterBar>
        <label className="min-w-[220px] flex-1"><span className="sr-only">{t("accessControl.filters.searchCapabilities")}</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("accessControl.filters.searchCapabilities")} className={`${adminFilterControlClassName} w-full pl-9`} /></div></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t("accessControl.filters.category")} className={adminFilterControlClassName}>{CATEGORIES.map((value) => <option key={value || "all"} value={value}>{value ? t(`accessControl.categories.${value}`) : t("accessControl.filters.allCategories")}</option>)}</select>
        <AdminSegmentedFilter fullWidth={false} value={enabled} onChange={setEnabled} ariaLabel="accessControl.accessibility.capabilityStatus" items={[{ value: "", label: t("accessControl.filters.all") }, { value: "true", label: t("accessControl.status.enabled") }, { value: "false", label: t("accessControl.status.disabled") }]} />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> {t("accessControl.actions.refresh")}</Button>
      </AdminFilterBar>

      {receipt && <SuccessReceipt text={t("accessControl.feedback.capabilityUpdated")} onClick={() => onViewAudit({ eventId: receipt.auditEventId, entityId: receipt.capabilityId })} />}
      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">{t("accessControl.capabilities.key")}</th><th>{t("accessControl.capabilities.category")}</th><th>{t("accessControl.capabilities.risk")}</th><th>{t("accessControl.capabilities.visibility")}</th><th>{t("accessControl.capabilities.assignment")}</th><th>{t("accessControl.capabilities.status")}</th><th className="px-5 text-right">{t("accessControl.capabilities.actions")}</th></tr></thead>
            <tbody className="divide-y divide-border">
              {result.items.map((item) => <tr key={item.key} className={focusId === item.key ? "bg-primary/10" : "hover:bg-muted/30"}><td className="px-5 py-4 font-mono text-xs font-semibold text-foreground">{item.key}</td><td>{t(`accessControl.categories.${item.category}`)}</td><td><ToneBadge value={item.riskLevel} label={t(`accessControl.risk.${item.riskLevel}`)} /></td><td>{item.customerVisible ? t("accessControl.common.yes") : t("accessControl.common.no")}</td><td>{item.manuallyAssignable ? t("accessControl.common.allowed") : t("accessControl.common.locked")}</td><td><ToneBadge value={item.enabled ? "enabled" : "disabled"} label={t(`accessControl.status.${item.enabled ? "enabled" : "disabled"}`)} /></td><td className="px-5 text-right"><Button size="sm" variant="outline" onClick={() => { setReceipt(null); setEdit({ ...item, reason: "" }); }}><Edit3 /> {t("accessControl.actions.manage")}</Button></td></tr>)}
            </tbody>
          </table>
        </div>
        {loading && result.items.length === 0 ? <StateRow text={t("accessControl.states.loading")} /> : result.items.length === 0 ? <StateRow text={t("accessControl.states.noCapabilities")} /> : <Pagination page={result.page} totalPages={result.totalPages} loading={loading} setPage={setPage} />}
      </section>

      {edit && <section className="rounded-2xl border border-primary/25 bg-card p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-foreground">{t("accessControl.capabilities.editTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("accessControl.capabilities.immutableKey")}</p></div><Button variant="ghost" onClick={() => setEdit(null)}>{t("accessControl.actions.close")}</Button></div><div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label={t("accessControl.capabilities.key")}><input disabled value={edit.key} className={`${adminFilterControlClassName} w-full disabled:cursor-not-allowed disabled:opacity-60`} /></Field><Field label={t("accessControl.capabilities.category")}><select value={edit.category} onChange={(event) => setEdit({ ...edit, category: event.target.value })} className={`${adminFilterControlClassName} w-full`}>{CATEGORIES.filter(Boolean).map((value) => <option key={value} value={value}>{t(`accessControl.categories.${value}`)}</option>)}</select></Field><Field label={t("accessControl.capabilities.risk")}><select value={edit.riskLevel} onChange={(event) => setEdit({ ...edit, riskLevel: event.target.value })} className={`${adminFilterControlClassName} w-full`}>{RISK_LEVELS.map((value) => <option key={value} value={value}>{t(`accessControl.risk.${value}`)}</option>)}</select></Field><Toggle label={t("accessControl.capabilities.customerVisible")} checked={edit.customerVisible} onChange={(checked) => setEdit({ ...edit, customerVisible: checked })} /><Toggle label={t("accessControl.capabilities.manuallyAssignable")} checked={edit.manuallyAssignable} onChange={(checked) => setEdit({ ...edit, manuallyAssignable: checked })} /><Toggle label={t("accessControl.capabilities.enabled")} checked={edit.enabled} onChange={(checked) => setEdit({ ...edit, enabled: checked })} /></div><Field label={t("accessControl.forms.reason")}><textarea value={edit.reason} onChange={(event) => setEdit({ ...edit, reason: event.target.value })} maxLength={2000} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /></Field><div className="mt-4 flex justify-end"><Button onClick={() => setConfirmOpen(true)} disabled={edit.reason.trim().length < 10}><ShieldCheck /> {t("accessControl.actions.reviewChange")}</Button></div></section>}

      <AdminConfirmDialog open={confirmOpen} title={t("accessControl.confirm.capabilityTitle")} description={t("accessControl.confirm.capabilityDescription")} confirmLabel="accessControl.confirm.save" busy={saving} onCancel={() => setConfirmOpen(false)} onConfirm={() => void save()} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-medium text-foreground"><span>{label}</span><div className="mt-1">{children}</div></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 text-sm font-medium"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-primary" /></label>; }
function ToneBadge({ value, label }: { value: string; label: string }) { const tone = value === "critical" || value === "disabled" ? "bg-destructive/10 text-destructive" : value === "high" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" : "bg-primary/10 text-primary"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>; }
function StateRow({ text }: { text: string }) { return <div className="border-t border-border px-5 py-12 text-center text-sm text-muted-foreground">{text}</div>; }
function SuccessReceipt({ text, onClick }: { text: string; onClick: () => void }) { const { t } = useTranslation("admin"); return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span>{text}</span><Button size="sm" variant="outline" onClick={onClick}>{t("accessControl.actions.viewAuditEvent")}</Button></div>; }
function Pagination({ page, totalPages, loading, setPage }: { page: number; totalPages: number; loading: boolean; setPage: React.Dispatch<React.SetStateAction<number>> }) { const { t } = useTranslation("admin"); return <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{t("accessControl.pagination.pageOf", { page, total: Math.max(totalPages, 1) })}</span><div className="flex gap-2"><Button size="sm" variant="outline" aria-label={t("accessControl.accessibility.previousPage")} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><Button size="sm" variant="outline" aria-label={t("accessControl.accessibility.nextPage")} disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>; }
