"use client";

import { useEffect, useState } from "react";
import { X, ShieldCheck, RotateCcw, Trash2, Ban, Unlock, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserManagementAction, UserManagementDetail } from "@/lib/user-management/types";
import { getUserManagementErrorMessage } from "@/lib/user-management/error-message";

type Props = { userId: string | null; onClose: () => void; onChanged: () => void };

const ACTION_LABELS: Record<UserManagementAction, string> = {
  clear_bio_restriction: "Clear Bio restriction",
  suspend: "Suspend account",
  unsuspend: "Unsuspend account",
  soft_delete: "Soft delete account",
  restore: "Restore account",
};

function statusClass(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "suspended") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export function UserManagementDrawer({ userId, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<UserManagementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<UserManagementAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true); setError(null); setAction(null); setReason("");
    fetch(`/api/admin/users/${encodeURIComponent(userId)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error?.message ?? "Unable to load user");
        if (!cancelled) setDetail(body.data as UserManagementDetail);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load user"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  async function runAction() {
    if (!userId || !action || reason.trim().length < 10) {
      setError("Reason must be at least 10 characters.");
      return;
    }
    if (!window.confirm(`${ACTION_LABELS[action]} for ${detail?.email ?? "this user"}?`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getUserManagementErrorMessage(body, "Unable to update user"));
      setAction(null); setReason(""); onChanged();
      const refreshed = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`);
      const refreshedBody = await refreshed.json().catch(() => ({}));
      if (refreshed.ok) setDetail(refreshedBody.data as UserManagementDetail);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update user"); }
    finally { setBusy(false); }
  }

  if (!userId) return null;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/25" role="dialog" aria-modal="true" aria-label="User details">
    <button type="button" aria-label="Close drawer" className="absolute inset-0 cursor-default" onClick={onClose} />
    <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">User details</p><h2 className="mt-1 text-xl font-bold text-foreground">{detail?.fullName || detail?.email || "Loading…"}</h2></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={18} /></Button></div>
      {loading && <p className="py-8 text-sm text-muted-foreground">Loading user…</p>}
      {error && <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {detail && <div className="mt-5 space-y-5">
        <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-secondary text-lg font-bold text-primary">{detail.avatarUrl ? <img src={detail.avatarUrl} alt="" className="h-full w-full object-cover" /> : (detail.fullName || detail.email).slice(0, 1).toUpperCase()}</div><div><p className="font-semibold text-foreground">{detail.email}</p><p className="text-xs text-muted-foreground">{detail.role.replaceAll("_", " ")}</p></div><span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(detail.status)}`}>{detail.status}</span></div>
        <div className="grid gap-3 sm:grid-cols-2">{[
          ["Phone", detail.phone || "Not set"], ["Location", [detail.city, detail.country].filter(Boolean).join(", ") || "Not set"],
          ["Email verification", detail.emailVerified ? "Verified" : "Unverified"], ["Phone verification", detail.phoneVerified ? "Verified" : "Unverified"],
          ["Profile", detail.profileComplete ? "Complete" : "Incomplete"], ["KYC", detail.kycStatus],
          ["Registered", new Date(detail.createdAt).toLocaleString("en-MY")], ["Pending withdrawals", String(detail.pendingWithdrawalCount)],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-border p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium capitalize text-foreground">{value}</p></div>)}</div>
        <div className="rounded-xl border border-border p-4"><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /><p className="font-semibold text-foreground">Bio moderation</p></div><p className="mt-2 text-sm text-muted-foreground">Violations: {detail.bioViolationCount}</p><p className="text-sm text-muted-foreground">Cooldown: {detail.bioCooldownUntil ? new Date(detail.bioCooldownUntil).toLocaleString("en-MY") : "None"}</p><p className="mt-2 text-sm text-foreground">{detail.bio || "Bio not set"}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="font-semibold text-foreground">Recent management history</p>{detail.auditHistory.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No User Management actions recorded.</p> : <div className="mt-3 space-y-2">{detail.auditHistory.map((entry, index) => <div key={`${entry.createdAt}-${index}`} className="rounded-lg bg-secondary/60 p-2.5"><p className="text-xs font-semibold capitalize text-foreground">{entry.action.replace("user_management.", "").replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{entry.note || "No reason recorded"} · {new Date(entry.createdAt).toLocaleString("en-MY")}</p></div>)}</div>}</div>
        <div className="border-t border-border pt-5"><p className="mb-3 text-sm font-semibold text-foreground">Account actions</p><div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy || (detail.bioViolationCount === 0 && !detail.bioCooldownUntil)} onClick={() => setAction("clear_bio_restriction")}><Eraser size={14} /> Clear Bio restriction</Button>
          {detail.status === "active" && <><Button variant="outline" size="sm" disabled={busy} onClick={() => setAction("suspend")}><Ban size={14} /> Suspend</Button><Button variant="destructive" size="sm" disabled={busy || detail.pendingWithdrawalCount > 0} onClick={() => setAction("soft_delete")}><Trash2 size={14} /> Soft delete</Button></>}
          {detail.status === "suspended" && <Button size="sm" disabled={busy} onClick={() => setAction("unsuspend")}><Unlock size={14} /> Unsuspend</Button>}
          {detail.status === "deleted" && <Button size="sm" disabled={busy} onClick={() => setAction("restore")}><RotateCcw size={14} /> Restore</Button>}
        </div>{detail.pendingWithdrawalCount > 0 && detail.status === "active" && <p className="mt-2 text-xs text-amber-700">Soft delete is disabled while a withdrawal is pending or processing.</p>}</div>
        {action && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-semibold text-foreground">{ACTION_LABELS[action]}</p><p className="mt-1 text-xs text-muted-foreground">Enter at least 10 characters. This action will be recorded in the audit log.</p><textarea value={reason} onChange={(event) => { setReason(event.target.value); if (error) setError(null); }} rows={3} maxLength={1000} placeholder="Reason for this action" className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />{error && <p role="alert" className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">{error}</p>}<div className="mt-2 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => { setAction(null); setReason(""); setError(null); }}>Cancel</Button><Button size="sm" onClick={() => void runAction()} disabled={busy || reason.trim().length < 10}>{busy ? "Saving…" : "Confirm action"}</Button></div></div>}
      </div>}
    </aside>
  </div>;
}
