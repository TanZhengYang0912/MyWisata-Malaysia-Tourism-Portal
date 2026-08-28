import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AdminKycSubmission, User } from "@/backend/core/types";
import { KycReviewQueueRow } from "@/components/admin/kyc-review-queue-row";

const translations: Record<string, string> = {
  "kyc.detail.eyebrow": "Identity verification",
  "kyc.detail.documents": "Documents",
  "kyc.detail.automatedChecks": "Automated checks",
  "kyc.detail.openDocument": "Open {{side}}",
  "kyc.detail.front": "Front",
  "kyc.detail.back": "Back",
  "kyc.detail.approve": "Approve KYC",
  "kyc.detail.requestInfo": "Request information",
  "kyc.detail.reject": "Reject KYC",
  "kyc.detail.waitingTitle": "Waiting for customer",
  "kyc.detail.waitingDescription": "The customer must submit the requested information before another decision.",
  "kyc.detail.outcome": "Review outcome",
  "kyc.detail.reviewHistory": "Review history",
  "kyc.detail.assignedElsewhere": "Assigned to another reviewer",
  "kyc.detail.ocrStatus": "OCR status: {{status}}",
  "kyc.ocr.status.matched": "Matched",
  "kyc.ocr.extractedName": "Extracted name: {{name}}",
  "kyc.ocr.documentEnding": "Document ending: {{number}}",
  "kyc.ocr.expiryDate": "Expiry date: {{date}}",
  "kyc.ocr.noMismatch": "No OCR mismatch detected",
  "kyc.status.pending": "Pending review",
  "kyc.status.infoRequested": "Info requested",
  "kyc.status.approved": "Approved",
  "kyc.status.draft": "Draft",
  "kyc.status.rejected": "Rejected",
  "kyc.status.superseded": "Superseded",
  "kyc.fallback.notAvailable": "Not available",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>) => {
      let translated = translations[key] ?? key;
      for (const [name, value] of Object.entries(values ?? {})) {
        translated = translated.replace(`{{${name}}}`, String(value));
      }
      return translated;
    },
  }),
}));

const customer: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Customer Bob",
  email: "bob@example.com",
  role: "customer",
  avatarInitial: "C",
  verificationTier: "profile_complete",
};

const pendingSubmission: AdminKycSubmission = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: customer.id,
  docType: "national_id",
  status: "pending",
  queuePosition: 2,
  submittedAt: "2026-07-15T08:00:00.000Z",
  reviewedAt: null,
  reviewedBy: null,
  reviewReasonCode: null,
  reviewReasonDetail: null,
  documents: [{ side: "front" }, { side: "back" }],
  ocr: {
    status: "matched",
    holderName: "Customer Bob",
    documentNumberLast4: "6789",
    expiryDate: "2030-07-15",
    confidence: 0.98,
    mismatchFields: [],
    processedAt: "2026-07-15T08:01:00.000Z",
  },
};

describe("KYC review presentation", () => {
  it("makes each compact queue row one link to its submission", () => {
    const markup = renderToStaticMarkup(
      <KycReviewQueueRow
        user={customer}
        submission={pendingSubmission}
        submittedLabel="Submitted 15 Jul 2026 · Queue position 2"
        documentLabel="MyKad"
        statusLabel="Pending review"
        reviewLabel="Review"
        href={`/admin/kyc/${pendingSubmission.id}`}
      />,
    );

    expect(markup).toContain("Customer Bob");
    expect(markup).toContain("MyKad");
    expect(markup).toContain("Pending review");
    expect(markup).toContain("Review");
    expect(markup).toContain(`href="/admin/kyc/${pendingSubmission.id}"`);
    expect(markup.match(/<a/g)).toHaveLength(1);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("View front");
    expect(markup).not.toContain("Approve");
    expect(markup).not.toContain("Reject");
  });

  async function renderDetail(status: AdminKycSubmission["status"], canDecide = true) {
    const detailPath = resolve(process.cwd(), "components/admin/kyc-review-detail.tsx");
    expect(existsSync(detailPath), "dedicated KYC detail component must exist").toBe(true);
    if (!existsSync(detailPath)) return "";

    const { KycReviewDetailContent } = await import("@/components/admin/kyc-review-detail");
    const detail = {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        avatarInitial: customer.avatarInitial,
      },
      submission: {
        ...pendingSubmission,
        assignedTo: "33333333-3333-4333-8333-333333333333",
        claimedAt: "2026-07-15T08:02:00.000Z",
        legalIdentity: {
          fullName: "Customer Bob",
          email: "bob@example.com",
          phone: "+60123456789",
          capturedAt: "2026-07-15T08:00:00.000Z",
        },
        status,
        reviewedAt: status === "approved" || status === "rejected" ? "2026-07-16T08:00:00.000Z" : null,
        reviewedBy: status === "approved" || status === "rejected" ? "33333333-3333-4333-8333-333333333333" : null,
        reviewReasonCode: status === "rejected" ? "document_mismatch" : null,
      },
      assignment: {
        assignedTo: canDecide ? "33333333-3333-4333-8333-333333333333" : "44444444-4444-4444-8444-444444444444",
        claimedAt: "2026-07-15T08:02:00.000Z",
        isAssignedToCurrentUser: canDecide,
        canDecide,
      },
      reviewEvents: [{
        id: "55555555-5555-4555-8555-555555555555",
        fromStatus: "pending",
        toStatus: "approved",
        action: "approve" as const,
        actorId: "33333333-3333-4333-8333-333333333333",
        actorRole: "admin",
        reasonCategory: null,
        internalNote: null,
        customerMessage: "Your identity verification is complete.",
        createdAt: "2026-07-16T08:00:00.000Z",
      }],
    };

    return renderToStaticMarkup(
      <KycReviewDetailContent
        detail={detail}
        busy={false}
        error={null}
        onOpenDocument={() => undefined}
        onDecision={() => undefined}
      />,
    );
  }

  it("shows evidence and decisions together for a pending submission", async () => {
    const markup = await renderDetail("pending");

    expect(markup).toContain("Documents");
    expect(markup).toContain("Open Front");
    expect(markup).toContain("Open Back");
    expect(markup).toContain("Automated checks");
    expect(markup).toContain("Document ending: 6789");
    expect(markup).toContain("Approve KYC");
    expect(markup).toContain("Request information");
    expect(markup).toContain("Reject KYC");
    expect(markup).toContain("Review history");
    expect(markup).toContain("Your identity verification is complete.");
  });

  it("hides decision actions when the pending submission belongs to another reviewer", async () => {
    const markup = await renderDetail("pending", false);

    expect(markup).toContain("Assigned to another reviewer");
    expect(markup).not.toContain("Approve KYC");
    expect(markup).not.toContain("Request information");
    expect(markup).not.toContain("Reject KYC");
  });

  it("makes information-requested submissions read-only while waiting for the customer", async () => {
    const markup = await renderDetail("info_requested");

    expect(markup).toContain("Waiting for customer");
    expect(markup).not.toContain("Approve KYC");
    expect(markup).not.toContain("Request information");
    expect(markup).not.toContain("Reject KYC");
  });

  it.each([
    ["approved", "Approved"],
    ["rejected", "Rejected"],
    ["draft", "Draft"],
    ["superseded", "Superseded"],
  ] as const)("shows %s submissions as read-only outcomes", async (status, expectedLabel) => {
    const markup = await renderDetail(status);

    expect(markup).toContain("Review outcome");
    expect(markup).toContain(expectedLabel);
    expect(markup).not.toContain("Approve KYC");
    expect(markup).not.toContain("Request information");
    expect(markup).not.toContain("Reject KYC");
  });
});
