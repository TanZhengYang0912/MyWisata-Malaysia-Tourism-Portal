"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Save, Search, ShieldCheck, UserPlus, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { WALLET_REASON_CATEGORIES } from "@/lib/validation/wallet-reason-schemas";

type Settings = { clearanceDays: number; minAmountSen: number; dualApprovalThresholdSen: number; escalationHours: number; holdEscalationHours: number; updatedAt?: string | null; updatedBy?: string | null };
type Approver = { id: string; email: string; name: string; accountStatus: string; active: boolean; grantedAt: string | null };
type EligibleUser = { id: string; email: string; name: string };
type RoleAction = { userId: string; action: "grant" | "revoke"; name: string } | null;
const initial: Settings = { clearanceDays: 7, minAmountSen: 5000, dualApprovalThresholdSen: 50000, escalationHours: 48, holdEscalationHours: 168 };

const FIELD_GROUPS = [
  { title: "Earnings & withdrawals", description: "Controls when rewards become available and the minimum amount a user can withdraw.", fields: [["clearanceDays", "Reward clearance days", "days"], ["minAmountSen", "Minimum withdrawal", "RM"]] },
  { title: "Approval & escalation", description: "Controls second-person approval and operational follow-up windows.", fields: [["dualApprovalThresholdSen", "Two-person approval threshold", "RM"], ["escalationHours", "Pending escalation", "hours"], ["holdEscalationHours", "Hold escalation", "hours"]] },
] as const;

function moneyFromSen(value: number) { return `RM ${(value / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function sameSettings(a: Settings, b: Settings) { return a.clearanceDays === b.clearanceDays && a.minAmountSen === b.minAmountSen && a.dualApprovalThresholdSen === b.dualApprovalThresholdSen && a.escalationHours === b.escalationHours && a.holdEscalationHours === b.holdEscalationHours; }

export default function WalletSettingsPage() {
  const { showFeedback } = useActionFeedback();
  const [settings, setSettings] = useState<Settings>(initial);
  const [savedSettings, setSavedSettings] = useState<Settings>(initial);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedUser, setSelectedUser] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [approverSearch, setApproverSearch] = useState("");
  const [reason, setReason] = useState("");
  const [reasonCategory, setReasonCategory] = useState("other");
  const [roleReason, setRoleReason] = useState("");
  const [roleReasonCategory, setRoleReasonCategory] = useState("other");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmSettings, setConfirmSettings] = useState(false);
  const [pendingRoleAction, setPendingRoleAction] = useState<RoleAction>(null);
  const [selectedApproverIds, setSelectedApproverIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [settingsResponse, approversResponse] = await Promise.all([fetch("/api/admin/wallet-settings", { cache: "no-store" }), fetch("/api/admin/wallet-approvers", { cache: "no-store" })]);
      const settingsBody = await settingsResponse.json() as { data?: Settings; error?: { message?: string } };
      const approversBody = await approversResponse.json() as { data?: { items: Approver[]; eligibleUsers?: EligibleUser[] }; error?: { message?: string } };
      if (!settingsResponse.ok || !settingsBody.data) throw new Error(settingsBody.error?.message ?? "Unable to load wallet settings");
      if (!approversResponse.ok || !approversBody.data) throw new Error(approversBody.error?.message ?? "Unable to load wallet approvers");
      setSettings(settingsBody.data); setSavedSettings(settingsBody.data); setApprovers(approversBody.data.items); setEligibleUsers(approversBody.data.eligibleUsers ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load wallet governance settings"); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  async function saveSettings() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/wallet-settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ clearanceDays: settings.clearanceDays, minAmountSen: settings.minAmountSen, dualApprovalThresholdSen: settings.dualApprovalThresholdSen, escalationHours: settings.escalationHours, holdEscalationHours: settings.holdEscalationHours, reasonCategory, reason: reason.trim() }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to save settings");
      setSavedSettings(settings); setReason(""); setReasonCategory("other"); setConfirmSettings(false); showFeedback("success", "Wallet governance settings saved.");
    } catch (err) { const message = err instanceof Error ? err.message : "Unable to save settings"; setError(message); showFeedback("error", message); }
    finally { setSaving(false); }
  }

  function requestSaveSettings() {
    setError("");
    if (!sameSettings(settings, savedSettings)) {
      if (settings.clearanceDays < 0 || settings.minAmountSen < 0 || settings.dualApprovalThresholdSen < 0 || settings.escalationHours < 0 || settings.holdEscalationHours < 0) { setError("Values cannot be negative."); return; }
      if (reason.trim().length < 10) { setError("Add a change reason of at least 10 characters before saving."); return; }
      setConfirmSettings(true);
    }
  }

  async function changeRole() {
    if (!pendingRoleAction) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/wallet-approvers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: pendingRoleAction.userId, action: pendingRoleAction.action, reasonCategory: roleReasonCategory, reason: roleReason.trim() }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to change wallet approver role");
      setRoleReason(""); setRoleReasonCategory("other"); setSelectedUser(""); setPendingRoleAction(null); showFeedback("success", `Wallet approver ${pendingRoleAction.action === "grant" ? "granted" : "revoked"}.`); await load();
    } catch (err) { const message = err instanceof Error ? err.message : "Unable to change wallet approver role"; setError(message); showFeedback("error", message); }
    finally { setSaving(false); }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function requestRoleChange(userId: string, action: "grant" | "revoke", name: string) {
    setError("");
    if (roleReason.trim().length < 10) { setError("Add a role-change reason of at least 10 characters before continuing."); return; }
    setPendingRoleAction({ userId, action, name });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function revokeApproversBatch() {
    if (batchBusy) return;
    const selected = approvers.filter((approver) => selectedApproverIds.has(approver.id) && approver.active);
    if (!selected.length || selected.length !== selectedApproverIds.size) {
      setError("Select active wallet approvers only.");
      return;
    }
    if (roleReason.trim().length < 10) {
      setError("Add a role-change reason of at least 10 characters before using batch revoke.");
      return;
    }
    if (!window.confirm(`Revoke wallet approval access for ${selected.length} selected approvers?`)) return;
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selected.map((approver) => fetch("/api/admin/wallet-approvers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: approver.id, action: "revoke", reasonCategory: roleReasonCategory, reason: roleReason.trim() }) })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "One or more approver revocations failed.");
      }
      setSelectedApproverIds(new Set());
      showFeedback("success", `${selected.length} wallet approvers revoked.`);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch approver revocation failed.";
      setError(message);
      showFeedback("error", message);
    } finally {
      setBatchBusy(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filteredEligible = eligibleUsers.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(approverSearch.toLowerCase()));
  const dirty = !sameSettings(settings, savedSettings);

  return <main className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
    <Link href="/admin/withdrawals" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Back to withdrawals</Link>
    <header><div className="flex items-center gap-2 text-primary"><ShieldCheck size={18} /><p className="text-xs font-semibold uppercase tracking-[0.18em]">Wallet governance</p></div><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">Wallet settings</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage payout policy, escalation windows and the people authorised to approve wallet requests.</p></header>
    {error && <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle size={16} /> {error}</p>}
    {loading ? <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading wallet governance…</p> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-foreground">Withdrawal policy</h2><p className="mt-1 text-sm text-muted-foreground">These values apply to new requests and rewards. Existing requests keep their recorded state.</p></div>{dirty && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Unsaved changes</span>}</div>{settings.updatedAt && <p className="mt-3 text-xs text-muted-foreground">Last updated {new Date(settings.updatedAt).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" })} MYT{settings.updatedBy ? ` by ${settings.updatedBy}` : ""}</p>}
          <div className="mt-6 space-y-6">{FIELD_GROUPS.map((group) => <div key={group.title}><div className="mb-3"><h3 className="text-sm font-semibold text-foreground">{group.title}</h3><p className="mt-1 text-xs text-muted-foreground">{group.description}</p></div><div className="grid gap-4 sm:grid-cols-2">{group.fields.map(([key, fieldLabel, unit]) => <label key={key} className="text-sm"><span className="mb-1.5 block font-medium text-foreground">{fieldLabel}</span><span className="relative block"><input aria-label={fieldLabel} type="number" min={0} step={unit === "RM" ? 0.01 : 1} value={unit === "RM" ? settings[key] / 100 : settings[key]} onChange={(event) => setSettings({ ...settings, [key]: unit === "RM" ? Math.round(Number(event.target.value) * 100) : Number(event.target.value) })} className="h-11 w-full rounded-xl border border-border bg-background px-3 pr-16 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{unit}</span></span><span className="mt-1 block text-[11px] text-muted-foreground">{unit === "RM" ? `Stored precisely in sen · Current: ${moneyFromSen(settings[key])}` : `Current value in ${unit}`}</span></label>)}</div></div>)}</div>
          <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-semibold text-foreground">Audit record</h3><p className="mt-1 text-xs text-muted-foreground">Every policy change requires a category and a reason of at least 10 characters.</p><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-sm"><span className="mb-1.5 block font-medium text-foreground">Change category</span><select value={reasonCategory} onChange={(event) => setReasonCategory(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">{WALLET_REASON_CATEGORIES.settings.map((category) => <option key={category} value={category}>{label(category)}</option>)}</select></label><label className="text-sm sm:col-span-2"><span className="mb-1.5 block font-medium text-foreground">Why are you changing this?</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Describe the policy change and its reason." className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><span className="mt-1 block text-right text-[11px] text-muted-foreground">{reason.length}/500</span></label></div></div>
          <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={!dirty || saving} onClick={() => { setSettings(savedSettings); setReason(""); setError(""); }}>Discard changes</Button><Button disabled={!dirty || saving} onClick={requestSaveSettings}><Save size={15} /> Save settings</Button></div>
        </section>
      </div>
      <aside className="h-fit rounded-2xl border border-primary/15 bg-gradient-to-b from-[#F0F3FF] to-[#ECF9FF] p-5 text-foreground shadow-sm xl:sticky xl:top-6"><div className="flex items-center gap-2 text-primary"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 shadow-sm"><CheckCircle2 size={16} /></span><p className="text-xs font-semibold uppercase tracking-[0.16em]">Effective policy</p></div><p className="mt-3 text-sm leading-5 text-muted-foreground">The values below are the current working configuration.</p><div className="mt-5 space-y-4">{[["Minimum withdrawal", moneyFromSen(settings.minAmountSen)], ["Two-person approval", moneyFromSen(settings.dualApprovalThresholdSen)], ["Reward clearance", `${settings.clearanceDays} days`], ["Pending escalation", `${settings.escalationHours} hours`], ["Hold escalation", `${settings.holdEscalationHours} hours`]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 border-b border-primary/10 pb-3"><span className="text-xs text-muted-foreground">{label}</span><span className="text-sm font-semibold text-primary">{value}</span></div>)}</div><div className="mt-5 flex items-start gap-2 rounded-xl border border-primary/10 bg-white/70 p-3 text-xs leading-5 text-muted-foreground"><Clock3 size={15} className="mt-0.5 shrink-0 text-primary" /> Existing withdrawal requests keep their recorded state when policy settings change.</div></aside>
    </div>}
    <AdminConfirmDialog open={confirmSettings} title="Save wallet policy changes?" description="The new values will apply to future rewards and withdrawal requests. Existing requests keep their recorded state, and this change will be written to the audit log." confirmLabel="Save settings" busy={saving} onCancel={() => setConfirmSettings(false)} onConfirm={() => void saveSettings()} />
    <AdminConfirmDialog open={Boolean(pendingRoleAction)} title={pendingRoleAction?.action === "grant" ? "Grant wallet approver access?" : "Revoke wallet approver access?"} description={`${pendingRoleAction?.action === "grant" ? "Grant" : "Revoke"} wallet approval access for ${pendingRoleAction?.name ?? "this user"}. This permission change will be recorded in the audit log.`} confirmLabel={pendingRoleAction?.action === "grant" ? "Grant access" : "Revoke access"} confirmVariant={pendingRoleAction?.action === "revoke" ? "destructive" : "default"} busy={saving} onCancel={() => setPendingRoleAction(null)} onConfirm={() => void changeRole()} />
  </main>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function EmptyApprovers() {
  return <div className="rounded-xl border border-dashed border-border p-6 text-center"><ShieldCheck size={22} className="mx-auto text-muted-foreground" /><p className="mt-2 text-sm font-medium text-foreground">No wallet approvers configured</p><p className="mt-1 text-xs text-muted-foreground">Grant access to an active user above.</p></div>;
}
