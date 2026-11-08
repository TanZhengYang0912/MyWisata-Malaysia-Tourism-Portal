"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Route } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { findWorkflow } from "@/lib/admin-ai/workflows";
import { findGuideByName, guideHref, sectionTitle, useStaffHelpSections } from "../../staff-help-sections";

// One Staff Help workflow: an activity that moves across several admin pages.
// Listed only when one of its pages is visible to this staff member; a step on
// a page they cannot open is shown without links.

export default function AdminHelpWorkflowPage() {
  const { t } = useTranslation("admin");
  const params = useParams<{ slug: string }>();
  const { workflows, visibleNames } = useStaffHelpSections();
  const workflow = findWorkflow(params.slug ?? "");
  const available = workflow && workflows.some((candidate) => candidate.slug === workflow.slug);

  const back = (
    <Link href="/admin/help" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft size={14} aria-hidden="true" /> {t("staffHelp.backToHelp")}
    </Link>
  );

  if (!workflow || !available) {
    return (
      <AdminPageShell>
        {back}
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("staffHelp.workflowNotAvailable")}</p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      {back}
      <AdminPageHeader
        eyebrow={<><Route size={12} aria-hidden="true" /> {t("staffHelp.workflows")}</>}
        title={workflow.title}
        description={workflow.summary}
      />

      <ol data-staff-help-workflow-steps={workflow.slug} className="space-y-3">
        {workflow.steps.map((step, index) => {
          const guide = findGuideByName(step.guide);
          const canOpen = guide && visibleNames.has(guide.name);
          return (
            <li key={`${step.guide}-${index}`} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {canOpen ? (
                    <Link href={guideHref(guide)} className="text-sm font-semibold text-foreground hover:text-primary hover:underline">{sectionTitle(guide)}</Link>
                  ) : (
                    <span className="text-sm font-semibold text-foreground">{guide ? sectionTitle(guide) : step.guide}</span>
                  )}
                  {canOpen && (
                    <Link href={guide.path} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                      {t("staffHelp.openPage")} <ExternalLink size={12} aria-hidden="true" />
                    </Link>
                  )}
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("staffHelp.by", { who: step.by })}</p>
                <p className="text-sm text-muted-foreground">{step.what}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">{t("staffHelp.contentLanguage")}</p>
    </AdminPageShell>
  );
}
