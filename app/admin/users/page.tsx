"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { UserManagementDrawer } from "@/components/admin/user-management-drawer";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { getAdminUserInitial, getAdminUserLabel, hasAdminDisplayName } from "@/lib/admin/identity";
import type { UserManagementFilters, UserManagementListItem, UserManagementListResponse } from "@/lib/user-management/types";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

const initialFilters: UserManagementFilters = { page: 1, pageSize: 15, search: "", role: null, status: null, kycStatus: null, bioLocked: null };

function badgeClass(value: string) {
  if (["active", "approved", "Verified", "Complete"].includes(value)) return "bg-emerald-50 text-emerald-700";
  if (["suspended", "pending", "Incomplete"].includes(value)) return "bg-amber-50 text-amber-700";
  if (["deleted", "rejected", "Locked"].includes(value)) return "bg-red-50 text-red-700";
  return "bg-secondary text-muted-foreground";
}

export default function AdminUsersPage() {
  const { showFeedback } = useActionFeedback();
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [filters, setFilters] = useState(initialFilters);
  const [searchInput, setSearchInput] = useState("");
  const [result, setResult] = useState<UserManagementListResponse>({ items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState("1");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  async function load(nextFilters = filters) {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ page: String(nextFilters.page), pageSize: String(nextFilters.pageSize) });
    if (nextFilters.search) params.set("search", nextFilters.search);
    if (nextFilters.role) params.set("role", nextFilters.role);
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.kycStatus) params.set("kycStatus", nextFilters.kycStatus);
    if (nextFilters.bioLocked !== null) params.set("bioLocked", String(nextFilters.bioLocked));
    try {
      const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("ui.users.errors.load"));
      setResult(body.data as UserManagementListResponse); setPageInput(String(nextFilters.page));
    } catch (err) { setError(err instanceof Error ? err.message : t("ui.users.errors.load")); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [filters]);

  function submitSearch(event: FormEvent) { event.preventDefault(); setFilters((current) => ({ ...current, page: 1, search: searchInput.trim() })); }
  function changeFilter<K extends keyof UserManagementFilters>(key: K, value: UserManagementFilters[K]) { setFilters((current) => ({ ...current, [key]: value, page: 1 })); }
  function goToPage() { const page = Math.max(1, Number.parseInt(pageInput, 10) || 1); setFilters((current) => ({ ...current, page })); }
  function resetFilters() { setSearchInput(""); setFilters(initialFilters); }
  async function copyUserId(event: React.MouseEvent, userId: string) {
    event.stopPropagation();
    await navigator.clipboard.writeText(userId);
    showFeedback("success", t("ui.users.userIdCopied"));
  }

  const selectedUsers = result.items.filter((user) => selectedIds.has(user.id));
  const batchActions = selectedUsers.length === 0 ? [] : (["clear_bio_restriction", "suspend", "unsuspend", "restore"] as const).filter((action) => selectedUsers.every((user) => {
    if (action === "clear_bio_restriction") return user.bioViolationCount > 0 || Boolean(user.bioCooldownUntil);
    if (action === "suspend") return user.status === "active";
    if (action === "unsuspend") return user.status === "suspended";
    return user.status === "deleted";
  }));

  async function applyBatch(action: (typeof batchActions)[number]) {
    if (batchBusy || !selectedUsers.length || !batchActions.includes(action)) return;
    const reason = window.prompt(t("ui.users.batch.reasonPrompt"))?.trim();
    if (!reason || reason.length < 10) {
      setError(t("ui.users.batch.reasonError"));
      return;
    }
    if (!window.confirm(t("ui.users.batch.confirm", { action: t(`ui.users.actions.${action}`), count: selectedUsers.length }))) return;
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selectedUsers.map((user) => fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? t("ui.users.batch.failed"));
      }
      setSelectedIds(new Set());
      showFeedback("success", t("ui.users.batch.processed", { count: selectedUsers.length }));
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : t("ui.users.batch.failed"));
    } finally {
      setBatchBusy(false);
    }
  }

  const pageStats = useMemo(() => ({
    incomplete: result.items.filter((user) => !user.profileComplete).length,
    pendingKyc: result.items.filter((user) => user.kycStatus === "pending").length,
    restricted: result.items.filter((user) => user.status !== "active" || user.bioCooldownUntil || user.bioViolationCount >= 5).length,
  }), [result.items]);

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow={<><UsersRound size={18} /> {t("ui.users.eyebrow")}</>}
      title={t("ui.users.title")}
      description={t("ui.users.description")}
    />

    <AdminMetricGrid items={[
      { label: t("ui.users.stats.total"), value: result.total, detail: t("ui.users.stats.totalNote") },
      { label: t("ui.users.stats.pendingKyc"), value: pageStats.pendingKyc, detail: t("ui.users.stats.pageNote") },
      { label: t("ui.users.stats.incomplete"), value: pageStats.incomplete, detail: t("ui.users.stats.pageNote") },
      { label: t("ui.users.stats.attention"), value: pageStats.restricted, detail: t("ui.users.stats.attentionNote") },
    ]} />

    <AdminFilterBar>
      <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center">
        <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
          <div className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={t("ui.users.searchPlaceholder")} className={`${adminFilterControlClassName} w-full pl-9 pr-3`} /></div>
          <Button type="submit" size="sm">{t("ui.actions.search")}</Button>
        </form>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:w-auto">
          <select aria-label={t("ui.users.filters.roleLabel")} value={filters.role ?? ""} onChange={(event) => changeFilter("role", event.target.value ? event.target.value as UserManagementFilters["role"] : null)} className={adminFilterControlClassName}><option value="">{t("ui.users.filters.allRoles")}</option><option value={t("chatReports.roles.customer")}>{t("ui.users.roles.customer")}</option><option value="vendor_owner">{t("ui.users.roles.vendorOwner")}</option><option value="outlet_manager">{t("ui.users.roles.outletManager")}</option></select>
          <select aria-label={t("ui.users.filters.statusLabel")} value={filters.status ?? ""} onChange={(event) => changeFilter("status", event.target.value ? event.target.value as UserManagementFilters["status"] : null)} className={adminFilterControlClassName}><option value="">{t("ui.users.filters.allStatuses")}</option><option value="active">{t("ui.users.status.active")}</option><option value="suspended">{t("ui.users.status.suspended")}</option><option value="deleted">{t("ui.users.status.deleted")}</option></select>
          <select aria-label={t("ui.users.filters.kycLabel")} value={filters.kycStatus ?? ""} onChange={(event) => changeFilter("kycStatus", event.target.value ? event.target.value as UserManagementFilters["kycStatus"] : null)} className={adminFilterControlClassName}><option value="">{t("ui.users.filters.allKyc")}</option><option value="unverified">{t("ui.users.status.unverified")}</option><option value="pending">{t("ui.users.status.pending")}</option><option value="approved">{t("ui.users.status.approved")}</option><option value="rejected">{t("ui.users.status.rejected")}</option></select>
          <select aria-label={t("ui.users.filters.bioLabel")} value={filters.bioLocked === null ? "" : String(filters.bioLocked)} onChange={(event) => changeFilter("bioLocked", event.target.value === "" ? null : event.target.value === "true")} className={adminFilterControlClassName}><option value="">{t("ui.users.filters.allBioStates")}</option><option value="true">{t("ui.users.bio.locked")}</option><option value="false">{t("ui.users.bio.clear")}</option></select>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{t("ui.users.searchHint")}</p><Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={!filters.search && !filters.role && !filters.status && !filters.kycStatus && filters.bioLocked === null}>{t("ui.actions.clearFilters")}</Button></div>
    </AdminFilterBar>

    {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><p className="text-sm font-semibold text-foreground">{t("ui.users.directory.title")}</p><p className="mt-0.5 text-xs text-muted-foreground">{t("ui.users.directory.description")}</p></div><label className="flex items-center gap-2 text-xs text-muted-foreground">{t("ui.users.rows")}<select aria-label={t("ui.users.rowsPerPage")} value={filters.pageSize} onChange={(event) => changeFilter("pageSize", Number(event.target.value) as UserManagementFilters["pageSize"])} className={adminFilterControlClassName}><option value={15}>15</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3 text-xs"><input type="checkbox" aria-label={t("ui.users.selectAllVisible")} checked={result.items.length > 0 && result.items.every((user) => selectedIds.has(user.id))} onChange={(event) => setSelectedIds(event.target.checked ? new Set(result.items.map((user) => user.id)) : new Set())} /><span className="text-muted-foreground">{t("ui.batch.selectAllOnPage")}</span></div>
      <AdminBatchActionBar selectedCount={selectedUsers.length} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as (typeof batchActions)[number])} actions={batchActions.map((action) => ({ value: action, label: t(`ui.users.actions.${action}`) }))} busy={batchBusy} message={selectedUsers.length > 0 && batchActions.length === 0 ? t("ui.users.batch.noCommonAction") : undefined} />
      {loading ? <p className="p-12 text-center text-sm text-muted-foreground">{t("ui.users.loading")}</p> : result.items.length === 0 ? <EmptyState title={t("ui.users.empty.title")} description={t("ui.users.empty.description")} action={<Button variant="outline" size="sm" onClick={resetFilters}>{t("ui.actions.clearFilters")}</Button>} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">{t("ui.table.select")}</th><th className="px-5 py-3">{t("ui.table.user")}</th><th className="px-3 py-3">{t("ui.table.role")}</th><th className="px-3 py-3">{t("ui.table.status")}</th><th className="px-3 py-3">{t("ui.table.verification")}</th><th className="px-3 py-3">{t("ui.table.kyc")}</th><th className="px-3 py-3">{t("ui.table.bio")}</th><th className="px-5 py-3">{t("ui.table.registered")}</th><th className="px-5 py-3 text-right">{t("ui.table.action")}</th></tr></thead><tbody className="divide-y divide-border">{result.items.map((user: UserManagementListItem) => { const label = getAdminUserLabel(user); const named = hasAdminDisplayName(user); return <tr key={user.id} onClick={() => setSelectedUserId(user.id)} className="cursor-pointer hover:bg-secondary/40 focus-within:bg-secondary/40"><td className="px-5 py-4"><input type="checkbox" aria-label={t("ui.users.selectUser", { name: label })} checked={selectedIds.has(user.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(user.id) : next.delete(user.id); return next; })} /></td><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : getAdminUserInitial(user)}</div><div className="min-w-0"><p className="font-semibold text-foreground">{label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p><div className="mt-1 flex items-center gap-1.5"><p className="truncate text-[10px] text-muted-foreground">{named ? t("ui.users.profileNameSet") : t("ui.users.displayNameNotSet")}</p><button type="button" aria-label={t("ui.users.copyUserId", { name: label })} onClick={(event) => void copyUserId(event, user.id)} className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Copy size={12} /></button></div></div></div></td><td className="px-3 py-4 text-xs capitalize">{t(`ui.users.roles.${user.role}`)}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badgeClass(user.status)}`}>{t(`ui.users.status.${user.status}`)}</span></td><td className="px-3 py-4"><div className="flex flex-wrap gap-1"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass(user.emailVerified ? "Verified" : "Unverified")}`}>{t("ui.users.email")} {user.emailVerified ? t("ui.users.status.verified") : t("ui.users.status.unverified")} {user.emailVerified ? "✓" : "—"}</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass(user.phoneVerified ? "Verified" : "Unverified")}`}>{t("ui.users.phone")} {user.phoneVerified ? t("ui.users.status.verified") : t("ui.users.status.unverified")} {user.phoneVerified ? "✓" : "—"}</span></div></td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badgeClass(user.kycStatus)}`}>{t(`ui.users.status.${user.kycStatus}`)}</span></td><td className="px-3 py-4 text-xs">{user.bioCooldownUntil || user.bioViolationCount >= 5 ? <span className="font-semibold text-red-700">{t("ui.users.bio.lockedCount", { count: user.bioViolationCount })}</span> : <span className="text-muted-foreground">{t("ui.users.bio.clear")}</span>}</td><td className="px-5 py-4 text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString(locale)}</td><td className="px-5 py-4 text-right"><Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedUserId(user.id); }}>{t("ui.actions.view")}</Button></td></tr>; })}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4"><p className="text-xs text-muted-foreground">{t("ui.pagination.pageOf", { page: result.page, total: Math.max(result.totalPages, 1) })}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={loading || result.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={15} /> {t("ui.pagination.previous")}</Button><div className="flex items-center gap-1"><input aria-label={t("ui.pagination.pageNumber")} value={pageInput} onChange={(event) => setPageInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") goToPage(); }} inputMode="numeric" className="h-9 w-14 rounded-lg border border-border bg-background px-2 text-center text-sm" /><Button variant="outline" size="sm" onClick={goToPage}>{t("ui.pagination.go")}</Button></div><Button variant="outline" size="sm" disabled={loading || result.totalPages === 0 || result.page >= result.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>{t("ui.pagination.next")} <ChevronRight size={15} /></Button></div></div>
    </section>
    <UserManagementDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} onChanged={() => void load()} />
  </AdminPageShell>;
}
