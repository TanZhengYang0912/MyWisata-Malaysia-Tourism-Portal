import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { PlaceInformationalActivity } from "@/backend/core/types";
import { PlaceInformationalActivitySection } from "@/components/customer/place-informational-activity-section";

vi.mock("@/components/customer/localized-content", () => ({
  LocalizedContent: ({ entityType, entityId, field, sourceText, children }: { entityType: string; entityId: string; field: string; sourceText: string; children?: (value: { text: string; control: React.ReactNode; pending: boolean }) => React.ReactNode }) => (
    <span data-entity-type={entityType} data-entity-id={entityId} data-field={field}>{children ? children({ text: sourceText, control: null, pending: false }) : sourceText}</span>
  ),
}));

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));

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
    priceLabel: "RM 5 adult",
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
        officialInformationLabel="Official Information"
      />,
    );
    await Promise.resolve();
  });
}

describe("place informational activity cards", () => {
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

  it("shows the description on the place card and never looks purchasable", async () => {
    await render();

    expect(findElements(container, (element) => element.getAttribute("data-card-frame") === "place")).toHaveLength(2);
    expect(container.textContent).toContain("See local art and creative studios.");
    expect(container.textContent).toContain("Official Information");
    expect(container.textContent).toContain("Official Information · RM 5 adult");
    expect(container.textContent).toContain("Ticket required");
    expect(findElements(container, (element) => element.tagName === "BUTTON")).toHaveLength(0);
    expect(findElements(container, (element) => element.tagName === "A")).toHaveLength(0);
    expect(findElements(container, (element) => element.getAttribute("role") === "dialog")).toHaveLength(0);
  });

  it("translates the title and description of each activity", async () => {
    await render();
    expect(findElements(container, (element) => element.getAttribute("data-entity-type") === "place_informational_activity").map((element) => [element.getAttribute("data-entity-id"), element.getAttribute("data-field")])).toEqual([
      ["art-lane", "title"], ["art-lane", "description"], ["heritage", "title"], ["heritage", "description"],
    ]);
  });
});
