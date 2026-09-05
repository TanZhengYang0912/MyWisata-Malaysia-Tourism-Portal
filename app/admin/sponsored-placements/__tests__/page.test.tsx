import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  t: (key: string) => ({
    "sponsoredPlacements.title": "Sponsored placements",
    "sponsoredPlacements.description": "Manage placement campaigns",
    "sponsoredPlacements.form.product": "Product",
    "sponsoredPlacements.form.startsAt": "Starts at",
    "sponsoredPlacements.form.endsAt": "Ends at",
    "sponsoredPlacements.form.allStates": "All states",
    "sponsoredPlacements.form.allCategories": "All categories",
    "sponsoredPlacements.form.create": "Create draft",
    "sponsoredPlacements.errors.forbidden": "You do not have permission to manage sponsored placements.",
    "sponsoredPlacements.states.loading": "Loading sponsored placements…",
  } as Record<string, string>)[key] ?? key,
}));

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

import SponsoredPlacementsPage from "../page";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;

async function render(root: ReturnType<typeof createRoot>, element: React.ReactElement) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SponsoredPlacementsPage", () => {
  let container: TestElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset().mockResolvedValue(Response.json({
      data: {
        products: [{ id: "11111111-1111-4111-8111-111111111111", name: "Rainforest Walk" }],
        placements: [],
      },
      error: null,
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("renders the real Admin shell with product, date and scope controls", async () => {
    await render(root, <SponsoredPlacementsPage />);

    expect(findOne(container, (element) => element.tagName === "MAIN")).not.toBeNull();
    expect(findOne(container, (element) => element.tagName === "SELECT" && element.getAttribute("aria-label") === "Product")).not.toBeNull();
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.type === "datetime-local" && element.getAttribute("aria-label") === "Starts at")).not.toBeNull();
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.type === "datetime-local" && element.getAttribute("aria-label") === "Ends at")).not.toBeNull();
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.type === "checkbox" && element.getAttribute("aria-label") === "All states")).not.toBeNull();
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.type === "checkbox" && element.getAttribute("aria-label") === "All categories")).not.toBeNull();
  });

  it("renders a permission-specific state when the server denies access", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }));

    await render(root, <SponsoredPlacementsPage />);

    expect(container.textContent).toContain("You do not have permission to manage sponsored placements.");
    expect(findElements(container, (element) => element.tagName === "FORM")).toHaveLength(0);
  });

  it("is linked from the existing localized Admin navigation", () => {
    const layout = readFileSync(resolve(process.cwd(), "app/admin/layout.tsx"), "utf8");
    expect(layout).toContain('href: "/admin/sponsored-placements"');
    expect(layout).toContain('label: "Sponsored Placements"');
  });
});
