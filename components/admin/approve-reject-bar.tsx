"use client";

import { useTranslation } from "react-i18next";
import { CheckSquare, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ApproveRejectBar({
  onApprove, onReject, disabled,
}: {
  onApprove: () => void;
  onReject:  () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("admin");
  return (
    <div className="flex gap-2 shrink-0">
      <Button size="sm" className="text-xs" onClick={onApprove} disabled={disabled}>
        <CheckSquare size={12} /> {t("actions.approve")}
      </Button>
      <Button size="sm" variant="outline" className="text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={onReject} disabled={disabled}>
        <XCircle size={12} /> {t("actions.reject")}
      </Button>
    </div>
  );
}
