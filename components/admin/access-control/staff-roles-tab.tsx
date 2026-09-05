"use client";

import { CheckCircle2, RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import type {
  ApiEnvelope,
  AuditFocus,
  MutationReceipt,
  StaffPermissionRecord,
  StaffRoleAssignmentRecord,
  StaffRoleRecord,
} from "@/components/admin/access-control/types";
import { errorMessage } from "@/components/admin/access-control/types";
import { Button } from "@/components/ui/button";

type RolesPayload = {
  roles: StaffRoleRecord[];
  assignments: StaffRoleAssignmentRecord[];
};

type PermissionsPayload = { permissions: StaffPermissionRecord[] };

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

export function StaffRolesTab({ onViewAudit }: { onViewAudit: (focus: AuditFocus) => void }) {
  const { t } = useTranslation("admin");
  const [roles, setRoles] = useState<StaffRoleRecord[]>([]);
  const [assignments, setAssignments] = useState<StaffRoleAssignmentRecord[]>([]);
  const [permissions, setPermissions] = useState<StaffPermissionRecord[]>([]);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
  const [assignmentRoleId, setAssignmentRoleId] = useState("");
  const [assignmentUserId, setAssignmentUserId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<MutationReceipt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [permissionsResponse, rolesResponse] = await Promise.all([
        fetch("/api/admin/access-control/staff-permissions", { cache: "no-store" }),
        fetch("/api/admin/access-control/staff-roles", { cache: "no-store" }),
      ]);
      const permissionsBody = await permissionsResponse.json() as ApiEnvelope<PermissionsPayload>;
      const rolesBody = await rolesResponse.json() as ApiEnvelope<RolesPayload>;
      if (!permissionsResponse.ok || !permissionsBody.data) {
        throw new Error(errorMessage(permissionsBody, t("accessControl.errors.loadStaffRoles")));
      }
      if (!rolesResponse.ok || !rolesBody.data) {
        throw new Error(errorMessage(rolesBody, t("accessControl.errors.loadStaffRoles")));
      }
      setPermissions(permissionsBody.data.permissions);
      setRoles(rolesBody.data.roles);
      setAssignments(rolesBody.data.assignments);
      setAssignmentRoleId((current) => current || rolesBody.data?.roles.find((role) => role.isActive)?.id || "");
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

  function editRole(role: StaffRoleRecord) {
    setReceipt(null);
    setForm({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      permissionKeys: [...role.permissionKeys],
      active: role.isActive,
      reason: "",
    });
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
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/access-control/staff-roles/${assignmentRoleId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignmentUserId.trim(), reason: assignmentReason.trim() }),
      });
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) {
        throw new Error(errorMessage(body, t("accessControl.errors.assignStaffRole")));
      }
      setReceipt(body.data);
      setAssignmentUserId("");
      setAssignmentReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.assignStaffRole"));
    } finally {
      setSaving(false);
    }
  }

  const roleSaveDisabled = !form.name.trim() || form.reason.trim().length < 10;

  return <div className="space-y-5">
    {receipt && <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{t("accessControl.feedback.staffRoleUpdated")}</span><Button size="sm" variant="outline" onClick={() => onViewAudit({ eventId: receipt.auditEventId, entityId: receipt.roleId ?? receipt.assignmentId })}>{t("accessControl.actions.viewAuditEvent")}</Button></div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{t(form.id ? "accessControl.staffRoles.editTitle" : "accessControl.staffRoles.createTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("accessControl.staffRoles.editorHelp")}</p></div><Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} />{t("accessControl.actions.refresh")}</Button></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label={t("accessControl.staffRoles.name")}><input name="role-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
          <Field label={t("accessControl.staffRoles.description")}><textarea name="role-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /></Field>
        </div>
        {form.id && <label className="mt-3 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>{t("accessControl.staffRoles.active")}</span></label>}
        <fieldset className="mt-4 space-y-4"><legend className="text-sm font-semibold">{t("accessControl.staffRoles.permissions")}</legend>{permissionsByModule.map(([module, modulePermissions]) => <div key={module} className="rounded-xl border border-border p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{module}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{modulePermissions.map((permission) => <label key={permission.key} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3 text-sm"><input type="checkbox" checked={form.permissionKeys.includes(permission.key)} onChange={(event) => togglePermission(permission.key, event.target.checked)} /><span><span className="block font-mono text-xs font-semibold">{permission.key}</span><span className="mt-1 block text-xs text-muted-foreground">{permission.description}</span></span></label>)}</div></div>)}</fieldset>
        <Field label={t("accessControl.forms.reason")}><textarea name="role-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={500} className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder={t("accessControl.forms.reasonPlaceholder")} /></Field>
        <div className="mt-4 flex justify-end gap-2">{form.id && <Button variant="outline" onClick={() => setForm(EMPTY_FORM)}>{t("accessControl.actions.cancel")}</Button>}<Button disabled={roleSaveDisabled || saving} onClick={() => setConfirmOpen(true)}><ShieldCheck />{t("accessControl.staffRoles.reviewSave")}</Button></div>
      </section>

      <div className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{t("accessControl.staffRoles.rolesTitle")}</h2><div className="mt-3 space-y-2">{roles.map((role) => <button key={role.id} type="button" onClick={() => editRole(role)} className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left hover:bg-muted/30"><span><span className="block font-medium">{role.name}</span><span className="text-xs text-muted-foreground">{t("accessControl.staffRoles.permissionCount", { count: role.permissionKeys.length })}</span></span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${role.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{t(role.isActive ? "accessControl.status.active" : "accessControl.status.inactive")}</span></button>)}</div>{!loading && roles.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t("accessControl.states.noStaffRoles")}</p>}</section>

        <section className="rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /><h2 className="font-semibold">{t("accessControl.staffRoles.assignmentTitle")}</h2></div><Field label={t("accessControl.staffRoles.role")}><select value={assignmentRoleId} onChange={(event) => setAssignmentRoleId(event.target.value)} className={`${adminFilterControlClassName} w-full`}><option value="">{t("accessControl.staffRoles.selectRole")}</option>{roles.filter((role) => role.isActive).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field><Field label={t("accessControl.staffRoles.userId")}><input value={assignmentUserId} onChange={(event) => setAssignmentUserId(event.target.value)} className={`${adminFilterControlClassName} w-full`} /></Field><Field label={t("accessControl.forms.reason")}><textarea value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} maxLength={500} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /></Field><div className="mt-3 flex justify-between gap-3 text-xs text-muted-foreground"><span>{t("accessControl.staffRoles.assignmentCount", { count: assignments.filter((item) => !item.revokedAt).length })}</span><Button size="sm" disabled={!assignmentRoleId || !assignmentUserId.trim() || assignmentReason.trim().length < 10 || saving} onClick={() => void assignRole()}>{t("accessControl.staffRoles.assign")}</Button></div></section>
      </div>
    </div>
    <AdminConfirmDialog open={confirmOpen} title={t("accessControl.staffRoles.confirmTitle")} description={t("accessControl.staffRoles.confirmDescription")} confirmLabel="accessControl.staffRoles.confirmSave" busy={saving} onCancel={() => setConfirmOpen(false)} onConfirm={() => void saveRole()} />
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-3 block text-sm font-medium"><span>{label}</span><div className="mt-1">{children}</div></label>;
}
