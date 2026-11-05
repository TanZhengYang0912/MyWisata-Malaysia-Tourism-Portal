"use client";

import { CheckCircle2, SearchCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth";
import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { AssignmentsTab } from "@/components/admin/access-control/assignments-tab";
import { AuditLogTab } from "@/components/admin/access-control/audit-log-tab";
import { CapabilitiesTab } from "@/components/admin/access-control/capabilities-tab";
import { OverviewTab } from "@/components/admin/access-control/overview-tab";
import { PoliciesTab } from "@/components/admin/access-control/policies-tab";
import { StaffRolesTab } from "@/components/admin/access-control/staff-roles-tab";
import type { AccessControlTabId, AuditFocus, EntityFocus, MutationReceipt } from "@/components/admin/access-control/types";

const TAB_IDS: AccessControlTabId[] = ["overview", "capabilities", "policies", "assignments", "staff-roles", "audit-log"];
const RECEIPT_STORAGE_PREFIX = "access-control.mutation-receipt.v1";

function safeStoredReceipt(value: unknown): MutationReceipt | null {
  if (!value || typeof value !== "object") return null;
  const receipt = value as Partial<MutationReceipt>;
  if (receipt.committed !== true || typeof receipt.entityId !== "string" || typeof receipt.action !== "string") return null;
  return {
    committed: true,
    entityId: receipt.entityId,
    action: receipt.action,
    auditEventId: typeof receipt.auditEventId === "string" ? receipt.auditEventId : null,
    receiptAvailable: receipt.receiptAvailable === true,
    generation: typeof receipt.generation === "number" ? receipt.generation : null,
  };
}

export function AccessControlTabs() {
  const { t } = useTranslation("admin");
  const { currentUser } = useAuth();
  const receiptStorageKey = currentUser?.id ? `${RECEIPT_STORAGE_PREFIX}:${currentUser.id}` : null;
  const [activeTab, setActiveTab] = useState<AccessControlTabId>("overview");
  const [auditFocus, setAuditFocus] = useState<AuditFocus | null>(null);
  const [entityFocus, setEntityFocus] = useState<EntityFocus | null>(null);
  const [lastMutation, setLastMutation] = useState<{ receipt: MutationReceipt; message: string } | null>(() => {
    if (!receiptStorageKey || typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem(receiptStorageKey);
      if (!stored) return null;
      const receipt = safeStoredReceipt(JSON.parse(stored) as unknown);
      if (receipt) return { receipt, message: "" };
      sessionStorage.removeItem(receiptStorageKey);
    } catch {
      sessionStorage.removeItem(receiptStorageKey);
    }
    return null;
  });

  function recordMutation(receipt: MutationReceipt, message: string) {
    setLastMutation({ receipt, message });
    if (!receiptStorageKey || !receipt.committed || !receipt.entityId || !receipt.action) return;
    const safeReceipt = safeStoredReceipt(receipt);
    if (!safeReceipt) return;
    try {
      sessionStorage.setItem(receiptStorageKey, JSON.stringify(safeReceipt));
    } catch {
      // The in-memory receipt remains available when browser storage is unavailable.
    }
  }

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
      {lastMutation && <div role="status" aria-live="polite" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
        <span className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="h-4 w-4" />{lastMutation.receipt.receiptAvailable === false ? t("accessControl.feedback.committedReceiptUnavailable") : lastMutation.message || t("accessControl.feedback.previousMutationReceipt")}</span>
        {(lastMutation.receipt.auditEventId || (lastMutation.receipt.entityId && lastMutation.receipt.action)) && <Button size="sm" variant="outline" onClick={() => {
          const { receipt } = lastMutation;
          setAuditFocus({
            ...(receipt.auditEventId ? { eventId: receipt.auditEventId } : {}),
            entityId: receipt.entityId,
            actionPrefix: receipt.action,
          });
          setActiveTab("audit-log");
        }}><SearchCheck aria-hidden="true" className="h-4 w-4" />{t("accessControl.actions.viewAuditEvent")}</Button>}
      </div>}
      {activeTab === "overview" && <OverviewTab onOpenTab={setActiveTab} />}
      {activeTab === "capabilities" && <CapabilitiesTab focusId={entityFocus?.tab === "capabilities" ? entityFocus.id : null} onViewAudit={viewAuditEvent} />}
      {activeTab === "policies" && <PoliciesTab focusId={entityFocus?.tab === "policies" ? entityFocus.id : null} onViewAudit={viewAuditEvent} />}
      {activeTab === "assignments" && <AssignmentsTab focusId={entityFocus?.tab === "assignments" ? entityFocus.id : null} onViewAudit={viewAuditEvent} />}
      {activeTab === "staff-roles" && <StaffRolesTab onMutation={recordMutation} />}
      {activeTab === "audit-log" && <AuditLogTab focus={auditFocus} onViewEntity={viewEntity} />}
    </section>
  );
}
