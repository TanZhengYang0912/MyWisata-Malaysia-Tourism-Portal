import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { OperatingHours } from "@/backend/core/types";

import { OperatingHoursSummary } from "@/components/customer/operating-hours-summary";

let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let createRoot: typeof import("react-dom/client").createRoot;
let i18n: ReturnType<typeof createInstance>;

async function render(element: React.ReactElement) {
  await act(async () => {
    root?.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("compact operating hours summary", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
    const resources = Object.fromEntries(["en", "ms", "zh-CN"].map((locale) => [
      locale,
      { customer: JSON.parse(readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`), "utf8")) },
    ]));
    i18n = createInstance();
    await i18n.use(initReactI18next).init({
      lng: "en",
      resources,
      ns: ["customer"],
      defaultNS: "customer",
      interpolation: { escapeValue: false },
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T02:00:00.000Z"));
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
    vi.useRealTimers();
  });

  it("keeps the current weekday and full hours on a separate visible row", async () => {
    const hours: OperatingHours = { fri: { open: "09:00", close: "18:00" } };
    await render(
      <I18nextProvider i18n={i18n}>
        <OperatingHoursSummary hours={hours} currentlyOpen={false} compact />
      </I18nextProvider>,
    );

    const summary = findOne(container, (element) => element.tagName === "SUMMARY");
    expect(summary.className).toContain("grid-cols-[auto_minmax(0,1fr)]");

    const schedule = findOne(summary, (element) => element.className.includes("whitespace-normal"));
    expect(schedule.textContent).toContain("Fri");
    expect(schedule.textContent).toContain("09:00–18:00");
    expect(schedule.className).toContain("whitespace-normal");
    expect(schedule.className).not.toContain("truncate");
  });
});
