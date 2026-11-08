import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === "pagination.range" ? `${options?.from}–${options?.to} of ${options?.total} results` : key,
  }),
}));

import { Pagination, getPageRange, resolvePageInput } from "@/components/shared/pagination";

const render = (props: Partial<React.ComponentProps<typeof Pagination>> = {}) =>
  renderToStaticMarkup(
    <Pagination currentPage={3} totalPages={20} totalItems={473} pageSize={24} onPageChange={() => undefined} {...props} />,
  );

describe("resolvePageInput", () => {
  it("accepts integers inside 1…totalPages", () => {
    expect(resolvePageInput("5", 20)).toBe(5);
    expect(resolvePageInput(" 20 ", 20)).toBe(20);
  });

  it("rejects anything else so the pager restores the current page", () => {
    for (const raw of ["0", "21", "abc", "", "2.5", "-1"]) expect(resolvePageInput(raw, 20)).toBeNull();
  });
});

describe("getPageRange", () => {
  it("clips the last page to the item total", () => {
    expect(getPageRange(3, 24, 473)).toEqual({ from: 49, to: 72 });
    expect(getPageRange(20, 24, 473)).toEqual({ from: 457, to: 473 });
  });
});

describe("Pagination", () => {
  it("bolds the range inside the translated summary", () => {
    expect(render()).toContain('<span class="font-bold text-foreground">49–72</span> of 473 results');
  });

  it("disables First and Previous on page 1, Next and Last on the last page", () => {
    const first = render({ currentPage: 1 });
    expect(first).toMatch(/disabled="" aria-label="accessibility.firstPage"/);
    expect(first).toMatch(/disabled="" aria-label="accessibility.previousPage"/);
    expect(first).not.toMatch(/disabled="" aria-label="accessibility.nextPage"/);
    const last = render({ currentPage: 20 });
    expect(last).toMatch(/disabled="" aria-label="accessibility.nextPage"/);
    expect(last).toMatch(/disabled="" aria-label="accessibility.lastPage"/);
  });

  it("shows the editable current page over the total", () => {
    const html = render();
    expect(html).toContain('aria-label="pagination.goToPage"');
    expect(html).toContain('value="3"');
    expect(html).toContain(">20</span>");
  });

  it("renders nothing without items and only the summary for a single page", () => {
    expect(render({ totalItems: 0, totalPages: 0 })).toBe("");
    const single = render({ currentPage: 1, totalPages: 1, totalItems: 5 });
    expect(single).toContain("1–5</span> of 5 results");
    expect(single).not.toContain("<button");
  });

  it("disables every control while the consumer is loading", () => {
    const html = render({ disabled: true });
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(4);
    expect(html).toMatch(/<input[^>]*disabled=""/);
  });

  it("can hide the summary for compact panels", () => {
    expect(render({ showSummary: false })).not.toContain("of 473 results");
  });
});
