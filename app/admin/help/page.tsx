"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, LifeBuoy, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { Input } from "@/components/ui/input";
import type { AdminCapability } from "@/lib/admin-ai/capabilities";
import { guideHref, sectionAudience, sectionTitle, useStaffHelpSections, workflowHref } from "./staff-help-sections";

// Staff-facing view of the admin how-to registry the AI assistant answers from.
// The registry's `source` paths and keywords are internal and are not rendered.

function searchableText(capability: AdminCapability): string {
  return [sectionTitle(capability), capability.description, ...capability.actions, ...(capability.notes ?? [])]
    .join(" ")
    .toLowerCase();
}

export default function AdminHelpPage() {
  const { t } = useTranslation("admin");
  const { isSuperAdmin, groups, workflows } = useStaffHelpSections();
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({ ...group, sections: group.sections.filter((capability) => searchableText(capability).includes(needle)) }))
      .filter((group) => group.sections.length > 0);
  }, [groups, query]);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><LifeBuoy size={12} aria-hidden="true" /> {t("staffHelp.eyebrow")}</>}
        title={t("staffHelp.title")}
      />

      <div className="space-y-2">
        <label htmlFor="staff-help-search" className="sr-only">{t("staffHelp.searchLabel")}</label>
        <div className="relative max-w-xl">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="staff-help-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("staffHelp.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t("staffHelp.contentLanguage")}
          {!isSuperAdmin && <> {t("staffHelp.permissionNote")}</>}
        </p>
      </div>

      {!query.trim() && workflows.length > 0 && (
        <section data-staff-help-workflows className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{t("staffHelp.workflows")}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workflows.map((workflow) => (
              <Link
                key={workflow.slug}
                href={workflowHref(workflow)}
                data-staff-help-workflow={workflow.slug}
                className="group flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 transition hover:border-primary/60 hover:bg-primary/10"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{workflow.title}</span>
                  <ArrowRight size={15} className="mt-0.5 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden="true" />
                </span>
                <span className="text-xs leading-5 text-muted-foreground">{workflow.summary}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {filteredGroups.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("staffHelp.empty")}</p>
      ) : (
        filteredGroups.map((group) => (
          <section key={group.key} data-staff-help-group={group.key} className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{group.label}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.sections.map((capability) => (
                <Link
                  key={capability.name}
                  href={guideHref(capability)}
                  data-staff-help-section={capability.name}
                  className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:bg-secondary/40"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{sectionTitle(capability)}</span>
                    <ArrowRight size={15} className="mt-0.5 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden="true" />
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">{capability.description}</span>
                  <span className="mt-auto w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                    {sectionAudience(capability, isSuperAdmin) === "granted" ? t("staffHelp.whoGranted") : sectionAudience(capability, isSuperAdmin) === "superAdmin" ? t("staffHelp.whoSuperAdmin") : t("staffHelp.whoStaff")}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </AdminPageShell>
  );
}
