import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findElements,
  findOne,
  installTestDom,
  type TestDocument,
  type TestElement,
} from "@/components/shared/__tests__/render-test-dom";
import type { SponsoredImpactPreview } from "@/lib/sponsored-placements/impact";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      "sponsoredPlacements.preview.createTitle": "Review draft impact",
      "sponsoredPlacements.preview.approveTitle": "Review approval impact",
      "sponsoredPlacements.preview.position": "Requested position",
      "sponsoredPlacements.preview.shifts": "Campaigns moving down",
      "sponsoredPlacements.preview.paused": "Campaigns that will pause",
      "sponsoredPlacements.preview.archived": "Paused history moving to archive",
      "sponsoredPlacements.preview.noImpact": "No current campaign will move.",
      "sponsoredPlacements.preview.confirmCreate": "Confirm draft",
      "sponsoredPlacements.preview.confirmApprove": "Confirm approval",
      "sponsoredPlacements.preview.cancel": "Cancel",
      "sponsoredPlacements.preview.to": "to",
    } as Record<string, string>)[key] ?? key,
  }),
}));

import { SponsoredImpactDialog } from "../impact-dialog";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;

const preview: SponsoredImpactPreview = {
  previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
  requestedPosition: 2,
  hasCollision: true,
  shifts: [{
    placementId: "11111111-1111-4111-8111-111111111111",
    productName: "Rainforest Walk",
    fromPosition: 2,
    toPosition: 3,
  }],
  paused: [{
    placementId: "22222222-2222-4222-8222-222222222222",
    productName: "Island Cruise",
    fromPosition: 4,
    toStatus: "paused",
  }],
  archived: [{
    placementId: "33333333-3333-4333-8333-333333333333",
    productName: "Old Promotion",
    fromPosition: 4,
    toStatus: "archived",
  }],
  summary: { shiftedCount: 1, pausedCount: 1, archivedCount: 1 },
};

async function render(root: ReturnType<typeof createRoot>, element: React.ReactElement) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
}

describe("SponsoredImpactDialog", () => {
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("shows the creator every shift, pause, and archive consequence", async () => {
    await render(root, (
      <SponsoredImpactDialog
        preview={preview}
        intent="create"
        busy={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    ));

    expect(findOne(container, (element) => element.getAttribute("role") === "alertdialog")).not.toBeNull();
    expect(container.textContent).toContain("Review draft impact");
    expect(container.textContent).toContain("Requested position 2");
    expect(container.textContent).toContain("Rainforest Walk");
    expect(container.textContent).toContain("2 to 3");
    expect(container.textContent).toContain("Island Cruise");
    expect(container.textContent).toContain("Old Promotion");
  });

  it("uses approval copy, explains no impact, and blocks duplicate confirmation", async () => {
    await render(root, (
      <SponsoredImpactDialog
        preview={{ ...preview, hasCollision: false, shifts: [], paused: [], archived: [] }}
        intent="approve"
        busy
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    ));

    expect(container.textContent).toContain("Review approval impact");
    expect(container.textContent).toContain("No current campaign will move.");
    const buttons = findElements(container, (element) => element.tagName === "BUTTON");
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});
