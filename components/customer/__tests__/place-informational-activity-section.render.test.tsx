import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { PlaceInformationalActivity } from "@/backend/core/types";
import { PlaceInformationalActivitySection } from "@/components/customer/place-informational-activity-section";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const activities: PlaceInformationalActivity[] = [
  {
    id: "art-lane",
    placeId: "central-market",
    slug: "art-lane",
    title: "Browse Art Lane",
    description: "See local art and creative studios.",
    activityType: "informational_activity",
    priceLabel: null,
    sourceTitle: "Tourism Malaysia",
    sourceUrl: "https://example.com/central-market",
    imageSourceUrl: null,
    imageUrl: null,
  },
  {
    id: "heritage",
    placeId: "central-market",
    slug: "heritage-building",
    title: "Explore the heritage building",
    description: "Learn about the market's history.",
    activityType: "informational_paid_activity",
    priceLabel: "Ticket required",
    sourceTitle: "Tourism Malaysia",
    sourceUrl: "https://example.com/central-market",
    imageSourceUrl: null,
    imageUrl: null,
  },
];

let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let createRoot: typeof import("react-dom/client").createRoot;

async function render() {
  await act(async () => {
    root?.render(
      <PlaceInformationalActivitySection
        activities={activities}
        eyebrow="Plan your visit"
        title="Things to do here"
        ticketLabel="Ticket required"
        informationLabel="Venue information"
        venueDetailsLabel="View details"
        venueDetailsHint="Details open here in MyLawatan"
        venue={{ name: "Central Market Kuala Lumpur", location: "Kuala Lumpur, Kuala Lumpur", entry: "Free entry", detail: null }}
        detailsLabels={{
          venue: "Venue",
          location: "Location",
          entry: "Entry",
          source: "Information source",
          difficulty: "Difficulty",
          duration: "Duration",
          bestTime: "Best time",
          gettingThere: "Getting there",
        }}
      />,
    );
    await Promise.resolve();
  });
}

describe("place informational activity details", () => {
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
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    document.body.removeChild(container);
  });

  it("opens the selected activity and the same venue context in an in-system dialog", async () => {
    await render();

    const detailsButtons = findElements(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("View details"));
    expect(detailsButtons).toHaveLength(2);

    await act(async () => {
      detailsButtons[0].dispatchEvent(new TestEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const dialog = findOne(container, (element) => element.getAttribute("role") === "dialog");
    expect(dialog.textContent).toContain("Browse Art Lane");
    expect(dialog.textContent).toContain("See local art and creative studios.");
    expect(dialog.textContent).toContain("Central Market Kuala Lumpur");
    expect(dialog.textContent).toContain("Kuala Lumpur, Kuala Lumpur");
    expect(dialog.textContent).toContain("Free entry");
    expect(dialog.textContent).toContain("Tourism Malaysia");
    expect(findElements(dialog, (element) => element.tagName === "A")).toHaveLength(0);
  });

  it("shows the correct details when a different card is selected", async () => {
    await render();
    const detailsButtons = findElements(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("View details"));

    await act(async () => {
      detailsButtons[1].dispatchEvent(new TestEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const dialog = findOne(container, (element) => element.getAttribute("role") === "dialog");
    expect(dialog.textContent).toContain("Explore the heritage building");
    expect(dialog.textContent).toContain("Ticket required");
    expect(dialog.textContent).not.toContain("Browse Art Lane");
  });

  it("provides the same internal-details copy in all supported customer locales", () => {
    for (const locale of ["en", "ms", "zh-CN"]) {
      const copy = JSON.parse(readFileSync(
        resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`),
        "utf8",
      )) as { ui: { placeActivity: Record<string, string> } };

      expect(copy.ui.placeActivity.venueDetails).toBeTruthy();
      expect(copy.ui.placeActivity.venueDetailsHint).toBeTruthy();
      expect(copy.ui.placeActivity.venue).toBeTruthy();
      expect(copy.ui.placeActivity.informationSource).toBeTruthy();
    }
  });
});
