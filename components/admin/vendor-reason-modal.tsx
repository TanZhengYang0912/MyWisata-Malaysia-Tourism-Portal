"use client";

// P4 — Member 4: reason-entry modal for the vendor reject / suspend /
// request_information actions. Replaces the old browser prompt previously used
// to collect their `reason` with a proper textarea plus an optional
// "Draft with AI" button (lib/vendors/action-draft.ts) — same "AI drafts,
// admin edits, admin confirms" shape as AiDraftEmailModal, but for a single
// reason field instead of an email's recipient/subject/body. Confirming here
// only returns the (possibly hand-edited) text to the caller; nothing is
// sent or actioned by this component itself.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type VendorReasonAction = "reject" | "suspend" | "request_information";

type Props = {
  open: boolean;
  action: VendorReasonAction | null;
  vendorId: string | null;
  vendorName: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

const TITLE_KEY: Record<VendorReasonAction, string> = {
  reject: "ui.vendors.reason.rejection",
  suspend: "ui.vendors.reason.suspension",
  request_information: "ui.vendors.reason.informationRequest",
};

export function VendorReasonModal({ open, action, vendorId, vendorName, confirmLabel, onClose, onConfirm }: Props) {
  const { t } = useTranslation("admin");
  const [reason, setReason] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason("");
    setDraftError(null);
  }, [open, vendorId, action]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !action || !vendorId) return null;

  async function runDraft() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/action-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { data: { reason: string } | null; error: { message: string } | null };
      if (!res.ok || !body.data) {
        setDraftError(body.error?.message ?? t("ui.vendors.reasonModal.error"));
        return;
      }
      setReason(body.data.reason);
    } catch {
      setDraftError(t("ui.vendors.reasonModal.error"));
    } finally {
      setDrafting(false);
    }
  }

  const canConfirm = reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="vendor-reason-modal-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="vendor-reason-modal-title" className="text-base font-semibold text-foreground">
              {t(TITLE_KEY[action], { name: vendorName })}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("ui.vendors.reasonModal.advisory")}</p>
          </div>
          <button type="button" aria-label={t("ui.vendors.reasonModal.close")} onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" className="h-6 gap-1 text-[0.6875rem] px-2" onClick={() => void runDraft()} disabled={drafting}>
              <Sparkles size={11} /> {drafting ? t("ui.vendors.reasonModal.drafting") : t("ui.vendors.reasonModal.draft")}
            </Button>
          </div>
          <Textarea
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={drafting ? t("ui.vendors.reasonModal.drafting") : t("ui.vendors.reasonModal.placeholder")}
          />
          {draftError && <p className="text-xs text-destructive">{draftError}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t("ui.vendors.reasonModal.cancel")}</Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={!canConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
