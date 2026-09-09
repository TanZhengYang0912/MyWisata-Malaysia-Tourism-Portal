import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findElements,
  findOne,
  installTestDom,
  TestEvent,
  type TestDocument,
  type TestElement,
} from "@/components/shared/__tests__/render-test-dom";
import { AdminDateTimeRangeField } from "@/components/admin/date-time-range-field";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;

async function render(root: ReturnType<typeof createRoot>, element: React.ReactElement) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
}

describe("AdminDateTimeRangeField", () => {
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

  it("renders a unified Admin range with native constraints and timezone help", async () => {
    await render(root, (
      <AdminDateTimeRangeField
        startsAt="2026-09-18T11:25"
        endsAt="2026-09-18T12:25"
        onStartsAtChange={vi.fn()}
        onEndsAtChange={vi.fn()}
        startsAtLabel="Starts at"
        endsAtLabel="Ends at"
        timezoneLabel="Malaysia time (UTC+08:00)"
        invalidRangeMessage="End time must be later than start time."
        required
      />
    ));

    const inputs = findElements(container, (element) => element.tagName === "INPUT" && element.type === "datetime-local");
    expect(inputs).toHaveLength(2);
    expect(inputs[0].getAttribute("aria-label")).toBe("Starts at");
    expect(inputs[1].getAttribute("aria-label")).toBe("Ends at");
    expect(inputs[1].getAttribute("min")).toBe("2026-09-18T11:25");
    expect(inputs.every((input) => input.hasAttribute("required"))).toBe(true);
    expect(inputs.every((input) => input.className.includes("h-10") && input.className.includes("rounded-xl"))).toBe(true);
    expect(container.textContent).toContain("Malaysia time (UTC+08:00)");

    const helpId = findOne(container, (element) => element.tagName === "P" && element.textContent.includes("Malaysia time")).id;
    expect(inputs[0].getAttribute("aria-describedby")).toContain(helpId);
    expect(inputs[1].getAttribute("aria-describedby")).toContain(helpId);
  });

  it("announces equal or reversed ranges and clears the error when corrected", async () => {
    const props = {
      startsAt: "2026-09-18T11:25",
      onStartsAtChange: vi.fn(),
      onEndsAtChange: vi.fn(),
      startsAtLabel: "Starts at",
      endsAtLabel: "Ends at",
      timezoneLabel: "Malaysia time (UTC+08:00)",
      invalidRangeMessage: "End time must be later than start time.",
    };

    await render(root, <AdminDateTimeRangeField {...props} endsAt="2026-09-18T11:25" />);

    const invalidEnd = findOne(container, (element) => element.getAttribute("aria-label") === "Ends at");
    expect(invalidEnd.getAttribute("aria-invalid")).toBe("true");
    expect(findOne(container, (element) => element.getAttribute("role") === "alert").textContent).toContain("End time must be later");

    await render(root, <AdminDateTimeRangeField {...props} endsAt="2026-09-18T11:26" />);

    expect(findOne(container, (element) => element.getAttribute("aria-label") === "Ends at").getAttribute("aria-invalid")).toBeNull();
    expect(findElements(container, (element) => element.getAttribute("role") === "alert")).toHaveLength(0);
  });

  it("forwards controlled input values to both change callbacks", async () => {
    const onStartsAtChange = vi.fn();
    const onEndsAtChange = vi.fn();
    await render(root, (
      <AdminDateTimeRangeField
        startsAt=""
        endsAt=""
        onStartsAtChange={onStartsAtChange}
        onEndsAtChange={onEndsAtChange}
        startsAtLabel="Starts at"
        endsAtLabel="Ends at"
        timezoneLabel="Malaysia time (UTC+08:00)"
        invalidRangeMessage="End time must be later than start time."
      />
    ));

    const start = findOne(container, (element) => element.getAttribute("aria-label") === "Starts at");
    const end = findOne(container, (element) => element.getAttribute("aria-label") === "Ends at");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(start), "value")?.set;
      setter?.call(start, "2026-09-18T11:25");
      start.dispatchEvent(new TestEvent("input", { bubbles: true }));
      setter?.call(end, "2026-09-18T12:25");
      end.dispatchEvent(new TestEvent("input", { bubbles: true }));
    });

    expect(onStartsAtChange).toHaveBeenCalledWith("2026-09-18T11:25");
    expect(onEndsAtChange).toHaveBeenCalledWith("2026-09-18T12:25");
  });
});
