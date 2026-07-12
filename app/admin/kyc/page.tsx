"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { getUsers, setVerificationTier, getKycSubmissions, recordKycReview, getKycDocumentSignedUrl } from "@/backend/domains/identity";
import { recordApproval } from "@/backend/core/audit";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { EmptyState } from "@/components/shared/empty-state";
import type { KycSubmission, User } from "@/backend/core/types";

const TIER_LABEL: Record<User["verificationTier"], string> = {
  guest: "Guest",
  registered: "Registered",
  phone_verified: "Phone Verified",
  profile_complete: "Profile Complete",
  kyc_submitted: "KYC Under Review",
  kyc_verified: "KYC Verified",
};

const DOC_LABEL: Record<string, string> = {
  national_id: "MyKad",
  passport: "Passport",
  driving_license: "Driving License / MyPolis",
};

export default function AdminKycPage() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, KycSubmission>>(new Map());

  useEffect(() => {
    getUsers().then((all) => setUsers(all.filter((u) => u.role === "customer")));
    getKycSubmissions().then((subs) =>
      setSubmissions(new Map(subs.map((s) => [s.userId, s])))
    );
  }, []);

  async function review(user: User, approve: boolean) {
    if (!currentUser) return;
    const nextTier = approve ? "kyc_verified" : "profile_complete";
    await setVerificationTier(user.id, nextTier);
    await recordKycReview(user.id, currentUser.id, approve);
    await recordApproval({
      actorId: currentUser.id,
      action: approve ? "kyc.approve" : "kyc.reject",
      targetType: "user",
      targetId: user.id,
      notifyUserId: user.id,
      notifyText: approve ? "Your KYC verification was approved!" : "Your KYC submission needs re-upload — please try again.",
      before: { verificationTier: user.verificationTier },
      after: { verificationTier: nextTier },
    });
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, verificationTier: nextTier } : u)));
  }

  const pending = users.filter((u) => u.verificationTier === "kyc_submitted");
  const verified = users.filter((u) => u.verificationTier === "kyc_verified");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">KYC Review</h1>
      <p className="text-xs text-muted-foreground mb-6">Review submitted KYC documents and approve or reject each application.</p>

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
                        {DOC_LABEL[sub.docType] ?? sub.docType} · IC: {sub.icNumber}
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
                  <ApproveRejectBar onApprove={() => review(u, true)} onReject={() => review(u, false)} />
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
