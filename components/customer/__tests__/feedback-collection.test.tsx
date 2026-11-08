import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => `${key}${options?.author ? `:${options.author}` : ""}` }),
}));

vi.mock("lucide-react", () => ({
  Star: (props: Record<string, unknown>) => <svg {...props} data-icon="star" />,
}));

vi.mock("@/components/ui/dialog", async () => {
  const ReactModule = await import("react");
  const DialogState = ReactModule.createContext<{ open: boolean; onOpenChange: (open: boolean) => void }>({ open: false, onOpenChange: () => {} });
  return {
    Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => (
      <DialogState.Provider value={{ open, onOpenChange }}>{children}</DialogState.Provider>
    ),
    DialogContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
      const state = ReactModule.useContext(DialogState);
      return state.open ? <div role="dialog" {...props}>{children}<button type="button" aria-label="mock close" onClick={() => state.onOpenChange(false)} /></div> : null;
    },
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  };
});

import { FeedbackCollection, type FeedbackReviewItem, type FeedbackTipItem } from "@/components/customer/feedback/feedback-collection";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;

const longBody = "A useful local note with the full details that should only appear after opening the card.";

async function render(element: React.ReactElement) {
  await act(async () => {
    root?.render(element);
    await Promise.resolve();
  });
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("FeedbackCollection", () => {
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

  it("shows a one-line review preview and opens full rating details when activated", async () => {
    const items: FeedbackReviewItem[] = [{
      id: "review-1",
      author: "Customer A",
      date: "Sep 12, 2026",
      preview: "Fresh and satisfying",
      content: longBody,
      rating: 5,
      ratingLabel: "5.0 / 5",
      title: "Lovely meal",
      detailTitle: "Lovely meal",
    }];

    await render(<FeedbackCollection mode="reviews" items={items} controls={<button type="button">All ratings</button>} />);

    expect(container.textContent).toContain("Fresh and satisfying");
    expect(container.textContent).not.toContain("Lovely meal");
    expect(container.textContent).toContain("All ratings");
    expect(container.textContent).not.toContain(longBody);
    expect(findElements(container, (element) => element.className.includes("line-clamp-1"))).toHaveLength(1);

    const trigger = findElements(container, (element) => element.tagName === "BUTTON" && element.hasAttribute("data-feedback-trigger"))[0];
    expect(trigger).toBeDefined();
    expect(trigger?.getAttribute("aria-label")).toContain("ui.feedback.openReview:Customer A");
    await click(trigger!);

    expect(findElements(container, (element) => element.getAttribute("role") === "dialog")).toHaveLength(1);
    expect(container.textContent).toContain(longBody);
    expect(container.textContent).toContain("Lovely meal");
    expect(container.textContent).toContain("5.0 / 5");
  });

  it("shows tips without rating UI and opens full note details", async () => {
    const items: FeedbackTipItem[] = [{
      id: "tip-1",
      author: "Customer B",
      date: "Sep 4, 2026",
      preview: "A practical tip for visitors",
      content: longBody,
      actions: <button type="button">Copy link</button>,
    }];

    await render(<FeedbackCollection mode="tips" items={items} controls={<button type="button">Newest</button>} />);

    expect(container.textContent).toContain("A practical tip for visitors");
    expect(container.textContent).toContain("Newest");
    expect(container.textContent).toContain("Copy link");
    expect(container.textContent).not.toContain(longBody);
    expect(findElements(container, (element) => element.getAttribute("data-icon") === "star")).toHaveLength(0);

    const trigger = findElements(container, (element) => element.tagName === "BUTTON" && element.hasAttribute("data-feedback-trigger"))[0];
    expect(trigger?.getAttribute("aria-label")).toContain("ui.feedback.openTip:Customer B");
    await click(trigger!);

    expect(container.textContent).toContain(longBody);
    expect(findElements(container, (element) => element.getAttribute("role") === "dialog")).toHaveLength(1);
    expect(findElements(container, (element) => element.getAttribute("data-icon") === "star")).toHaveLength(0);
  });

  it("stacks a review rating below the author on narrow screens", async () => {
    const items: FeedbackReviewItem[] = [{
      id: "review-mobile",
      author: "Customer D",
      date: "Sep 12, 2026",
      preview: "A readable phone-sized review preview",
      content: longBody,
      rating: 4,
      ratingLabel: "4.0 / 5",
    }];

    await render(<FeedbackCollection mode="reviews" items={items} />);

    const responsiveHeader = findElements(container, (element) =>
      element.className.includes("flex-col") && element.className.includes("sm:flex-row"),
    );

    expect(responsiveHeader).toHaveLength(1);
    expect(responsiveHeader[0].className).toContain("items-start");
    expect(container.textContent).toContain("Customer D");
    expect(container.textContent).toContain("4.0 / 5");
  });

  it("uses tighter mobile spacing for reviews while preserving tip card spacing", async () => {
    const reviewItems: FeedbackReviewItem[] = [{
      id: "review-compact",
      author: "Customer E",
      date: "Sep 12, 2026",
      preview: "A compact review preview",
      content: longBody,
      rating: 4,
      ratingLabel: "4.0 / 5",
    }];

    await render(<FeedbackCollection mode="reviews" items={reviewItems} />);

    const reviewTrigger = findElements(container, (element) => element.hasAttribute("data-feedback-trigger"))[0];
    const reviewPreview = findElements(container, (element) => element.className.includes("line-clamp-1"))[0];
    expect(reviewTrigger?.className).toContain("p-3 sm:p-4");
    expect(reviewPreview?.className).toContain("leading-5 sm:mt-2 sm:leading-6");

    await render(<FeedbackCollection mode="tips" items={[{
      id: "tip-spacing",
      author: "Customer F",
      date: "Sep 4, 2026",
      preview: "A tip preview",
      content: longBody,
    }]} />);

    const tipTrigger = findElements(container, (element) => element.hasAttribute("data-feedback-trigger"))[0];
    expect(tipTrigger?.className).toContain("p-4");
    expect(tipTrigger?.className).not.toContain("p-3 sm:p-4");
  });

  it("uses native keyboard-focusable buttons for card activation", async () => {
    const items: FeedbackTipItem[] = [{ id: "tip-2", author: "Customer C", date: "Today", preview: "Short preview", content: longBody }];
    await render(<FeedbackCollection mode="tips" items={items} />);
    const trigger = findElements(container, (element) => element.tagName === "BUTTON" && element.hasAttribute("data-feedback-trigger"))[0];

    expect(trigger?.getAttribute("type")).toBe("button");
    expect(trigger?.className).toContain("focus-visible:ring");

    // Browsers synthesize click from Enter/Space on native buttons; dispatch the
    // resulting click after the key event to exercise the shared activation path.
    trigger?.dispatchEvent(new TestEvent("keydown", { bubbles: true }));
    await click(trigger!);
    expect(findElements(container, (element) => element.getAttribute("role") === "dialog")).toHaveLength(1);
  });
});
