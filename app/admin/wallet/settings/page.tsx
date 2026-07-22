"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WALLET_REASON_CATEGORIES } from "@/lib/validation/wallet-reason-schemas";

type Settings = { clearanceDays: number; minAmountSen: number; dualApprovalThresholdSen: number; escalationHours: number; holdEscalationHours: number; updatedAt?: string | null; updatedBy?: string | null };
type Approver = { id: string; email: string; name: string; accountStatus: string; active: boolean; grantedAt: string | null };
type EligibleUser = { id: string; email: string; name: string };
const initial: Settings = { clearanceDays: 7, minAmountSen: 5000, dualApprovalThresholdSen: 50000, escalationHours: 48, holdEscalationHours: 168 };

export default function WalletSettingsPage() {
  const [settings, setSettings] = useState<Settings>(initial);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("other");
  const [roleReason, setRoleReason] = useState("");
  const [roleReasonCategory, setRoleReasonCategory] = useState("other");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [settingsResponse, approversResponse] = await Promise.all([fetch("/api/admin/wallet-settings"), fetch("/api/admin/wallet-approvers")]);
      const settingsBody = await settingsResponse.json() as { data?: Settings; error?: { message?: string } };
      const approversBody = await approversResponse.json() as { data?: { items: Approver[]; eligibleUsers?: EligibleUser[] }; error?: { message?: string } };
      if (!settingsResponse.ok || !settingsBody.data) throw new Error(settingsBody.error?.message ?? "Unable to load wallet settings");
      if (!approversResponse.ok || !approversBody.data) throw new Error(approversBody.error?.message ?? "Unable to load Wallet Approvers");
      setSettings(settingsBody.data); setApprovers(approversBody.data.items); setEligibleUsers(approversBody.data.eligibleUsers ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load wallet governance settings"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function saveSettings() {
    setError(""); setMessage("");
    if (reason.trim().length < 10) { setError("A change reason of at least 10 characters is required."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/wallet-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clearanceDays: settings.clearanceDays,
          minAmountSen: settings.minAmountSen,
          dualApprovalThresholdSen: settings.dualApprovalThresholdSen,
          escalationHours: settings.escalationHours,
          holdEscalationHours: settings.holdEscalationHours,
          reasonCategory,
          reason: reason.trim(),
        }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to save settings");
      setMessage("Wallet governance settings saved."); setReason(""); setReasonCategory("other");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save settings"); }
    finally { setSaving(false); }
  }

  async function changeRole(userId: string, action: "grant" | "revoke") {
    setError(""); setMessage("");
    if (roleReason.trim().length < 10) { setError("A role-change reason of at least 10 characters is required."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/wallet-approvers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, action, reasonCategory: roleReasonCategory, reason: roleReason.trim() }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to change Wallet Approver role");
      setMessage(`Wallet Approver ${action === "grant" ? "granted" : "revoked"}.`); setRoleReason(""); setRoleReasonCategory("other"); setSelectedUser(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to change Wallet Approver role"); }
    finally { setSaving(false); }
  }

  return <div className="p-6 sm:p-8 max-w-5xl">
    <Link href="/admin/withdrawals" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5"><ArrowLeft size={15} /> Back to withdrawals</Link>
    <h1 className="text-xl font-bold">Wallet governance settings</h1><p className="text-sm text-muted-foreground mt-1 mb-6">Super Admin controls for clearance, approval thresholds and Wallet Approver access.</p>
    {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
      <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">Withdrawal and reward settings</h2><p className="text-xs text-muted-foreground mt-1">These values apply to new requests and rewards. Existing requests keep their recorded state.</p>{settings.updatedAt && <p className="text-xs text-muted-foreground mt-1">Last updated {new Date(settings.updatedAt).toLocaleString("en-MY")}</p>}<div className="grid sm:grid-cols-2 gap-4 mt-4">{([['clearanceDays','Reward clearance days'],['minAmountSen','Minimum withdrawal (sen)'],['dualApprovalThresholdSen','Two-person threshold (sen)'],['escalationHours','Pending escalation hours'],['holdEscalationHours','Hold escalation hours']] as const).map(([key, label]) => <label key={key} className="text-sm"><span className="block text-muted-foreground mb-1">{label}</span><input type="number" value={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })} className="w-full rounded-xl border border-border bg-background px-3 py-2.5" min={0} /></label>)}</div><label className="block text-sm mt-4"><span className="block text-muted-foreground mb-1">Change category</span><select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">{WALLET_REASON_CATEGORIES.settings.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label><label className="block text-sm mt-4"><span className="block text-muted-foreground mb-1">Change reason (minimum 10 characters)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full min-h-20 rounded-xl border border-border bg-background p-3" /></label><Button className="mt-3" onClick={() => void saveSettings()} disabled={saving}><Save size={15} className="mr-2" /> Save settings</Button></section>
      <section className="rounded-2xl border border-border bg-card p-5 mt-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-primary" /><h2 className="font-semibold">Wallet Approvers</h2></div><p className="text-xs text-muted-foreground mt-1">Only active non-Super-Admin users can be granted this role. The last active approver cannot be removed.</p><label className="block text-sm mt-4"><span className="block text-muted-foreground mb-1">Role-change category</span><select value={roleReasonCategory} onChange={(e) => setRoleReasonCategory(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">{WALLET_REASON_CATEGORIES.approver_role.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label><label className="block text-sm mt-4"><span className="block text-muted-foreground mb-1">Role-change reason (minimum 10 characters)</span><textarea value={roleReason} onChange={(e) => setRoleReason(e.target.value)} className="w-full min-h-20 rounded-xl border border-border bg-background p-3" /></label><div className="flex flex-wrap gap-2 mt-4"><select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="flex-1 min-w-[240px] rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option value="">Select an active user to grant access…</option>{eligibleUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select><Button onClick={() => selectedUser && void changeRole(selectedUser, "grant")} disabled={saving || !selectedUser}>Grant access</Button></div><div className="divide-y divide-border mt-4">{approvers.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No Wallet Approvers configured.</p> : approvers.map((approver) => <div key={approver.id} className="py-3 flex flex-wrap gap-3 items-center"><div className="flex-1 min-w-[220px]"><p className="font-medium text-sm">{approver.name}</p><p className="text-xs text-muted-foreground">{approver.email} · {approver.accountStatus}</p></div><span className="text-xs rounded-full px-2 py-1 bg-muted">{approver.active ? "Active" : "Inactive"}</span><Button size="sm" variant="outline" onClick={() => void changeRole(approver.id, "revoke")} disabled={saving}>Revoke</Button></div>)}</div></section>
    </>}
    {message && <p className="mt-4 text-sm text-primary">{message}</p>}{error && <p className="mt-4 text-sm text-destructive">{error}</p>}
  </div>;
}
