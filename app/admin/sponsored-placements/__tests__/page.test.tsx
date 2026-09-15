import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  t: (key: string) => ({
    "sponsoredPlacements.title": "Sponsored placements",
    "sponsoredPlacements.description": "Manage placement campaigns",
    "sponsoredPlacements.form.product": "Product",
    "sponsoredPlacements.form.startsAt": "Starts at",
    "sponsoredPlacements.form.endsAt": "Ends at",
    "sponsoredPlacements.form.timezone": "Malaysia time (UTC+08:00)",
    "sponsoredPlacements.form.invalidRange": "End time must be later than start time.",
    "sponsoredPlacements.form.position": "Position",
    "sponsoredPlacements.form.chooseState": "Choose a state",
    "sponsoredPlacements.form.allStates": "All states",
    "sponsoredPlacements.form.allCategories": "All categories",
    "sponsoredPlacements.form.create": "Create draft",
    "sponsoredPlacements.actions.approve": "Approve",
    "sponsoredPlacements.lifecycle.active": "Active / Scheduled",
    "sponsoredPlacements.lifecycle.pending": "Pending",
    "sponsoredPlacements.lifecycle.drafts": "Drafts",
    "sponsoredPlacements.lifecycle.paused": "Recently paused",
    "sponsoredPlacements.lifecycle.archived": "Archived",
    "sponsoredPlacements.accessibility.lifecycleFilters": "Campaign lifecycle filters",
    "sponsoredPlacements.preview.confirmCreate": "Confirm draft",
    "sponsoredPlacements.errors.forbidden": "You do not have permission to manage sponsored placements.",
    "sponsoredPlacements.states.loading": "Loading sponsored placements…",
  } as Record<string, string>)[key] ?? key,
}));

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t, i18n: { resolvedLanguage: "en" } }),
}));
vi.mock("@/components/providers/app-dialog", () => ({
  useAppDialog: () => ({
    prompt: vi.fn().mockResolvedValue(null),
    confirm: vi.fn().mockResolvedValue(true),
    alert: vi.fn().mockResolvedValue(undefined),
  }),
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function change(element: TestElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new TestEvent(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
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
    expect(container.textContent).toContain("Malaysia time (UTC+08:00)");
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.type === "checkbox" && element.getAttribute("aria-label") === "All states")).not.toBeNull();
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.type === "checkbox" && element.getAttribute("aria-label") === "All categories")).not.toBeNull();
    const position = findOne(container, (element) => element.tagName === "SELECT" && element.getAttribute("aria-label") === "Position");
    expect(position.options.map((option) => option.value)).toEqual(["1", "2", "3", "4"]);
  });

  it("uses a canonical state selector and renders all lifecycle filters", async () => {
    await render(root, <SponsoredPlacementsPage />);

    const allStates = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("aria-label") === "All states");
    await act(async () => {
      (allStates as TestElement & { checked: boolean }).checked = false;
      allStates.dispatchEvent(new TestEvent("click", { bubbles: true }));
      allStates.dispatchEvent(new TestEvent("change", { bubbles: true }));
    });

    const stateSelect = findOne(container, (element) => element.tagName === "SELECT" && element.getAttribute("aria-label") === "sponsoredPlacements.form.state");
    expect(stateSelect.options.some((option) => option.value === "Penang")).toBe(true);
    expect(container.textContent).toContain("Active / Scheduled");
    expect(container.textContent).toContain("Pending");
    expect(container.textContent).toContain("Drafts");
    expect(container.textContent).toContain("Recently paused");
    expect(container.textContent).toContain("Archived");
    const lifecycleFilters = findOne(container, (element) => element.getAttribute("role") === "tablist");
    expect(lifecycleFilters.getAttribute("aria-label")).toBe("Campaign lifecycle filters");
    expect(findElements(lifecycleFilters, (element) => element.getAttribute("role") === "tab")).toHaveLength(5);
    expect(stateSelect.className).toContain("h-10");
  });

  it("uses shared Admin primitives and Malaysia time for campaign presentation", async () => {
    mocks.fetch.mockResolvedValue(Response.json({
      data: {
        products: [],
        placements: [{
          id: "22222222-2222-4222-8222-222222222222",
          product_id: "11111111-1111-4111-8111-111111111111",
          state: null,
          category_slug: null,
          starts_at: "2026-10-01T00:00:00.000Z",
          ends_at: "2026-10-31T00:00:00.000Z",
          priority: 1,
          status: "approved",
          products: { id: "11111111-1111-4111-8111-111111111111", name: "Rainforest Walk" },
        }],
        archivedPlacements: [],
      },
      error: null,
    }));

    await render(root, <SponsoredPlacementsPage />);

    expect(container.textContent).toContain("Oct 1, 2026, 8:00 AM");
    const approved = findOne(container, (element) => element.tagName === "SPAN" && element.textContent === "sponsoredPlacements.status.approved");
    expect(approved.className).toContain("bg-primary/15");

    const source = readFileSync(resolve(process.cwd(), "app/admin/sponsored-placements/page.tsx"), "utf8");
    expect(source).toContain("<AdminSegmentedFilter");
    expect(source).toContain("<Button");
    expect(source).not.toContain("<button");
  });

  it("previews a draft before it sends the create mutation", async () => {
    const previewResponse = Response.json({
      data: {
        preview: {
          previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
          requestedPosition: 1,
          hasCollision: false,
          shifts: [],
          paused: [],
          archived: [],
          summary: { shiftedCount: 0, pausedCount: 0, archivedCount: 0 },
        },
      },
      error: null,
    });
    mocks.fetch
      .mockResolvedValueOnce(Response.json({
        data: {
          products: [{ id: "11111111-1111-4111-8111-111111111111", name: "Rainforest Walk" }],
          placements: [],
          archivedPlacements: [],
        },
        error: null,
      }))
      .mockResolvedValueOnce(previewResponse)
      .mockResolvedValueOnce(Response.json({ data: { placement: { id: "draft" } }, error: null }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        data: { products: [], placements: [], archivedPlacements: [] },
        error: null,
      }));

    await render(root, <SponsoredPlacementsPage />);
    await change(findOne(container, (element) => element.getAttribute("aria-label") === "Product"), "11111111-1111-4111-8111-111111111111");
    await change(findOne(container, (element) => element.getAttribute("aria-label") === "Starts at"), "2026-10-01T08:00");
    await change(findOne(container, (element) => element.getAttribute("aria-label") === "Ends at"), "2026-10-31T08:00");
    expect(findOne(container, (element) => element.getAttribute("aria-label") === "Ends at").getAttribute("min")).toBe("2026-10-01T08:00");

    const form = findOne(container, (element) => element.tagName === "FORM");
    await act(async () => {
      form.dispatchEvent(new TestEvent("submit", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][0]).toBe("/api/admin/sponsored-placements/preview");
    expect(JSON.parse(String((mocks.fetch.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-10-31T00:00:00.000Z",
    });
    expect(findOne(container, (element) => element.getAttribute("role") === "alertdialog")).not.toBeNull();
    expect(mocks.fetch.mock.calls.some((call) => call[0] === "/api/admin/sponsored-placements" && (call[1] as RequestInit | undefined)?.method === "POST")).toBe(false);

    const confirm = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "Confirm draft");
    await act(async () => {
      confirm.dispatchEvent(new TestEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    const createCall = mocks.fetch.mock.calls.find((call) => call[0] === "/api/admin/sponsored-placements" && (call[1] as RequestInit | undefined)?.method === "POST");
    expect(createCall).toBeDefined();
    expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({
      position: 1,
      previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
    });
  });

  it("blocks impact preview when the end is not later than the start", async () => {
    await render(root, <SponsoredPlacementsPage />);
    await change(findOne(container, (element) => element.getAttribute("aria-label") === "Starts at"), "2026-10-01T08:00");
    await change(findOne(container, (element) => element.getAttribute("aria-label") === "Ends at"), "2026-10-01T08:00");

    expect(container.textContent).toContain("End time must be later than start time.");
    expect(findOne(container, (element) => element.tagName === "BUTTON" && element.type === "submit").disabled).toBe(true);
  });

  it("previews an approval before it sends the transition mutation", async () => {
    mocks.fetch
      .mockResolvedValueOnce(Response.json({
        data: {
          products: [{ id: "11111111-1111-4111-8111-111111111111", name: "Rainforest Walk" }],
          placements: [{
            id: "22222222-2222-4222-8222-222222222222",
            product_id: "11111111-1111-4111-8111-111111111111",
            state: null,
            category_slug: null,
            starts_at: "2026-10-01T00:00:00.000Z",
            ends_at: "2026-10-31T00:00:00.000Z",
            priority: 1,
            status: "pending_approval",
            updated_at: "2026-09-09T00:00:00.000Z",
          }],
          archivedPlacements: [],
        },
        error: null,
      }))
      .mockResolvedValueOnce(Response.json({
        data: {
          preview: {
            previewVersion: "8d54a9a8c4dd8d27fbb2f6eecdf7d707",
            requestedPosition: 1,
            hasCollision: false,
            shifts: [],
            paused: [],
            archived: [],
            summary: { shiftedCount: 0, pausedCount: 0, archivedCount: 0 },
          },
        },
        error: null,
      }));

    await render(root, <SponsoredPlacementsPage />);
    const pendingTab = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("Pending"));
    await act(async () => pendingTab.dispatchEvent(new TestEvent("click", { bubbles: true })));
    const approve = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent === "Approve");
    await act(async () => {
      approve.dispatchEvent(new TestEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][0]).toBe("/api/admin/sponsored-placements/preview");
    expect(mocks.fetch.mock.calls.some((call) => String(call[0]).includes("22222222-2222-4222-8222-222222222222") && (call[1] as RequestInit | undefined)?.method === "PATCH")).toBe(false);
  });

  it("shows no more than the two newest paused campaigns", async () => {
    const paused = [1, 2, 3].map((position) => ({
      id: `${position}2222222-2222-4222-8222-222222222222`,
      product_id: `${position}1111111-1111-4111-8111-111111111111`,
      state: null,
      category_slug: null,
      starts_at: "2026-10-01T00:00:00.000Z",
      ends_at: "2026-10-31T00:00:00.000Z",
      priority: position,
      status: "paused",
      updated_at: `2026-09-0${position}T00:00:00.000Z`,
      products: { id: `${position}1111111-1111-4111-8111-111111111111`, name: `Paused ${position}` },
    }));
    mocks.fetch.mockResolvedValue(Response.json({
      data: { products: [], placements: paused, archivedPlacements: [] },
      error: null,
    }));

    await render(root, <SponsoredPlacementsPage />);
    const pausedTab = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("Recently paused"));
    await act(async () => pausedTab.dispatchEvent(new TestEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("Paused 3");
    expect(container.textContent).toContain("Paused 2");
    expect(container.textContent).not.toContain("Paused 1");
  });

  it("renders a permission-specific state when the server denies access", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }));

    await render(root, <SponsoredPlacementsPage />);

    expect(container.textContent).toContain("You do not have permission to manage sponsored placements.");
    expect(findElements(container, (element) => element.tagName === "FORM")).toHaveLength(0);
  });

  it("is linked from the existing localized Admin navigation", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260915222000_dynamic_staff_modules.sql"), "utf8");
    expect(migration).toContain("'/admin/sponsored-placements'");
    expect(migration).toContain("'Sponsored Placements'");
  });
});
