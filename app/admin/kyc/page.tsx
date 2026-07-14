"use client";

import { useEffect, useState } from "react";
import { CheckSquare, XCircle, MessageSquare } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getUsers, getKycSubmissions, getKycDocumentSignedUrl } from "@/backend/domains/identity";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { KycSubmission, User } from "@/backend/core/types";

const DOC_LABEL: Record<string, string> = {
  national_id:     "MyKad",
  passport:        "Passport",
  driving_license: "Driving License / MyPolis",
};

type PendingAction = {
  userId: string;
  action: "reject" | "request_info";
  reason: string;
} | null;

export default function AdminKycPage() {
  const { currentUser } = useAuth();
  const [users,         setUsers]         = useState<User[]>([]);
  const [submissions,   setSubmissions]   = useState<Map<string, KycSubmission>>(new Map());
  const [reviewing,     setReviewing]     = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    getUsers().then((all) => setUsers(all.filter((u) => u.role === "customer")));
    getKycSubmissions().then((subs) =>
      setSubmissions(new Map(subs.map((s) => [s.userId, s])))
    );
  }, []);

  async function review(userId: string, action: "approve" | "reject" | "request_info", reason?: string) {
    if (!currentUser || reviewing) return;
    if ((action === "reject" || action === "request_info") && (!reason || reason.trim().length < 10)) {
      setError("A reason of at least 10 characters is required.");
      return;
    }
    setReviewing(userId);
    setError(null);
    try {
      const res = await fetch("/api/admin/kyc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, reason: reason?.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as any)?.error?.message ?? "Review failed.");
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

                    {sub?.documentUrl && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const url = await getKycDocumentSignedUrl(sub.documentUrl);
                            window.open(url, "_blank", "noopener,noreferrer");
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "Failed to load document");
                          }
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition-colors"
                      >
                        View Document
                      </button>
                    )}

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
                        onClick={() => setPendingAction(isActioning && pendingAction?.action === "request_info" ? null : { userId: u.id, action: "request_info", reason: "" })}
                      >
                        <MessageSquare size={12} /> Request Info
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs border-destructive text-destructive hover:bg-destructive/10"
                        disabled={reviewing === u.id}
                        onClick={() => setPendingAction(isActioning && pendingAction?.action === "reject" ? null : { userId: u.id, action: "reject", reason: "" })}
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
                          <span className="text-muted-foreground font-normal ml-1">(min 10 characters, shown to user)</span>
                        </p>
                        <textarea
                          rows={2}
                          value={pendingAction.reason}
                          onChange={(e) => setPendingAction((a) => a ? { ...a, reason: e.target.value } : a)}
                          placeholder={
                            pendingAction.action === "reject"
                              ? "e.g. Document photo is too blurry to read. Please re-submit."
                              : "e.g. Please re-upload a clear photo of the front of your MyKad."
                          }
                          className="w-full px-3 py-2 text-xs rounded-lg border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                        />
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
                            disabled={reviewing === u.id || pendingAction.reason.trim().length < 10}
                            onClick={() => review(u.id, pendingAction.action, pendingAction.reason)}
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
