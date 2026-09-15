"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { ApiEnvelope, MutationReceipt, StaffModuleGroupRecord, StaffModuleRecord, StaffPermissionRecord } from "@/components/admin/access-control/types";
import { errorMessage } from "@/components/admin/access-control/types";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";

type Props = {
  modules: StaffModuleRecord[];
  permissions: StaffPermissionRecord[];
  groups: StaffModuleGroupRecord[];
  onSaved: () => Promise<void>;
};

type ModuleForm = {
  id: string | null;
  key: string;
  label: string;
  description: string;
  sectionKey: string;
  sectionLabel: string;
  sectionSortOrder: number;
  href: string;
  iconKey: string;
  sortOrder: number;
  permissionKeys: string[];
  groupKey: string | null;
  active: boolean;
  reason: string;
};

const EMPTY_FORM: ModuleForm = {
  id: null,
  key: "",
  label: "",
  description: "",
  sectionKey: "governance",
  sectionLabel: "Governance",
  sectionSortOrder: 20,
  href: "/admin/",
  iconKey: "activity",
  sortOrder: 10,
  permissionKeys: [],
  groupKey: null,
  active: true,
  reason: "",
};

export function StaffModulesPanel({ modules, permissions, groups, onSaved }: Props) {
  const { t } = useTranslation("admin");
  const [form, setForm] = useState<ModuleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function editModule(module: StaffModuleRecord) {
    setForm({
      id: module.id,
      key: module.key,
      label: module.label,
      description: module.description ?? "",
      sectionKey: module.sectionKey,
      sectionLabel: module.sectionLabel,
      sectionSortOrder: module.sectionSortOrder,
      href: module.href,
      iconKey: module.iconKey,
      sortOrder: module.sortOrder,
      permissionKeys: [...module.permissionKeys],
      groupKey: module.groupKey,
      active: module.isActive,
      reason: "",
    });
    setError("");
  }

  function togglePermission(key: string, selected: boolean) {
    setForm((current) => ({
      ...current,
      permissionKeys: selected
        ? [...current.permissionKeys, key]
        : current.permissionKeys.filter((permissionKey) => permissionKey !== key),
    }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const editing = Boolean(form.id);
      const response = await fetch(
        editing ? `/api/admin/access-control/staff-modules/${form.id}` : "/api/admin/access-control/staff-modules",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(!editing ? { key: form.key.trim() } : {}),
            label: form.label.trim(),
            description: form.description.trim() || null,
            sectionKey: form.sectionKey.trim(),
            sectionLabel: form.sectionLabel.trim(),
            sectionSortOrder: form.sectionSortOrder,
            href: form.href.trim(),
            iconKey: form.iconKey.trim(),
            sortOrder: form.sortOrder,
            permissionKeys: form.permissionKeys,
            groupKey: form.groupKey,
            ...(editing ? { active: form.active } : {}),
            reason: form.reason.trim(),
          }),
        },
      );
      const body = await response.json() as ApiEnvelope<MutationReceipt>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.staffModules.saveError")));
      setForm(EMPTY_FORM);
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.staffModules.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const saveDisabled = !form.label.trim() || !form.sectionKey.trim() || !form.sectionLabel.trim()
    || !/^\/admin(?:\/.*)?$/.test(form.href.trim()) || form.reason.trim().length < 10
    || (!form.id && !/^[a-z][a-z0-9_]*$/.test(form.key.trim()));

  return <section className="rounded-2xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">{t("accessControl.staffModules.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("accessControl.staffModules.help")}</p></div>
      {form.id && <Button size="sm" variant="outline" onClick={() => setForm(EMPTY_FORM)}>{t("accessControl.actions.cancel")}</Button>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <Field label={t("accessControl.staffModules.key")}><input name="module-key" disabled={Boolean(form.id)} value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.label")}><input name="module-label" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.href")}><input name="module-href" value={form.href} onChange={(event) => setForm({ ...form, href: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.sectionKey")}><input name="module-section-key" value={form.sectionKey} onChange={(event) => setForm({ ...form, sectionKey: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.sectionLabel")}><input name="module-section-label" value={form.sectionLabel} onChange={(event) => setForm({ ...form, sectionLabel: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.iconKey")}><input name="module-icon-key" value={form.iconKey} onChange={(event) => setForm({ ...form, iconKey: event.target.value })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.sectionOrder")}><input name="module-section-order" type="number" value={form.sectionSortOrder} onChange={(event) => setForm({ ...form, sectionSortOrder: Number(event.target.value) })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.order")}><input name="module-order" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} className={`${adminFilterControlClassName} w-full`} /></Field>
      <Field label={t("accessControl.staffModules.group")}><select name="module-group" value={form.groupKey ?? ""} disabled={Boolean(form.id && groups.find((group) => group.key === form.groupKey)?.isSystem)} onChange={(event) => setForm({ ...form, groupKey: event.target.value || null })} className={`${adminFilterControlClassName} w-full`}><option value="">{t("accessControl.staffModules.noGroup")}</option>{groups.filter((group) => group.isActive && (!group.isSystem || group.key === form.groupKey)).map((group) => <option key={group.key} value={group.key}>{group.name}</option>)}</select></Field>
    </div>
    <Field label={t("accessControl.staffModules.description")}><textarea name="module-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /></Field>
    <fieldset className="mt-4"><legend className="text-sm font-semibold">{t("accessControl.staffModules.permissions")}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissions.map((permission) => <label key={permission.key} className="flex gap-2 rounded-lg bg-muted/30 p-2 text-xs"><input type="checkbox" checked={form.permissionKeys.includes(permission.key)} onChange={(event) => togglePermission(permission.key, event.target.checked)} /><span><span className="block">{permission.description ?? permission.key}</span><span className="font-mono text-muted-foreground">{permission.key}</span></span></label>)}</div></fieldset>
    {form.id && <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />{t("accessControl.staffModules.active")}</label>}
    <Field label={t("accessControl.forms.reason")}><textarea name="module-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /></Field>
    <div className="mt-4 flex justify-end"><Button disabled={saveDisabled || saving} onClick={() => void save()}>{t(form.id ? "accessControl.staffModules.update" : "accessControl.staffModules.create")}</Button></div>
    <div className="mt-5 grid gap-2 md:grid-cols-2">{modules.map((module) => <article key={module.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{module.label}</p><p className="font-mono text-xs text-muted-foreground">{module.key} · {module.href}</p>{module.groupName && <p className="mt-1 text-xs text-primary">{t("accessControl.staffRoles.lockedGroup", { group: module.groupName })}</p>}</div><Button size="sm" variant="outline" onClick={() => editModule(module)}>{t("accessControl.staffModules.edit")}</Button></div></article>)}</div>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium"><span>{label}</span><span className="mt-1 block">{children}</span></label>;
}
