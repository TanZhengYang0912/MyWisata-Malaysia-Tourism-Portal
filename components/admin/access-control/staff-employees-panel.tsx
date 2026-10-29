"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, UserMinus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { staffEmployeeAccessSchema, staffEmployeePageSchema, type StaffEmployeeAccess, type StaffEmployeePage } from "@/lib/staff-permissions/employee-access";
import { buildAccessControlQuery, errorMessage, type ApiEnvelope, type MutationReceipt, type StaffPermissionRecord } from "./types";

type Assignment = StaffEmployeeAccess["assignments"][number];
type PendingRevoke = { employeeId: string; employeeName: string; assignment: Assignment; remaining: StaffEmployeeAccess; reason: string };
type Props = { generation: number; permissions: StaffPermissionRecord[]; onMutation: (receipt: MutationReceipt, message: string) => void; onChanged: () => Promise<void> };
const emptyPage: StaffEmployeePage = { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 };

export function StaffEmployeesPanel({ generation, permissions, onMutation, onChanged }: Props) {
  const { t } = useTranslation("admin");
  const [result, setResult] = useState(emptyPage);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [access, setAccess] = useState<StaffEmployeeAccess | null>(null);
  const [pending, setPending] = useState<PendingRevoke | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const query = buildAccessControlQuery({ search, status, page, pageSize });

  const load = useCallback(async () => {
    const id = ++listRequest.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/access-control/staff-employees?${query}`, { cache: "no-store" });
      const body = await response.json() as ApiEnvelope<unknown>;
      const parsed = staffEmployeePageSchema.safeParse(body.data);
      if (!response.ok || !parsed.success) throw new Error(errorMessage(body, t("accessControl.staffEmployees.loadError")));
      if (id === listRequest.current) {
        if (parsed.data.totalPages > 0 && page > parsed.data.totalPages) setPage(parsed.data.totalPages);
        else setResult(parsed.data);
      }
    } catch (caught) {
      if (id === listRequest.current) setError(caught instanceof Error ? caught.message : t("accessControl.staffEmployees.loadError"));
    } finally { if (id === listRequest.current) setLoading(false); }
  }, [page, query, t]);
  const invalidateList = useCallback(() => { listRequest.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); invalidateList(); };
  }, [generation, invalidateList, load]);
  useEffect(() => () => { detailRequest.current++; }, []);

  async function readAccess(userId: string, excludedAssignmentId?: string) {
    const suffix = excludedAssignmentId ? `?excludedAssignmentId=${encodeURIComponent(excludedAssignmentId)}` : "";
    const response = await fetch(`/api/admin/access-control/staff-employees/${userId}${suffix}`, { cache: "no-store" });
    const body = await response.json() as ApiEnvelope<unknown>;
    const parsed = staffEmployeeAccessSchema.safeParse(body.data);
    if (!response.ok || !parsed.success) throw new Error(errorMessage(body, t("accessControl.staffEmployees.loadError")));
    return parsed.data;
  }
  async function viewEmployee(userId: string) {
    const id = ++detailRequest.current;
    setBusy(true); setError(""); setPending(null); setAccess(null); setConfirmOpen(false);
    try {
      const next = await readAccess(userId);
      if (id === detailRequest.current) setAccess(next);
    } catch (caught) {
      if (id === detailRequest.current) setError(caught instanceof Error ? caught.message : t("accessControl.staffEmployees.loadError"));
    } finally { if (id === detailRequest.current) setBusy(false); }
  }
  async function previewRevoke(assignment: Assignment) {
    if (!access || busy) return;
    const employee = access;
    const id = ++detailRequest.current;
    setBusy(true); setError("");
    try {
      const remaining = await readAccess(employee.id, assignment.id);
      if (id === detailRequest.current) setPending({ employeeId: employee.id, employeeName: employee.name, assignment, remaining, reason: "" });
    } catch (caught) {
      if (id === detailRequest.current) setError(caught instanceof Error ? caught.message : t("accessControl.staffEmployees.loadError"));
    } finally { if (id === detailRequest.current) setBusy(false); }
  }
  async function revoke() {
    if (!pending || busy || pending.reason.trim().length < 10) return;
    const operation = pending;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/access-control/staff-roles/${operation.assignment.roleId}/assignments`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: operation.assignment.id, reason: operation.reason.trim() }),
      });
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.staffEmployees.revokeError")));
      onMutation(body.data, t("accessControl.staffEmployees.revoked")); setPending(null); setConfirmOpen(false); setAccess(null);
      setAccess(await readAccess(operation.employeeId));
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.staffEmployees.revokeError"));
      setConfirmOpen(false);
    } finally { setBusy(false); }
  }
  const permissionLabel = (key: string) => permissions.find((permission) => permission.key === key)?.description ?? key;
  function sources(value: StaffEmployeeAccess) {
    const grouped = new Map<string, string[]>();
    for (const source of value.sources) {
      const name = source.sourceType === "assignment" ? source.sourceName : `${t("accessControl.staffEmployees.legacySource")}: ${t(`roles.${source.sourceName}`)}`;
      grouped.set(source.permissionKey, [...(grouped.get(source.permissionKey) ?? []), name]);
    }
    return grouped.size === 0 ? <p>{t("accessControl.staffEmployees.noPermissions")}</p> : <ul className="space-y-2">{[...grouped].map(([key, names]) => <li key={key}><span className="font-medium">{permissionLabel(key)}</span><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{names.map((name, index) => <li key={`${key}-${index}`}>{name}</li>)}</ul></li>)}</ul>;
  }

  return <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
    <h2 className="font-semibold">{t("accessControl.staffEmployees.title")}</h2>
    <p className="text-sm text-muted-foreground">{t("accessControl.staffEmployees.help")}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <AdminFilterBar>
      <input aria-label={t("accessControl.staffEmployees.search")} placeholder={t("accessControl.staffEmployees.search")} value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={adminFilterControlClassName} />
      <select aria-label={t("accessControl.staffEmployees.status")} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={adminFilterControlClassName}><option value="">{t("accessControl.filters.all")}</option>{["active", "suspended", "deleted"].map((value) => <option key={value} value={value}>{t(`accessControl.staffEmployees.statuses.${value}`)}</option>)}</select>
      <select aria-label={t("accessControl.staffEmployees.pageSize")} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className={adminFilterControlClassName}>{[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select>
      <Button size="sm" variant="outline" disabled={loading || busy} onClick={() => { setError(""); void load(); if (access) void viewEmployee(access.id); }}><RefreshCw />{t("accessControl.actions.refresh")}</Button>
    </AdminFilterBar>
    <p className="text-xs text-muted-foreground">{t("accessControl.staffEmployees.total", { count: result.total })}</p>
    <ul className="divide-y divide-border">{result.items.map((employee) => <li key={employee.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{employee.name}</p><p className="text-xs text-muted-foreground">{employee.email}</p><p className="text-xs text-muted-foreground">{t(`accessControl.staffEmployees.statuses.${employee.status}`)}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => void viewEmployee(employee.id)}>{t("accessControl.staffEmployees.viewAccess")}</Button></li>)}</ul>
    {!loading && result.items.length === 0 && <p className="text-sm text-muted-foreground">{t("accessControl.staffEmployees.empty")}</p>}
    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{t("accessControl.pagination.pageOf", { page: result.page, total: Math.max(1, result.totalPages) })}</span><div className="flex gap-2"><Button size="sm" variant="outline" aria-label={t("accessControl.accessibility.previousPage")} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><Button size="sm" variant="outline" aria-label={t("accessControl.accessibility.nextPage")} disabled={loading || page >= result.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div></div>
    {access && <div className="space-y-3 rounded-xl border border-border p-4"><div><h3 className="font-semibold">{access.name}</h3><p className="text-sm font-medium">{t("accessControl.staffEmployees.currentAccess")}</p></div><div className="space-y-1 text-xs text-muted-foreground"><p>{access.email}</p><div className="flex flex-wrap gap-x-3 gap-y-1">{access.coarseRoles.map((role) => <span key={role}>{t(`roles.${role}`)}</span>)}</div></div>{sources(access)}<h4 className="font-medium">{t("accessControl.staffEmployees.assignments")}</h4><ul className="space-y-2">{access.assignments.map((assignment) => <li key={assignment.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 p-3 text-sm"><span>{assignment.roleName}{!assignment.isActive && <span className="ml-2 text-muted-foreground">{t("accessControl.staffEmployees.inactiveRole")}</span>}</span><Button size="sm" variant="outline" disabled={busy || assignment.isSystem} onClick={() => void previewRevoke(assignment)}><UserMinus />{t("accessControl.staffEmployees.revoke")}</Button></li>)}</ul><p className="text-xs text-muted-foreground">{t("accessControl.staffEmployees.legacyHelp")}</p></div>}
    {pending && <div className="space-y-3 rounded-xl border border-destructive/30 p-4"><div><h3 className="font-semibold">{pending.employeeName}</h3><p className="text-sm">{pending.assignment.roleName}</p></div><p className="text-sm">{t("accessControl.staffEmployees.remainingAccess")}</p>{sources(pending.remaining)}<p className="text-xs text-muted-foreground">{t("accessControl.staffEmployees.preserveHistory")}</p><label className="block text-sm">{t("accessControl.forms.reason")}<textarea aria-label={t("accessControl.staffEmployees.revokeReason")} value={pending.reason} maxLength={500} onChange={(event) => setPending({ ...pending, reason: event.target.value })} className="mt-2 min-h-20 w-full rounded-xl border border-border bg-background p-3" /></label><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => { setPending(null); setConfirmOpen(false); }}>{t("accessControl.actions.cancel")}</Button><Button disabled={busy || pending.reason.trim().length < 10} onClick={() => setConfirmOpen(true)}>{t("accessControl.actions.reviewChange")}</Button></div></div>}
    <AdminConfirmDialog open={confirmOpen && Boolean(pending)} title={t("accessControl.staffEmployees.confirmTitle")} titleIsTranslated confirmLabel="accessControl.staffEmployees.revoke" confirmVariant="destructive" confirmationPhrase="CONFIRM" confirmationResetKey={JSON.stringify(pending)} busy={busy} onCancel={() => setConfirmOpen(false)} onConfirm={() => void revoke()} description={pending ? <div className="space-y-3"><p>{pending.employeeName}</p><p>{pending.assignment.roleName}</p><p>{pending.reason.trim()}</p><p>{t("accessControl.staffEmployees.remainingAccess")}</p>{sources(pending.remaining)}<p>{t("accessControl.staffEmployees.preserveHistory")}</p></div> : ""} />
  </section>;
}
