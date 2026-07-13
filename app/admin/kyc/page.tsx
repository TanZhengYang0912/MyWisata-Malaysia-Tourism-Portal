"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { getUsers, getKycSubmissions, getKycDocumentSignedUrl } from "@/backend/domains/identity";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { EmptyState } from "@/components/shared/empty-state";
import type { KycSubmission, User } from "@/backend/core/types";

const DOC_LABEL: Record<string, string> = {
  national_id: "MyKad",
  passport: "Passport",
  driving_license: "Driving License / MyPolis",
};

export default function AdminKycPage() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, KycSubmission>>(new Map());
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsers().then((all) => setUsers(all.filter((u) => u.role === "customer")));
    getKycSubmissions().then((subs) =>
      setSubmissions(new Map(subs.map((s) => [s.userId, s])))
    );
  }, []);

  async function review(user: User, approve: boolean) {
    if (!currentUser || reviewing) return;
    setReviewing(user.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/kyc/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, action: approve ? 'approve' : 'reject' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message ?? 'Review failed.');
        return;
      }
      const nextTier = approve ? "kyc_verified" : "profile_complete";
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, verificationTier: nextTier } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setReviewing(null);
    }
  }

  const pending  = users.filter((u) => u.verificationTier === "kyc_submitted");
  const verified = users.filter((u) => u.verificationTier === "kyc_verified");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">KYC Review</h1>
      <p className="text-xs text-muted-foreground mb-6">Review submitted KYC documents and approve or reject each application.</p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

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
              return (
                <div key={u.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 bg-teal">{u.avatarInitial}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{u.name}</p>
                    {sub ? (
                      <p className="text-xs text-muted-foreground">
                        {DOC_LABEL[sub.docType] ?? sub.docType}
                      </p>
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
                  <ApproveRejectBar
                    onApprove={() => review(u, true)}
                    onReject={() => review(u, false)}
                    disabled={reviewing === u.id}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">KYC Verified</h2>
        </div>
        <div className="divide-y divide-border">
          {verified.map((u) => (
            <div key={u.id} className="px-6 py-3.5 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{u.name}</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">Verified</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
