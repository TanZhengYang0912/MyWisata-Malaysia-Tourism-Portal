"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, LifeBuoy, Route } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { workflowsForGuide } from "@/lib/admin-ai/workflows";
import { findGuide, findGuideByName, guideHref, sectionAudience, sectionTitle, useStaffHelpSections, workflowHref } from "../staff-help-sections";

// One Staff Help guide. Shown only when the guide is visible to this staff
// member under the same rule as the list page.

export default function AdminHelpGuidePage() {
  const { t } = useTranslation("admin");
  const params = useParams<{ slug: string }>();
  const { isSuperAdmin, visible, visibleNames } = useStaffHelpSections();
  const guide = findGuide(params.slug ?? "");
  const available = guide && visible.some((capability) => capability.name === guide.name);

  const back = (
    <Link href="/admin/help" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft size={14} aria-hidden="true" /> {t("staffHelp.backToHelp")}
    </Link>
  );

  if (!guide || !available) {
    return (
      <AdminPageShell>
        {back}
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("staffHelp.notAvailable")}</p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      {back}
      <AdminPageHeader
        eyebrow={<><LifeBuoy size={12} aria-hidden="true" /> {t("staffHelp.eyebrow")}</>}
        title={sectionTitle(guide)}
        description={guide.description}
        actions={(
          <Link href={guide.path} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground">
            {t("staffHelp.openPage")} <ExternalLink size={13} aria-hidden="true" />
          </Link>
        )}
      />

      <div data-staff-help-guide={guide.name} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-secondary-foreground">
            {sectionAudience(guide, isSuperAdmin) === "granted" ? t("staffHelp.whoGranted") : sectionAudience(guide, isSuperAdmin) === "superAdmin" ? t("staffHelp.whoSuperAdmin") : t("staffHelp.whoStaff")}
          </span>
        </div>
        {workflowsForGuide(guide.name).map(({ workflow, index }) => {
          const neighbour = (offset: number) => {
            const step = workflow.steps[index + offset];
            const other = step && findGuideByName(step.guide);
            return other && visibleNames.has(other.name) ? other : undefined;
          };
          const previous = neighbour(-1);
          const next = neighbour(1);
          return (
            <div key={workflow.slug} data-staff-help-part-of={workflow.slug} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-primary/5 px-3 py-2 text-xs">
              <Link href={workflowHref(workflow)} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                <Route size={13} aria-hidden="true" />
                {t("staffHelp.partOf", { workflow: workflow.title, step: index + 1, total: workflow.steps.length })}
              </Link>
              {previous && <Link href={guideHref(previous)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft size={12} aria-hidden="true" />{t("staffHelp.previousStep", { title: sectionTitle(previous) })}</Link>}
              {next && <Link href={guideHref(next)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">{t("staffHelp.nextStep", { title: sectionTitle(next) })}<ArrowRight size={12} aria-hidden="true" /></Link>}
            </div>
          );
        })}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("staffHelp.actions")}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-foreground">
            {guide.actions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
        {guide.lifecycle && guide.lifecycle.length > 0 && (
          <div data-staff-help-lifecycle>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("staffHelp.lifecycle")}</h2>
            <ol className="mt-2 space-y-2">
              {guide.lifecycle.map((stage, position) => (
                <li key={stage.status} className="flex gap-3 rounded-xl border border-border p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">{position + 1}</span>
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-semibold text-foreground">{stage.status}</span>
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("staffHelp.by", { who: stage.by })}</span>
                    <span className="block text-sm text-muted-foreground">{stage.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {guide.notes && guide.notes.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("staffHelp.notes")}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {guide.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("staffHelp.contentLanguage")}</p>
      </div>
    </AdminPageShell>
  );
}
