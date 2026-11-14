import React, { act, createContext, useContext } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, installTestDom, TestEvent, type TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { label?: string }) => options?.label ? `Remove filter: ${options.label}` : ({
      "ui.listFilters.filters": "Filters",
      "ui.listFilters.sortBy": "Sort by",
      "ui.listFilters.clear": "Clear filters",
      "ui.listFilters.showResults": "Show results",
      "ui.discovery.searchLabel": "Search",
    } as Record<string, string>)[key] ?? key,
  }),
}));
vi.mock("@/backend/domains/catalogue", () => ({ CATEGORIES: [], STATES_MY: [] }));

vi.mock("@/components/ui/dialog", () => {
  const DialogState = createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({ open: false, onOpenChange: () => undefined });
  return {
    Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => <DialogState.Provider value={{ open, onOpenChange }}>{children}</DialogState.Provider>,
    DialogTrigger: ({ children }: { children: React.ReactElement<{ onClick?: () => void }> }) => {
      const dialog = useContext(DialogState);
      return React.cloneElement(children, { onClick: () => dialog.onOpenChange(true) });
    },
    DialogContent: ({ children, ...props }: React.ComponentProps<"div">) => useContext(DialogState).open ? <div {...props}>{children}</div> : null,
    DialogHeader: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }: React.ComponentProps<"h2">) => <h2 {...props}>{children}</h2>,
    DialogDescription: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p>,
  };
});

import { VendorListFilters } from "@/components/vendor/vendor-list-filters";

let document: ReturnType<typeof installTestDom>;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;

beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import("react-dom/client")); });
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

describe("VendorListFilters", () => {
  it("counts removable chips, clears filters, hides sort without options, and opens and closes the drawer", async () => {
    const onRemove = vi.fn();
    const onClearAll = vi.fn();
    await act(async () => {
      root.render(
        <VendorListFilters query="" onQueryChange={() => undefined} placeholder="Search" chips={[{ key: "status", label: "Active", onRemove }]} onClearAll={onClearAll} drawerTitle="Filters">
          <p>Drawer controls</p>
        </VendorListFilters>,
      );
    });

    const buttons = () => findElements(container, (element) => element.tagName === "BUTTON");
    const findButton = (label: string) => buttons().find((button) => button.textContent.includes(label));
    expect(findButton("Filters")?.textContent).toContain("1");
    expect(findElements(container, (element) => element.tagName === "SELECT")).toHaveLength(0);
    await act(async () => {
      root.render(
        <VendorListFilters query="" onQueryChange={() => undefined} placeholder="Search" sortOptions={[]} chips={[{ key: "status", label: "Active", onRemove }]} onClearAll={onClearAll} drawerTitle="Filters">
          <p>Drawer controls</p>
        </VendorListFilters>,
      );
    });
    expect(findElements(container, (element) => element.tagName === "SELECT")).toHaveLength(0);
    await act(async () => { buttons().find((button) => button.getAttribute("aria-label") === "Remove filter: Active")?.dispatchEvent(new TestEvent("click", { bubbles: true })); });
    expect(onRemove).toHaveBeenCalledOnce();
    await act(async () => { findButton("Clear filters")?.dispatchEvent(new TestEvent("click", { bubbles: true })); });
    expect(onClearAll).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Drawer controls");
    await act(async () => { findButton("Filters")?.dispatchEvent(new TestEvent("click", { bubbles: true })); });
    expect(container.textContent).toContain("Drawer controls");
    await act(async () => { findButton("Show results")?.dispatchEvent(new TestEvent("click", { bubbles: true })); });
    expect(container.textContent).not.toContain("Drawer controls");
  });
});
