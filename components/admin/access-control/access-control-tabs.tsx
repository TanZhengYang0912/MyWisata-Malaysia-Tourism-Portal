"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { AssignmentsTab } from "@/components/admin/access-control/assignments-tab";
import { AuditLogTab } from "@/components/admin/access-control/audit-log-tab";
import { CapabilitiesTab } from "@/components/admin/access-control/capabilities-tab";
import { OverviewTab } from "@/components/admin/access-control/overview-tab";
import { PoliciesTab } from "@/components/admin/access-control/policies-tab";
import type { AccessControlTabId, AuditFocus, EntityFocus } from "@/components/admin/access-control/types";

const TAB_IDS: AccessControlTabId[] = ["overview", "capabilities", "policies", "assignments", "audit-log"];

export function AccessControlTabs() {
  const { t } = useTranslation("admin");
  const [activeTab, setActiveTab] = useState<AccessControlTabId>("overview");
  const [auditFocus, setAuditFocus] = useState<AuditFocus | null>(null);
  const [entityFocus, setEntityFocus] = useState<EntityFocus | null>(null);

  function viewAuditEvent(focus: AuditFocus) {
    setAuditFocus(focus);
    setActiveTab("audit-log");
  }

  function viewEntity(focus: EntityFocus) {
    setEntityFocus(focus);
    setActiveTab(focus.tab);
  }

  return (
    <section className="space-y-5">
      <AdminSegmentedFilter
        value={activeTab}
        onChange={(value) => setActiveTab(value as AccessControlTabId)}
        ariaLabel="accessControl.accessibility.tabs"
        items={TAB_IDS.map((id) => ({ value: id, label: t(`accessControl.tabs.${id}`) }))}
      />
      {activeTab === "overview" && <OverviewTab onOpenTab={setActiveTab} />}
      {activeTab === "capabilities" && <CapabilitiesTab focusId={entityFocus?.tab === "capabilities" ? entityFocus.id : null} onViewAudit={viewAuditEvent} />}
      {activeTab === "policies" && <PoliciesTab focusId={entityFocus?.tab === "policies" ? entityFocus.id : null} onViewAudit={viewAuditEvent} />}
      {activeTab === "assignments" && <AssignmentsTab focusId={entityFocus?.tab === "assignments" ? entityFocus.id : null} onViewAudit={viewAuditEvent} />}
      {activeTab === "audit-log" && <AuditLogTab focus={auditFocus} onViewEntity={viewEntity} />}
    </section>
  );
}
