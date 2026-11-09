"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { runStaffPasskey } from "@/lib/auth/staff-passkey-browser";

type JitRequest = {
  id: string;
  user_id: string;
  requester_name: string | null;
  permission_key: string;
  reason: string;
  duration_minutes: number;
  requested_at: string;
  state: string;
};

export function JitApprovalsTab() {
  const { t } = useTranslation("admin");
  const [items, setItems] = useState<JitRequest[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const response = await fetch(`/api/admin/access-control/jit?page=${page}&pageSize=${pageSize}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (id === requestId.current) {
        setItems(body.data?.items ?? []);
        setTotal(body.data?.total ?? 0);
        setTotalPages(body.data?.totalPages ?? 0);
        setError(false);
      }
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function decide(item: JitRequest, decision: "approve" | "reject") {
    setBusyId(item.id);
    setNotice(null);
    setError(false);
    try {
      await runStaffPasskey({ operation: "manage" });
      const response = await fetch(`/api/admin/access-control/jit/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      if (!response.ok) throw new Error();
      setReason("");
      setNotice(t("accessControl.jit.updated"));
      await refresh();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{t("accessControl.jit.title")}</h2><p className="text-sm text-muted-foreground">{t("accessControl.jit.description")}</p></div><Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>{t("accessControl.actions.refresh")}</Button></header>
    <label className="grid max-w-2xl gap-1.5 text-sm font-medium">{t("accessControl.jit.decisionReason")}<textarea className="min-h-20 rounded-md border border-input bg-background px-3 py-2" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-destructive">{t("accessControl.jit.error")}</p>}
    {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    <AdminFilterBar>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">{t("accessControl.staffEmployees.pageSize")}
        <select aria-label={t("accessControl.staffEmployees.pageSize")} className={adminFilterControlClassName} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <span className="text-xs text-muted-foreground">{t("accessControl.staffEmployees.total", { count: total })}</span>
    </AdminFilterBar>
    {loading ? <p className="text-sm text-muted-foreground">{t("accessControl.jit.loading")}</p> : items.length === 0
      ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("accessControl.jit.empty")}</p>
      : <ul className="divide-y divide-border rounded-xl border border-border">{items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div><p className="font-semibold">{item.requester_name || t("accessControl.jit.staffMember")}</p><p className="text-xs text-muted-foreground">{item.user_id}</p><p className="mt-1 text-sm">{t("accessControl.jit.stateDuration", { state: t("accessControl.jit.permissionLabel"), duration: t("accessControl.jit.minutes", { count: item.duration_minutes }) })}</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.reason}</p></div>
        <div className="flex gap-2"><Button type="button" size="sm" disabled={busyId === item.id || reason.trim().length < 10} onClick={() => void decide(item, "approve")}>{t("accessControl.jit.approve")}</Button><Button type="button" variant="outline" size="sm" disabled={busyId === item.id || reason.trim().length < 10} onClick={() => void decide(item, "reject")}>{t("accessControl.jit.reject")}</Button></div>
      </li>)}</ul>}
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{t("accessControl.pagination.pageOf", { page, total: Math.max(1, totalPages) })}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" aria-label={t("accessControl.accessibility.previousPage")} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button>
        <Button size="sm" variant="outline" aria-label={t("accessControl.accessibility.nextPage")} disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button>
      </div>
    </div>
  </section>;
}
