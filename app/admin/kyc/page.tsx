"use client";

import { useEffect, useState } from "react";
import { CheckSquare, XCircle, MessageSquare } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getUsers } from "@/backend/domains/identity";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { AdminKycSubmission, User } from "@/backend/core/types";
import { KYC_REVIEW_REASON_CODES, type KycReviewReasonCode } from "@/lib/kyc/types";

const DOC_LABEL: Record<string, string> = {
  national_id:     "MyKad",
  passport:        "Passport",
  driving_license: "Driving License / MyPolis",
};

type PendingAction = {
  userId: string;
  action: "reject" | "request_info";
  reasonCode: KycReviewReasonCode | "";
  reasonDetail: string;
} | null;

const REVIEW_REASON_LABELS: Record<KycReviewReasonCode, string> = {
  document_unreadable: "Document is unreadable",
  document_incomplete: "Document is incomplete",
  document_mismatch: "Document details do not match",
  document_expired: "Document is expired",
  document_suspected_tampering: "Document is suspected of tampering",
  other: "Other (add details)",
};

export default function AdminKycPage() {
  const { currentUser } = useAuth();
  const [users,         setUsers]         = useState<User[]>([]);
  const [submissions,   setSubmissions]   = useState<Map<string, AdminKycSubmission>>(new Map());
  const [reviewing,     setReviewing]     = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    getUsers().then((all) => setUsers(all.filter((u) => u.role === "customer")));
    fetch('/api/admin/kyc/submissions')
      .then((res) => res.json())
      .then((body) => setSubmissions(new Map((body.data?.submissions ?? []).map((s: AdminKycSubmission) => [s.userId, s]))));
  }, []);

  async function review(
    userId: string,
    action: "approve" | "reject" | "request_info",
    reasonCode?: KycReviewReasonCode,
    reasonDetail?: string,
  ) {
    if (!currentUser || reviewing) return;
    if (action !== "approve" && !reasonCode) {
      setError("Select a review reason.");
      return;
    }
    if (reasonCode === "other" && (reasonDetail?.trim().length ?? 0) < 10) {
      setError("Add at least 10 characters of detail for Other.");
      return;
    }
    setReviewing(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/kyc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action,
          ...(reasonCode ? { reasonCode } : {}),
          ...(reasonDetail?.trim() ? { reasonDetail: reasonDetail.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: { message?: string } })?.error?.message ?? "Review failed.");
        return;
      }
      // Remove from submissions map (no longer active)
      setSubmissions((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      if (action === "approve") {
        setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, verificationTier: "kyc_verified" } : u));
      }
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setReviewing(null);
    }
  }

  // Users with an active submission (pending or info_requested)
  const pending  = users.filter((u) => submissions.has(u.id));
  const verified = users.filter((u) => u.verificationTier === "kyc_verified");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">KYC Review</h1>
      <p className="text-xs text-muted-foreground mb-6">
        Review submitted KYC documents and approve, reject, or request additional information.
      </p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Pending submissions */}
      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Pending Review ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="No pending KYC submissions" />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((u) => {
              const sub = submissions.get(u.id);
              const isInfoRequested = sub?.status === "info_requested";
              const isActioning = pendingAction?.userId === u.id;

              return (
                <div key={u.id}>
                  <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 bg-teal">
                      {u.avatarInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-foreground">{u.name}</p>
                        {isInfoRequested && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">
                            Info Requested
                          </span>
                        )}
                      </div>
                      {sub ? (
                        <p className="text-xs text-muted-foreground">{DOC_LABEL[sub.docType] ?? sub.docType}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No submission data</p>
                      )}
                    </div>

                    {sub?.documents.map(({ side }) => (
                      <button
                        key={side}
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/admin/kyc/documents/${sub.id}/${side}`);
                            const body = await res.json().catch(() => ({}));
                            if (!res.ok || !body.data?.signedUrl) throw new Error(body.error?.message ?? "Failed to load document");
                            window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "Failed to load document");
                          }
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition-colors"
                      >
                        View {side}
                      </button>
                    ))}

                    {/* Action buttons */}
                    <div className="flex gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        className="text-xs"
                        disabled={reviewing === u.id}
                        onClick={() => review(u.id, "approve")}
                      >
                        <CheckSquare size={12} /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        disabled={reviewing === u.id}
                        onClick={() => setPendingAction(isActioning && pendingAction?.action === "request_info" ? null : { userId: u.id, action: "request_info", reasonCode: "", reasonDetail: "" })}
                      >
                        <MessageSquare size={12} /> Request Info
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-destructive text-destructive hover:bg-destructive/10"
                        disabled={reviewing === u.id}
                        onClick={() => setPendingAction(isActioning && pendingAction?.action === "reject" ? null : { userId: u.id, action: "reject", reasonCode: "", reasonDetail: "" })}
                      >
                        <XCircle size={12} /> Reject
                      </Button>
                    </div>
                  </div>

                  {/* Inline reason form */}
                  {isActioning && pendingAction && (
                    <div className="px-6 pb-4 pt-0">
                      <div
                        className="rounded-xl border p-4 space-y-3"
                        style={{
                          borderColor: pendingAction.action === "reject" ? "var(--destructive)" : "var(--border)",
                          backgroundColor: pendingAction.action === "reject"
                            ? "color-mix(in srgb, var(--destructive) 5%, transparent)"
                            : "color-mix(in srgb, var(--accent) 5%, transparent)",
                        }}
                      >
                        <p className="text-xs font-semibold text-foreground">
                          {pendingAction.action === "reject" ? "Rejection Reason" : "Information Requested"}
                        </p>
                        <select
                          value={pendingAction.reasonCode}
                          onChange={(e) => setPendingAction((a) => a ? { ...a, reasonCode: e.target.value as KycReviewReasonCode | "", reasonDetail: e.target.value === "other" ? a.reasonDetail : "" } : a)}
                          className="w-full px-3 py-2 text-xs rounded-lg border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">Select a reason…</option>
                          {KYC_REVIEW_REASON_CODES.filter((reasonCode) => pendingAction.action === "reject" || reasonCode !== "document_suspected_tampering").map((reasonCode) => (
                            <option key={reasonCode} value={reasonCode}>{REVIEW_REASON_LABELS[reasonCode]}</option>
                          ))}
                        </select>
                        {pendingAction.reasonCode === "other" && (
                          <textarea
                            rows={2}
                            value={pendingAction.reasonDetail}
                            onChange={(e) => setPendingAction((a) => a ? { ...a, reasonDetail: e.target.value } : a)}
                            placeholder="Explain what additional information is needed (at least 10 characters)."
                            className="w-full px-3 py-2 text-xs rounded-lg border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                          />
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => { setPendingAction(null); setError(null); }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className={`text-xs ${pendingAction.action === "reject" ? "bg-destructive hover:bg-destructive/90 text-white" : ""}`}
                            disabled={reviewing === u.id || !pendingAction.reasonCode || (pendingAction.reasonCode === "other" && pendingAction.reasonDetail.trim().length < 10)}
                            onClick={() => review(u.id, pendingAction.action, pendingAction.reasonCode || undefined, pendingAction.reasonDetail)}
                          >
                            {reviewing === u.id ? "Processing…" : pendingAction.action === "reject" ? "Confirm Reject" : "Send Request"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Verified users */}
      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">KYC Verified ({verified.length})</h2>
        </div>
        {verified.length === 0 ? (
          <EmptyState title="No verified users yet" />
        ) : (
          <div className="divide-y divide-border">
            {verified.map((u) => (
              <div key={u.id} className="px-6 py-3.5 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{u.name}</p>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">Verified</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
