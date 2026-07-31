"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { UserManagementDrawer } from "@/components/admin/user-management-drawer";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { getAdminUserInitial, getAdminUserLabel, hasAdminDisplayName } from "@/lib/admin/identity";
import type { UserManagementFilters, UserManagementListItem, UserManagementListResponse } from "@/lib/user-management/types";

const initialFilters: UserManagementFilters = { page: 1, pageSize: 15, search: "", role: null, status: null, kycStatus: null, bioLocked: null };

function badgeClass(value: string) {
  if (["active", "approved", "Verified", "Complete"].includes(value)) return "bg-emerald-50 text-emerald-700";
  if (["suspended", "pending", "Incomplete"].includes(value)) return "bg-amber-50 text-amber-700";
  if (["deleted", "rejected", "Locked"].includes(value)) return "bg-red-50 text-red-700";
  return "bg-secondary text-muted-foreground";
}

export default function AdminUsersPage() {
  const { showFeedback } = useActionFeedback();
  const [filters, setFilters] = useState(initialFilters);
  const [searchInput, setSearchInput] = useState("");
  const [result, setResult] = useState<UserManagementListResponse>({ items: [], total: 0, page: 1, pageSize: 15, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState("1");

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
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to load users");
      setResult(body.data as UserManagementListResponse); setPageInput(String(nextFilters.page));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load users"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [filters]);

  function submitSearch(event: FormEvent) { event.preventDefault(); setFilters((current) => ({ ...current, page: 1, search: searchInput.trim() })); }
  function changeFilter<K extends keyof UserManagementFilters>(key: K, value: UserManagementFilters[K]) { setFilters((current) => ({ ...current, [key]: value, page: 1 })); }
  function goToPage() { const page = Math.max(1, Number.parseInt(pageInput, 10) || 1); setFilters((current) => ({ ...current, page })); }
  function resetFilters() { setSearchInput(""); setFilters(initialFilters); }
  async function copyUserId(event: React.MouseEvent, userId: string) {
    event.stopPropagation();
    await navigator.clipboard.writeText(userId);
    showFeedback("success", "User ID copied.");
  }

  const pageStats = useMemo(() => ({
    incomplete: result.items.filter((user) => !user.profileComplete).length,
    pendingKyc: result.items.filter((user) => user.kycStatus === "pending").length,
    restricted: result.items.filter((user) => user.status !== "active" || user.bioCooldownUntil || user.bioViolationCount >= 5).length,
  }), [result.items]);

  return <main className="mx-auto w-full max-w-[1500px] p-6 sm:p-8">
    <header className="mb-7">
      <div className="flex items-center gap-2 text-primary"><UsersRound size={18} /><p className="text-xs font-semibold uppercase tracking-[0.18em]">Administration</p></div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">User Management</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review ordinary user accounts, verification progress, profile completeness and account status.</p>
    </header>

    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["Total users", result.total, "All users matching the current filters"], ["Pending KYC", pageStats.pendingKyc, "On this page"], ["Incomplete profiles", pageStats.incomplete, "On this page"], ["Needs attention", pageStats.restricted, "Suspended, deleted or bio restricted"]].map(([label, value, note]) => <div key={label} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold text-foreground">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{note}</p></div>)}
    </section>

    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
          <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, email or user ID" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>
          <Button type="submit" size="sm">Search</Button>
        </form>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-auto">
          <select aria-label="Filter by role" value={filters.role ?? ""} onChange={(event) => changeFilter("role", event.target.value ? event.target.value as UserManagementFilters["role"] : null)} className="h-10 rounded-xl border border-border bg-background px-2 text-xs"><option value="">All roles</option><option value="customer">Customer</option><option value="vendor_owner">Vendor owner</option><option value="outlet_manager">Outlet manager</option></select>
          <select aria-label="Filter by status" value={filters.status ?? ""} onChange={(event) => changeFilter("status", event.target.value ? event.target.value as UserManagementFilters["status"] : null)} className="h-10 rounded-xl border border-border bg-background px-2 text-xs"><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="deleted">Deleted</option></select>
          <select aria-label="Filter by KYC status" value={filters.kycStatus ?? ""} onChange={(event) => changeFilter("kycStatus", event.target.value ? event.target.value as UserManagementFilters["kycStatus"] : null)} className="h-10 rounded-xl border border-border bg-background px-2 text-xs"><option value="">All KYC</option><option value="unverified">Unverified</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
          <select aria-label="Filter by Bio status" value={filters.bioLocked === null ? "" : String(filters.bioLocked)} onChange={(event) => changeFilter("bioLocked", event.target.value === "" ? null : event.target.value === "true")} className="h-10 rounded-xl border border-border bg-background px-2 text-xs"><option value="">All Bio states</option><option value="true">Bio locked</option><option value="false">Bio clear</option></select>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Search applies when you press Search. Filters update automatically.</p><Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={!filters.search && !filters.role && !filters.status && !filters.kycStatus && filters.bioLocked === null}>Clear filters</Button></div>
    </section>

    {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><p className="text-sm font-semibold text-foreground">User directory</p><p className="mt-0.5 text-xs text-muted-foreground">Select a row to review account details and actions.</p></div><label className="flex items-center gap-2 text-xs text-muted-foreground">Rows<select aria-label="Rows per page" value={filters.pageSize} onChange={(event) => changeFilter("pageSize", Number(event.target.value) as UserManagementFilters["pageSize"])} className="rounded-lg border border-border bg-background px-2 py-1"><option value={15}>15</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div>
      {loading ? <p className="p-12 text-center text-sm text-muted-foreground">Loading users…</p> : result.items.length === 0 ? <EmptyState title="No users match these filters" description="Try clearing a filter or searching for an email or user ID." action={<Button variant="outline" size="sm" onClick={resetFilters}>Clear filters</Button>} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">User</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Verification</th><th className="px-3 py-3">KYC</th><th className="px-3 py-3">Bio</th><th className="px-5 py-3">Registered</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-border">{result.items.map((user: UserManagementListItem) => { const label = getAdminUserLabel(user); const named = hasAdminDisplayName(user); return <tr key={user.id} onClick={() => setSelectedUserId(user.id)} className="cursor-pointer hover:bg-secondary/40 focus-within:bg-secondary/40"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : getAdminUserInitial(user)}</div><div className="min-w-0"><p className="font-semibold text-foreground">{label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p><div className="mt-1 flex items-center gap-1.5"><p className="truncate text-[10px] text-muted-foreground">{named ? "Profile name set" : "Display name not set"}</p><button type="button" aria-label={`Copy user ID for ${label}`} onClick={(event) => void copyUserId(event, user.id)} className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Copy size={12} /></button></div></div></div></td><td className="px-3 py-4 text-xs capitalize">{user.role.replaceAll("_", " ")}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badgeClass(user.status)}`}>{user.status}</span></td><td className="px-3 py-4"><div className="flex flex-wrap gap-1"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass(user.emailVerified ? "Verified" : "Unverified")}`}>Email {user.emailVerified ? "✓" : "—"}</span><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass(user.phoneVerified ? "Verified" : "Unverified")}`}>Phone {user.phoneVerified ? "✓" : "—"}</span></div></td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${badgeClass(user.kycStatus)}`}>{user.kycStatus}</span></td><td className="px-3 py-4 text-xs">{user.bioCooldownUntil || user.bioViolationCount >= 5 ? <span className="font-semibold text-red-700">Locked ({user.bioViolationCount})</span> : <span className="text-muted-foreground">Clear</span>}</td><td className="px-5 py-4 text-xs text-muted-foreground">{new Date(user.createdAt).toLocaleDateString("en-MY")}</td><td className="px-5 py-4 text-right"><Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedUserId(user.id); }}>View</Button></td></tr>; })}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4"><p className="text-xs text-muted-foreground">Page {result.page} of {Math.max(result.totalPages, 1)}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={loading || result.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={15} /> Previous</Button><div className="flex items-center gap-1"><input aria-label="Page number" value={pageInput} onChange={(event) => setPageInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") goToPage(); }} inputMode="numeric" className="h-9 w-14 rounded-lg border border-border bg-background px-2 text-center text-sm" /><Button variant="outline" size="sm" onClick={goToPage}>Go</Button></div><Button variant="outline" size="sm" disabled={loading || result.totalPages === 0 || result.page >= result.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next <ChevronRight size={15} /></Button></div></div>
    </section>
    <UserManagementDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} onChanged={() => void load()} />
  </main>;
}
