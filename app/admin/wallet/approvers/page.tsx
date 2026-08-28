"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ShieldCheck, UserPlus, UserRoundCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { WALLET_REASON_CATEGORIES } from "@/lib/validation/wallet-reason-schemas";

type Approver = {
  id: string;
  email: string;
  name: string;
  accountStatus: string;
  active: boolean;
  grantedAt: string | null;
};

type EligibleUser = { id: string; email: string; name: string };
type RoleAction = { userId: string; action: "grant" | "revoke"; name: string } | null;

export default function WalletApproversPage() {
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [reasonCategory, setReasonCategory] = useState("other");
  const [reason, setReason] = useState("");
  const [pendingRoleAction, setPendingRoleAction] = useState<RoleAction>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadApprovers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/wallet-approvers", { cache: "no-store" });
      const body = await response.json() as {
        data?: { items: Approver[]; eligibleUsers?: EligibleUser[] };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("ui.walletSettings.errors.loadApprovers"));
      setApprovers(body.data.items);
      setEligibleUsers(body.data.eligibleUsers ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("ui.walletSettings.errors.loadApprovers"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadApprovers(); }, [loadApprovers]);

  function requestRoleChange(action: Exclude<RoleAction, null>) {
    setError("");
    if (reason.trim().length < 10) {
      setError(t("ui.walletSettings.errors.roleReason"));
      return;
    }
    setPendingRoleAction(action);
  }

  async function changeRole() {
    if (!pendingRoleAction || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/wallet-approvers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: pendingRoleAction.userId,
          action: pendingRoleAction.action,
          reasonCategory,
          reason: reason.trim(),
        }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t("ui.walletSettings.errors.changeApprover"));
      showFeedback("success", t("ui.walletSettings.roleChanged", {
        action: t(`ui.walletSettings.roleActions.${pendingRoleAction.action}`),
      }));
      setPendingRoleAction(null);
      setSelectedUser("");
      setReason("");
      setReasonCategory("other");
      await loadApprovers();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("ui.walletSettings.errors.changeApprover");
      setError(message);
      showFeedback("error", message);
    } finally {
      setBusy(false);
    }
  }

  const selectedEligible = eligibleUsers.find((user) => user.id === selectedUser);

  return (
    <AdminPageShell>
      <Link href="/admin/wallet/settings" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft size={16} /> {t("ui.walletApprovers.backToSettings")}
      </Link>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><ShieldCheck size={14} /> {t("ui.walletApprovers.eyebrow")}</span>}
        title={t("ui.walletApprovers.title")}
        description={t("ui.walletApprovers.description")}
      />

      {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle size={16} /> {error}</p>}

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary"><UserPlus size={18} /></span>
          <div><h2 className="font-semibold text-foreground">{t("ui.walletApprovers.grantTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("ui.walletApprovers.grantDescription")}</p></div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="text-sm"><span className="mb-1.5 block font-medium text-foreground">{t("ui.walletApprovers.userLabel")}</span><select value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} className={`${adminFilterControlClassName} w-full`}><option value="">{t("ui.walletApprovers.selectUser")}</option>{eligibleUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>
          <label className="text-sm"><span className="mb-1.5 block font-medium text-foreground">{t("ui.walletSettings.audit.category")}</span><select value={reasonCategory} onChange={(event) => setReasonCategory(event.target.value)} className={`${adminFilterControlClassName} w-full`}>{WALLET_REASON_CATEGORIES.approver_role.map((category) => <option key={category} value={category}>{t(`ui.walletApprovers.reasonCategories.${category}`)}</option>)}</select></label>
          <label className="text-sm lg:col-span-2"><span className="mb-1.5 block font-medium text-foreground">{t("ui.walletSettings.audit.reasonLabel")}</span><textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("ui.walletApprovers.reasonPlaceholder")} className={`${adminFilterControlClassName} min-h-24 w-full resize-none py-3`} /><span className="mt-1 block text-right text-[11px] text-muted-foreground">{reason.length}/500</span></label>
        </div>
        <div className="mt-4 flex justify-end"><Button disabled={!selectedEligible || busy} onClick={() => selectedEligible && requestRoleChange({ userId: selectedEligible.id, action: "grant", name: selectedEligible.name })}><UserPlus size={15} /> {t("ui.walletApprovers.grant")}</Button></div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-semibold text-foreground">{t("ui.walletApprovers.currentTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("ui.walletApprovers.currentDescription")}</p>
        {loading ? <p className="mt-5 text-sm text-muted-foreground">{t("ui.walletApprovers.loading")}</p> : approvers.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center"><UserRoundCheck size={22} className="mx-auto text-muted-foreground" /><p className="mt-2 text-sm font-medium text-foreground">{t("ui.walletSettings.emptyApprovers.title")}</p></div> : <div className="mt-5 divide-y divide-border rounded-xl border border-border">{approvers.map((approver) => <div key={approver.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div><p className="font-medium text-foreground">{approver.name}</p><p className="text-sm text-muted-foreground">{approver.email}</p><p className="mt-1 text-xs text-muted-foreground">{approver.active ? t("ui.walletApprovers.active") : t("ui.walletApprovers.inactive")}</p></div><Button variant="outline" disabled={busy} className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => requestRoleChange({ userId: approver.id, action: "revoke", name: approver.name })}>{t("ui.walletApprovers.revoke")}</Button></div>)}</div>}
        {!loading && error && <Button className="mt-4" variant="outline" onClick={() => void loadApprovers()}>{t("ui.walletSettings.retry")}</Button>}
      </section>

      <AdminConfirmDialog
        open={Boolean(pendingRoleAction)}
        title={pendingRoleAction ? t(`ui.walletSettings.confirm.role.${pendingRoleAction.action}.title`) : ""}
        description={pendingRoleAction ? t("ui.walletSettings.confirm.role.description", { action: t(`ui.walletSettings.roleActions.${pendingRoleAction.action}`), name: pendingRoleAction.name }) : ""}
        confirmLabel={pendingRoleAction ? t(`ui.walletSettings.confirm.role.${pendingRoleAction.action}.confirm`) : ""}
        confirmVariant={pendingRoleAction?.action === "revoke" ? "destructive" : "default"}
        busy={busy}
        onCancel={() => setPendingRoleAction(null)}
        onConfirm={() => void changeRole()}
      />
    </AdminPageShell>
  );
}
