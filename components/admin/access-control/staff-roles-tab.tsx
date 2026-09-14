"use client";

import { CheckCircle2, RefreshCw, Search, ShieldCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { useAppDialog } from "@/components/providers/app-dialog";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import type {
  ApiEnvelope,
  AuditFocus,
  MutationReceipt,
  StaffEmployeeRecord,
  StaffInvitationRecord,
  StaffRoleCandidate,
  StaffPermissionRecord,
  StaffRoleAssignmentRecord,
  StaffRoleRecord,
} from "@/components/admin/access-control/types";
import { errorMessage } from "@/components/admin/access-control/types";
import { Button } from "@/components/ui/button";

type RolesPayload = {
  roles: StaffRoleRecord[];
  assignments: StaffRoleAssignmentRecord[];
  employees: StaffEmployeeRecord[];
};

type PermissionsPayload = { permissions: StaffPermissionRecord[] };
type CandidatesPayload = { candidates: StaffRoleCandidate[] };
type InvitationsPayload = { invitations: StaffInvitationRecord[] };

type RoleForm = {
  id: string | null;
  name: string;
  description: string;
  permissionKeys: string[];
  active: boolean;
  reason: string;
};

const EMPTY_FORM: RoleForm = {
  id: null,
  name: "",
  description: "",
  permissionKeys: [],
  active: true,
  reason: "",
};

const PERMISSION_LABEL_KEYS: Partial<Record<string, string>> = {
  "admin.kyc.review": "accessControl.staffRoles.permissionLabels.kycReview",
  "admin.withdrawal.approve": "accessControl.staffRoles.permissionLabels.withdrawalApprove",
  "admin.vendor.manage": "accessControl.staffRoles.permissionLabels.vendorManage",
  "admin.map_campaign.manage": "accessControl.staffRoles.permissionLabels.mapCampaignManage",
};

export function StaffRolesTab({ onViewAudit }: { onViewAudit: (focus: AuditFocus) => void }) {
  const { t, i18n } = useTranslation("admin");
  const { prompt } = useAppDialog();
  const [roles, setRoles] = useState<StaffRoleRecord[]>([]);
  const [assignments, setAssignments] = useState<StaffRoleAssignmentRecord[]>([]);
  const [employees, setEmployees] = useState<StaffEmployeeRecord[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitationRecord[]>([]);
  const [permissions, setPermissions] = useState<StaffPermissionRecord[]>([]);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
  const [assignmentRoleId, setAssignmentRoleId] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [staffCandidates, setStaffCandidates] = useState<StaffRoleCandidate[]>([]);
  const [staffSearchAttempted, setStaffSearchAttempted] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffRoleCandidate | null>(null);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRoleId, setInvitationRoleId] = useState("");
  const [invitationReason, setInvitationReason] = useState("");
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [assignmentConfirmOpen, setAssignmentConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchingStaff, setSearchingStaff] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<MutationReceipt | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const staffSearchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [permissionsResponse, rolesResponse, invitationsResponse] = await Promise.all([
        fetch("/api/admin/access-control/staff-permissions", { cache: "no-store" }),
        fetch("/api/admin/access-control/staff-roles", { cache: "no-store" }),
        fetch("/api/admin/access-control/staff-invitations", { cache: "no-store" }),
      ]);
      const permissionsBody = await permissionsResponse.json() as ApiEnvelope<PermissionsPayload>;
      const rolesBody = await rolesResponse.json() as ApiEnvelope<RolesPayload>;
      const invitationsBody = await invitationsResponse.json() as ApiEnvelope<InvitationsPayload>;
      if (!permissionsResponse.ok || !permissionsBody.data) {
        throw new Error(errorMessage(permissionsBody, t("accessControl.errors.loadStaffRoles")));
      }
      if (!rolesResponse.ok || !rolesBody.data) {
        throw new Error(errorMessage(rolesBody, t("accessControl.errors.loadStaffRoles")));
      }
      if (!invitationsResponse.ok || !invitationsBody.data) {
        throw new Error(errorMessage(invitationsBody, t("accessControl.errors.loadStaffRoles")));
      }
      setPermissions(permissionsBody.data.permissions);
      setRoles(rolesBody.data.roles);
      setAssignments(rolesBody.data.assignments);
      setEmployees(rolesBody.data.employees ?? []);
      setInvitations(invitationsBody.data.invitations);
      const firstCustomRole = rolesBody.data.roles.find((role) => role.isActive && !role.isSystem)?.id ?? "";
      setAssignmentRoleId((current) => current || firstCustomRole);
      setInvitationRoleId((current) => current || firstCustomRole);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.loadStaffRoles"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  const permissionsByModule = useMemo(() => {
    const grouped = new Map<string, StaffPermissionRecord[]>();
    for (const permission of permissions) {
      grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission]);
    }
    return [...grouped.entries()];
  }, [permissions]);

  const permissionsByKey = useMemo(
    () => new Map(permissions.map((permission) => [permission.key, permission])),
    [permissions],
  );
  const selectedAssignmentRole = roles.find((role) => role.id === assignmentRoleId) ?? null;
  const selectedInvitationRole = roles.find((role) => role.id === invitationRoleId && !role.isSystem) ?? null;
  const invitationLocale = i18n.resolvedLanguage?.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : i18n.resolvedLanguage?.toLowerCase().startsWith("ms") ? "ms" : "en";
  const selectedAssignmentPermissions = selectedAssignmentRole?.permissionKeys.map((key) => ({
    key,
    label: permissionLabel(key),
  })) ?? [];
  const alreadyAssigned = Boolean(selectedStaff && assignments.some((assignment) =>
    assignment.roleId === assignmentRoleId
    && assignment.userId === selectedStaff.id
    && !assignment.revokedAt));

  function permissionLabel(key: string) {
    const permission = permissionsByKey.get(key);
    const translationKey = PERMISSION_LABEL_KEYS[key];
    if (!translationKey) return permission?.description ?? key;
    return t(translationKey);
  }

  function editRole(role: StaffRoleRecord) {
    setReceipt(null);
    setFeedbackMessage("");
    setForm({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      permissionKeys: [...role.permissionKeys],
      active: role.isActive,
      reason: "",
    });
  }

  function selectRoleForAssignment(roleId: string) {
    setAssignmentRoleId(roleId);
    setAssignmentConfirmOpen(false);
    setTimeout(() => staffSearchInputRef.current?.focus(), 0);
  }

  function copyRoleTemplate(role: StaffRoleRecord) {
    const proposedName = role.name === "Sponsored Placement Manager"
      ? "Sponsor Manager"
      : role.name === "Legacy Wallet Approver"
        ? "Wallet Approver"
        : role.name === "Legacy Admin" ? "Admin Reviewer" : `${role.name} Copy`.slice(0, 20);
    setForm({ ...EMPTY_FORM, name: proposedName, description: role.description ?? "", permissionKeys: [...role.permissionKeys] });
    setFeedbackMessage("");
    setReceipt(null);
  }

  function togglePermission(key: string, selected: boolean) {
    setForm((current) => ({
      ...current,
      permissionKeys: selected
        ? [...current.permissionKeys, key]
        : current.permissionKeys.filter((permissionKey) => permissionKey !== key),
    }));
  }

  async function saveRole() {
    setSaving(true);
    setError("");
    try {
      const editing = Boolean(form.id);
      const response = await fetch(
        editing ? `/api/admin/access-control/staff-roles/${form.id}` : "/api/admin/access-control/staff-roles",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim(),
            permissionKeys: form.permissionKeys,
            ...(editing ? { active: form.active } : {}),
            reason: form.reason.trim(),
          }),
        },
      );
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) {
        throw new Error(errorMessage(body, t("accessControl.errors.saveStaffRole")));
      }
      setReceipt(body.data);
      setFeedbackMessage(t("accessControl.feedback.staffRoleUpdated"));
      setForm(EMPTY_FORM);
      setConfirmOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.saveStaffRole"));
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function assignRole() {
    if (!selectedStaff || !selectedAssignmentRole || alreadyAssigned) return;
    const grantedStaff = selectedStaff;
    const grantedRole = selectedAssignmentRole;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/access-control/staff-roles/${assignmentRoleId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedStaff.id, reason: assignmentReason.trim() }),
      });
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) {
        throw new Error(errorMessage(body, t("accessControl.errors.assignStaffRole")));
      }
      setReceipt(body.data);
      setFeedbackMessage(t("accessControl.feedback.staffRoleGranted", {
        employee: grantedStaff.name,
        role: grantedRole.name,
      }));
      setStaffSearch("");
      setStaffCandidates([]);
      setStaffSearchAttempted(false);
      setSelectedStaff(null);
      setAssignmentReason("");
      setAssignmentConfirmOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.assignStaffRole"));
      setAssignmentConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function sendInvitation() {
    if (!selectedInvitationRole) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/access-control/staff-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invitationEmail.trim(),
          staffRoleId: selectedInvitationRole.id,
          locale: invitationLocale,
          reason: invitationReason.trim(),
        }),
      });
      const body = await response.json() as ApiEnvelope<{ id: string }>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.staffRoles.invitationError")));
      setInvitationEmail(""); setInvitationReason(""); setInviteConfirmOpen(false);
      setFeedbackMessage(t("accessControl.staffRoles.invitationSent"));
      await load();
    } catch (caught) {
      setInviteConfirmOpen(false);
      setError(caught instanceof Error ? caught.message : t("accessControl.staffRoles.invitationError"));
    } finally { setSaving(false); }
  }

  async function resendInvitation(invitationId: string) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/access-control/staff-invitations/${invitationId}/resend`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: invitationLocale }),
      });
      const body = await response.json() as ApiEnvelope<{ id: string }>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.staffRoles.invitationError")));
      setFeedbackMessage(t("accessControl.staffRoles.invitationResent"));
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.staffRoles.invitationError")); }
    finally { setSaving(false); }
  }

  async function revokeInvitation(invitationId: string) {
    const reason = (await prompt(t("accessControl.staffRoles.revokeReasonPrompt")))?.trim();
    if (!reason || reason.length < 10) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/access-control/staff-invitations/${invitationId}/revoke`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      const body = await response.json() as ApiEnvelope<{ id: string }>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.staffRoles.invitationError")));
      setFeedbackMessage(t("accessControl.staffRoles.invitationRevoked"));
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("accessControl.staffRoles.invitationError")); }
    finally { setSaving(false); }
  }

  async function searchStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = staffSearch.trim();
    if (!search) return;
    setSearchingStaff(true);
    setStaffSearchAttempted(false);
    setError("");
    setSelectedStaff(null);
    try {
      const query = new URLSearchParams({ search });
      const response = await fetch(`/api/admin/access-control/staff-candidates?${query.toString()}`, {
        cache: "no-store",
      });
      const body = await response.json() as ApiEnvelope<CandidatesPayload>;
      if (!response.ok || !body.data) {
        throw new Error(errorMessage(body, t("accessControl.errors.loadStaffCandidates")));
      }
      setStaffCandidates(body.data.candidates);
      setStaffSearchAttempted(true);
    } catch (caught) {
      setStaffCandidates([]);
      setStaffSearchAttempted(true);
      setError(caught instanceof Error
        ? caught.message
        : t("accessControl.errors.loadStaffCandidates"));
    } finally {
      setSearchingStaff(false);
    }
  }

  const roleSaveDisabled = !form.name.trim() || form.reason.trim().length < 10;
  const invitationReviewDisabled = !selectedInvitationRole || !/^\S+@\S+\.\S+$/.test(invitationEmail.trim()) || invitationReason.trim().length < 10 || saving;
  const assignmentReviewDisabled = !selectedAssignmentRole
    || !selectedStaff
    || assignmentReason.trim().length < 10
    || alreadyAssigned
    || saving;

  return <div className="space-y-5">
    {receipt && <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
      <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{feedbackMessage}</span>
      <Button size="sm" variant="outline" onClick={() => onViewAudit({ eventId: receipt.auditEventId, entityId: receipt.roleId ?? receipt.assignmentId })}>{t("accessControl.actions.viewAuditEvent")}</Button>
    </div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">{t(form.id ? "accessControl.staffRoles.editTitle" : "accessControl.staffRoles.createTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("accessControl.staffRoles.editorHelp")}</p>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} />{t("accessControl.actions.refresh")}</Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field htmlFor="role-name" label={t("accessControl.staffRoles.name")}><input id="role-name" name="role-name" maxLength={20} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
          <Field htmlFor="role-description" label={t("accessControl.staffRoles.description")}><textarea id="role-description" name="role-description" maxLength={100} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /></Field>
        </div>
        {form.id && <label className="mt-3 flex items-center gap-2 text-sm font-medium" htmlFor="role-active"><input id="role-active" type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>{t("accessControl.staffRoles.active")}</span></label>}
        <fieldset className="mt-4 space-y-4">
          <legend className="text-sm font-semibold">{t("accessControl.staffRoles.permissions")}</legend>
          {permissionsByModule.map(([module, modulePermissions]) => <div key={module} className="rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{module}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{modulePermissions.map((permission) => <label key={permission.key} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3 text-sm">
              <input type="checkbox" checked={form.permissionKeys.includes(permission.key)} onChange={(event) => togglePermission(permission.key, event.target.checked)} />
              <span><span className="block font-medium">{permissionLabel(permission.key)}</span><span className="mt-1 block font-mono text-xs text-muted-foreground">{permission.key}</span></span>
            </label>)}</div>
          </div>)}
        </fieldset>
        <Field htmlFor="role-reason" label={t("accessControl.forms.reason")}><textarea id="role-reason" name="role-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={500} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /></Field>
        <div className="mt-4 flex justify-end gap-2">{form.id && <Button variant="outline" onClick={() => setForm(EMPTY_FORM)}>{t("accessControl.actions.cancel")}</Button>}<Button disabled={roleSaveDisabled || saving} onClick={() => setConfirmOpen(true)}><ShieldCheck />{t("accessControl.staffRoles.reviewSave")}</Button></div>
      </section>

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("accessControl.staffRoles.rolesTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("accessControl.staffRoles.rolesHelp")}</p>
          <div className="mt-3 space-y-3">{roles.map((role) => <article key={role.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="flex flex-wrap items-center gap-2 font-medium">{role.name}<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{t(role.isSystem ? "accessControl.staffRoles.systemPreset" : "accessControl.staffRoles.customRole")}</span></span>
                {role.description && <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${role.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{t(role.isActive ? "accessControl.status.active" : "accessControl.status.inactive")}</span>
            </div>
            <ul className="mt-3 space-y-1.5">{role.permissionKeys.map((key) => <li key={key} className="rounded-lg bg-muted/30 px-3 py-2">
              <span className="block text-xs font-medium">{permissionLabel(key)}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">{key}</span>
            </li>)}</ul>
            <div className="mt-3 flex justify-end gap-2">
              {!role.isSystem && <Button size="sm" variant="outline" onClick={() => editRole(role)}>{t("accessControl.staffRoles.editRole")}</Button>}
              <Button size="sm" variant="outline" disabled={!role.isActive} onClick={() => copyRoleTemplate(role)}>{t("accessControl.staffRoles.useTemplate")}</Button>
              {!role.isSystem && <Button size="sm" variant="outline" disabled={!role.isActive} onClick={() => { setInvitationRoleId(role.id); selectRoleForAssignment(role.id); }}>{t("accessControl.staffRoles.useRole")}</Button>}
            </div>
          </article>)}</div>
          {!loading && roles.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t("accessControl.states.noStaffRoles")}</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t("accessControl.staffRoles.inviteTitle")}</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">{t("accessControl.staffRoles.inviteHelp")}</p>
          <Field htmlFor="invitation-role" label={t("accessControl.staffRoles.inviteRole")}><select id="invitation-role" value={invitationRoleId} onChange={(event) => setInvitationRoleId(event.target.value)} className={`${adminFilterControlClassName} w-full`}><option value="">{t("accessControl.staffRoles.selectCustomRole")}</option>{roles.filter((role) => role.isActive && !role.isSystem).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
          <Field htmlFor="invitation-email" label={t("accessControl.staffRoles.inviteEmail")}><input id="invitation-email" type="email" value={invitationEmail} onChange={(event) => setInvitationEmail(event.target.value)} placeholder={t("accessControl.staffRoles.inviteEmailPlaceholder")} className={`${adminFilterControlClassName} w-full`} /></Field>
          <Field htmlFor="invitation-reason" label={t("accessControl.staffRoles.inviteReason")}><textarea id="invitation-reason" value={invitationReason} onChange={(event) => setInvitationReason(event.target.value)} maxLength={500} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.staffRoles.inviteReasonPlaceholder")} /></Field>
          {selectedInvitationRole && <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3"><p className="text-sm font-semibold">{selectedInvitationRole.name}</p><ul className="mt-2 space-y-1">{selectedInvitationRole.permissionKeys.map((key) => <li key={key} className="text-xs text-muted-foreground">{permissionLabel(key)}</li>)}</ul></div>}
          <Button className="mt-4 w-full" disabled={invitationReviewDisabled} onClick={() => setInviteConfirmOpen(true)}>{t("accessControl.staffRoles.reviewInvitation")}</Button>
          <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold">{t("accessControl.staffRoles.pendingInvitations")}</h3>{invitations.filter((item) => item.status === "pending").length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("accessControl.staffRoles.noPendingInvitations")}</p> : <ul className="mt-2 space-y-2">{invitations.filter((item) => item.status === "pending").map((item) => <li key={item.id} className="rounded-xl border border-border p-3 text-xs"><p className="font-semibold text-foreground">{item.invitedEmail}</p><p className="mt-1 text-muted-foreground"><span>{item.roleName}</span><span aria-hidden="true"> · </span><span>{t(`accessControl.staffRoles.delivery.${item.deliveryStatus}`)}</span></p><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={() => void resendInvitation(item.id)}>{t("accessControl.staffRoles.resendInvitation")}</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => void revokeInvitation(item.id)}>{t("accessControl.staffRoles.revokeInvitation")}</Button></div></li>)}</ul>}</div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t("accessControl.staffRoles.assignmentTitle")}</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">{t("accessControl.staffRoles.assignmentHelp")}</p>
          <ol className="mt-4 space-y-4">
            <li className="rounded-xl border border-border p-4">
              <label htmlFor="assignment-role" className="text-sm font-semibold">{t("accessControl.staffRoles.stepRole")}</label>
              <p className="mt-1 text-xs text-muted-foreground">{t("accessControl.staffRoles.stepRoleHelp")}</p>
              <select id="assignment-role" value={assignmentRoleId} onChange={(event) => { setAssignmentRoleId(event.target.value); setAssignmentConfirmOpen(false); }} className={`${adminFilterControlClassName} mt-3 w-full`}>
                <option value="">{t("accessControl.staffRoles.selectRole")}</option>
                {roles.filter((role) => role.isActive && !role.isSystem).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
              {selectedAssignmentRole && <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{selectedAssignmentRole.name}</span><span className="rounded-full bg-background px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{t(selectedAssignmentRole.isSystem ? "accessControl.staffRoles.systemPreset" : "accessControl.staffRoles.customRole")}</span></div>
                <p className="mt-2 text-xs font-medium">{t("accessControl.staffRoles.addsPermissions", { count: selectedAssignmentPermissions.length })}</p>
                <ul className="mt-2 space-y-1">{selectedAssignmentPermissions.map((permission) => <li key={permission.key} className="text-xs"><span className="font-medium">{permission.label}</span><span className="ml-1 font-mono text-muted-foreground">({permission.key})</span></li>)}</ul>
                <p className="mt-2 text-xs text-muted-foreground">{t("accessControl.staffRoles.existingPermissionsUnchanged")}</p>
              </div>}
            </li>

            <li className="rounded-xl border border-border p-4">
              <label htmlFor="staff-search" className="text-sm font-semibold">{t("accessControl.staffRoles.stepEmployee")}</label>
              <p className="mt-1 text-xs text-muted-foreground">{t("accessControl.staffRoles.employeeHelp")}</p>
              <form onSubmit={(event) => void searchStaff(event)} className="mt-3 flex gap-2">
                <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input ref={staffSearchInputRef} id="staff-search" name="staff-search" maxLength={100} value={staffSearch} onChange={(event) => { setStaffSearch(event.target.value); setStaffCandidates([]); setStaffSearchAttempted(false); setSelectedStaff(null); setAssignmentConfirmOpen(false); }} placeholder={t("accessControl.staffRoles.staffSearchPlaceholder")} className={`${adminFilterControlClassName} w-full pl-9`} /></div>
                <Button type="submit" size="sm" variant="outline" disabled={!staffSearch.trim() || searchingStaff}>{t(searchingStaff ? "accessControl.staffRoles.searchingStaff" : "accessControl.staffRoles.searchStaff")}</Button>
              </form>
              <div role="status" aria-live="polite">
                {staffCandidates.length > 0 && <ul className="mt-2 space-y-2 rounded-xl border border-border p-2">{staffCandidates.map((candidate) => <li key={candidate.id}><button type="button" onClick={() => { setSelectedStaff(candidate); setStaffCandidates([]); setAssignmentConfirmOpen(false); }} className="block w-full rounded-lg p-2 text-left text-sm hover:bg-muted/50"><span className="block font-medium">{candidate.name}</span><span className="block text-xs text-muted-foreground">{candidate.email} · {candidate.roles.join(", ")}</span></button></li>)}</ul>}
                {selectedStaff && <div className="mt-2 rounded-xl border border-primary/25 bg-primary/10 p-3 text-sm"><span className="block text-xs font-semibold uppercase tracking-wide text-primary">{t("accessControl.staffRoles.selectedEmployee")}</span><span className="mt-1 block font-medium">{selectedStaff.name}</span><span className="text-xs text-muted-foreground">{selectedStaff.email} · {selectedStaff.roles.join(", ")}</span></div>}
                {staffSearchAttempted && !searchingStaff && !selectedStaff && staffCandidates.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("accessControl.staffRoles.noStaffResults")}</p>}
                {alreadyAssigned && <p className="mt-2 rounded-lg border border-amber-300/40 bg-amber-50/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{t("accessControl.staffRoles.alreadyAssigned")}</p>}
              </div>
            </li>

            <li className="rounded-xl border border-border p-4">
              <label htmlFor="assignment-reason" className="text-sm font-semibold">{t("accessControl.staffRoles.stepReason")}</label>
              <p className="mt-1 text-xs text-muted-foreground">{t("accessControl.staffRoles.assignmentReasonHelp")}</p>
              <textarea id="assignment-reason" name="assignment-reason" value={assignmentReason} onChange={(event) => { setAssignmentReason(event.target.value); setAssignmentConfirmOpen(false); }} maxLength={500} className="mt-3 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.staffRoles.assignmentReasonPlaceholder")} />
            </li>
          </ol>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{t("accessControl.staffRoles.assignmentCount", { count: assignments.filter((item) => !item.revokedAt).length })}</span><Button size="sm" disabled={assignmentReviewDisabled} onClick={() => setAssignmentConfirmOpen(true)}>{t("accessControl.staffRoles.reviewGrant", { count: selectedAssignmentPermissions.length })}</Button></div>
          {employees.length > 0 && <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold">{t("accessControl.staffRoles.joinedEmployees")}</h3><ul className="mt-2 space-y-2">{employees.map((employee) => <li key={employee.id} className="rounded-xl border border-border p-3 text-xs"><p className="font-semibold text-foreground">{employee.name}</p><p className="text-muted-foreground">{employee.email}</p><p className="mt-1 text-muted-foreground">{t("accessControl.staffRoles.assignmentCount", { count: employee.assignments.length })}</p></li>)}</ul></div>}
        </section>
      </div>
    </div>
    <AdminConfirmDialog open={confirmOpen} title={t("accessControl.staffRoles.confirmTitle")} description={t("accessControl.staffRoles.confirmDescription")} confirmLabel="accessControl.staffRoles.confirmSave" busy={saving} onCancel={() => setConfirmOpen(false)} onConfirm={() => void saveRole()} />
    <AdminConfirmDialog open={inviteConfirmOpen} title={t("accessControl.staffRoles.confirmInvitationTitle")} description={selectedInvitationRole ? <div className="space-y-2 text-sm"><p>{invitationEmail.trim()}</p><p className="font-semibold">{selectedInvitationRole.name}</p><ul>{selectedInvitationRole.permissionKeys.map((key) => <li key={key}>{permissionLabel(key)}</li>)}</ul><p>{invitationReason.trim()}</p></div> : t("accessControl.staffRoles.inviteHelp")} confirmLabel="accessControl.staffRoles.sendInvitation" busy={saving} onCancel={() => setInviteConfirmOpen(false)} onConfirm={() => void sendInvitation()} />
    <AdminConfirmDialog
      open={assignmentConfirmOpen}
      title={t("accessControl.staffRoles.confirmGrantTitle")}
      description={selectedStaff && selectedAssignmentRole ? <div className="space-y-3">
        <dl className="space-y-2">
          <div><dt className="font-medium text-foreground">{t("accessControl.staffRoles.confirmEmployee")}</dt><dd>{selectedStaff.name} · {selectedStaff.email}</dd></div>
          <div><dt className="font-medium text-foreground">{t("accessControl.staffRoles.confirmRole")}</dt><dd>{selectedAssignmentRole.name}</dd></div>
          <div><dt className="font-medium text-foreground">{t("accessControl.staffRoles.confirmPermissions")}</dt><dd><ul className="mt-1 space-y-1">{selectedAssignmentPermissions.map((permission) => <li key={permission.key}><span className="font-medium">{permission.label}</span> <span className="font-mono text-xs">({permission.key})</span></li>)}</ul></dd></div>
          <div><dt className="font-medium text-foreground">{t("accessControl.staffRoles.confirmReason")}</dt><dd>{assignmentReason.trim()}</dd></div>
        </dl>
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs">{t("accessControl.staffRoles.existingPermissionsUnchanged")}</p>
      </div> : "accessControl.staffRoles.confirmDescription"}
      confirmLabel="accessControl.staffRoles.grantPermissions"
      busy={saving}
      onCancel={() => setAssignmentConfirmOpen(false)}
      onConfirm={() => void assignRole()}
    />
  </div>;
}

function Field({ htmlFor, label, children }: { htmlFor: string; label: string; children: React.ReactNode }) {
  return <div className="mt-3"><label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label><div className="mt-1">{children}</div></div>;
}
