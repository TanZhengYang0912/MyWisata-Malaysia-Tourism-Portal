import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TestEvent,
  findElements,
  findOne,
  installTestDom,
  type TestDocument,
  type TestElement,
} from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const translations: Record<string, string> = {
  "accessControl.audit.actionSummaries.kycApprove": "Approved a KYC submission",
  "accessControl.audit.actionSummaries.unknown": "Unknown audit action",
  "accessControl.audit.changeSummary": "Key changes",
  "accessControl.audit.technicalDetails": "Technical details",
  "accessControl.audit.fieldLabels.status": "Status",
  "accessControl.audit.fieldLabels.submissionId": "Submission ID",
  "accessControl.audit.fieldLabels.reasonCode": "Reason code",
  "accessControl.audit.valueLabels.pending": "Pending",
  "accessControl.audit.valueLabels.approved": "Approved",
  "accessControl.audit.valueLabels.missing": "Not recorded",
  "accessControl.audit.valueLabels.null": "None",
  "accessControl.actions.inspect": "Inspect",
  "accessControl.actions.hide": "Hide",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { resolvedLanguage: "en" },
  }),
}));
vi.mock("lucide-react", () => ({
  ArrowRight: (props: Record<string, unknown>) => <svg {...props} />,
  ArrowUpRight: (props: Record<string, unknown>) => <svg {...props} />,
  ChevronLeft: (props: Record<string, unknown>) => <svg {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <svg {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <svg {...props} />,
  Search: (props: Record<string, unknown>) => <svg {...props} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

import { AuditLogTab } from "@/components/admin/access-control/audit-log-tab";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("AuditLogTab", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockResolvedValue(response({
      data: {
        items: [
          {
            id: "audit-kyc",
            actorId: "aaaaaaaa-0000-0000-0000-000000000000",
            action: "kyc.approve",
            entityType: "kyc_submission",
            entityId: "submission-1",
            before: { status: "pending" },
            after: { status: "approved", submissionId: "submission-1", reasonCode: null },
            reason: null,
            createdAt: "2026-09-05T04:51:34.000Z",
          },
          {
            id: "audit-unknown",
            actorId: null,
            action: "future.action.created",
            entityType: "future_entity",
            entityId: "future-1",
            before: null,
            after: null,
            reason: null,
            createdAt: "2026-09-05T05:00:00.000Z",
          },
        ],
        page: 1,
        pageSize: 25,
        total: 2,
        totalPages: 1,
      },
      error: null,
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("shows human-readable actions, key changes, and collapsed technical JSON", async () => {
    await act(async () => {
      root?.render(<AuditLogTab focus={null} onViewEntity={vi.fn()} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Approved a KYC submission");
    expect(container.textContent).toContain("kyc.approve");
    expect(container.textContent).toContain("Unknown audit action");
    expect(container.textContent).toContain("future.action.created");

    await click(findOne(container, (element) =>
      element.tagName === "BUTTON" && element.textContent === "Inspect"));

    expect(container.textContent).toContain("Key changes");
    expect(container.textContent).toContain("Status");
    expect(container.textContent).toContain("Pending");
    expect(container.textContent).toContain("Approved");

    const details = findOne(container, (element) => element.tagName === "DETAILS");
    expect(details.textContent).toContain("Technical details");
    expect(details.textContent).toContain('"status": "pending"');
    expect(details.hasAttribute("open")).toBe(false);
    expect(findElements(details, (element) => element.tagName === "PRE")).toHaveLength(2);
  });
});
