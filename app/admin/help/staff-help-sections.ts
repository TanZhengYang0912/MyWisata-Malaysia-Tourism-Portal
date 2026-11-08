"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { CAPABILITY_REGISTRY, type AdminCapability } from "@/lib/admin-ai/capabilities";
import { staffNavigationSections } from "@/lib/staff-permissions/navigation";
import { STAFF_WORKFLOWS, type StaffWorkflow } from "@/lib/admin-ai/workflows";

// Shared by the Staff Help list (/admin/help) and each guide (/admin/help/[slug]).
// Plan: Docs/plans/2026-10-16-1530-staff-help-page.md. Display-only; every
// linked page still enforces its own permissions server-side.

/** Every staff account goes through sign-in security, so its guide is always shown. */
const ALWAYS_VISIBLE = "staff_sign_in_security";

export type StaffHelpGroup = { key: string; label: string; sections: AdminCapability[] };

export function sectionTitle(capability: AdminCapability): string {
  if (capability.title) return capability.title;
  const words = capability.name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function guideSlug(capability: AdminCapability): string {
  return capability.name.replace(/_/g, "-");
}

export function guideHref(capability: AdminCapability): string {
  return `/admin/help/${guideSlug(capability)}`;
}

/**
 * Who the "who can use it" badge describes. A Super-Admin-only section that a
 * non-Super-Admin can see was granted through their staff role, so calling it
 * "Super Admin only" would contradict their own menu. Callers map this to
 * literal t() calls so the i18n extractor can still see every key.
 */
export type StaffHelpAudience = "staff" | "superAdmin" | "granted";

export function sectionAudience(capability: AdminCapability, isSuperAdmin: boolean): StaffHelpAudience {
  if (capability.role !== "super_admin") return "staff";
  return isSuperAdmin ? "superAdmin" : "granted";
}

export function workflowHref(workflow: StaffWorkflow): string {
  return `/admin/help/flows/${workflow.slug}`;
}

export function findGuideByName(name: string): AdminCapability | undefined {
  return CAPABILITY_REGISTRY.find((capability) => capability.name === name);
}

export function findGuide(slug: string): AdminCapability | undefined {
  return CAPABILITY_REGISTRY.find((capability) => guideSlug(capability) === slug);
}

/**
 * Sections this staff member may read, grouped under the same headings as the
 * admin sidebar. Super Admins see every section; everyone else sees the
 * sections whose page is in their own menu (the same href rule as
 * app/admin/layout.tsx). Sections whose page is not in the sidebar (for
 * example sign-in security) fall under the "other" heading.
 */
export function useStaffHelpSections() {
  const { t } = useTranslation("admin");
  const { currentUser, staffModules = [] } = useAuth();
  const isSuperAdmin = currentUser?.role === "super_admin";

  return useMemo(() => {
    const menu = staffNavigationSections(staffModules);
    const headingFor = (path: string) => menu.find((section) =>
      section.items.some((item) => path === item.href || path.startsWith(`${item.href}/`)));

    const visible = CAPABILITY_REGISTRY.filter((capability) =>
      isSuperAdmin || capability.name === ALWAYS_VISIBLE || Boolean(headingFor(capability.path)));

    const groups: StaffHelpGroup[] = menu.map((section) => ({
      key: section.key,
      label: section.labelKey ? t(section.labelKey) : section.label,
      sections: [],
    }));
    const other: StaffHelpGroup = { key: "other", label: t("staffHelp.otherGroup"), sections: [] };
    for (const capability of visible) {
      const heading = headingFor(capability.path);
      const group = heading ? groups.find((candidate) => candidate.key === heading.key) : undefined;
      (group ?? other).sections.push(capability);
    }

    // A workflow is listed when at least one of its pages is visible; steps on
    // pages this staff member cannot open are shown without a link.
    const visibleNames = new Set(visible.map((capability) => capability.name));
    const workflows = STAFF_WORKFLOWS.filter((workflow) => workflow.steps.some((step) => visibleNames.has(step.guide)));

    return {
      isSuperAdmin,
      visible,
      visibleNames,
      workflows,
      groups: [...groups, other].filter((group) => group.sections.length > 0),
    };
  }, [isSuperAdmin, staffModules, t]);
}
