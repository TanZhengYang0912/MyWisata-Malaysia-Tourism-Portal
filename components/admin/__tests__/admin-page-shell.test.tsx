import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";

describe("Admin page-shell presentation", () => {
  it("renders a semantic Admin main shell with shared responsive spacing", () => {
    const markup = renderToStaticMarkup(
      <AdminPageShell className="page-specific-class">
        <p>Queue content</p>
      </AdminPageShell>,
    );

    expect(markup).toContain("<main");
    expect(markup).toContain("min-h-full");
    expect(markup).toContain("bg-background");
    expect(markup).toContain("px-4");
    expect(markup).toContain("sm:px-6");
    expect(markup).toContain("sm:py-6");
    expect(markup).toContain("xl:px-8");
    expect(markup).toContain("page-specific-class");
    expect(markup).toContain("space-y-5");
    expect(markup).toContain("Queue content");
  });

  it("keeps heading content before responsive actions in the header DOM order", () => {
    const markup = renderToStaticMarkup(
      <AdminPageHeader
        eyebrow={<span>Operations</span>}
        title="Review queue"
        description="Prioritize open cases."
        actions={<button type="button">Refresh</button>}
      />,
    );

    expect(markup).toContain("<header");
    expect(markup).toContain("flex-col");
    expect(markup).toContain("lg:flex-row");
    expect(markup).toContain("lg:items-center");
    expect(markup).toContain("<h1");
    expect(markup.indexOf("Operations")).toBeLessThan(markup.indexOf("Review queue"));
    expect(markup.indexOf("Review queue")).toBeLessThan(markup.indexOf("Prioritize open cases."));
    expect(markup.indexOf("Prioritize open cases.")).toBeLessThan(markup.indexOf("Refresh"));
  });

  it("lets long mobile headings wrap and actions use the available row width", () => {
    const markup = renderToStaticMarkup(
      <AdminPageHeader
        title="A long governance heading that should wrap cleanly"
        actions={<button type="button">Refresh overview</button>}
      />,
    );

    expect(markup).toContain("min-w-0");
    expect(markup).toContain("break-words");
    expect(markup).toContain("w-full flex-wrap");
    expect(markup).toContain("lg:w-fit");
  });

  it("keeps a fragment eyebrow icon and label on the same aligned row", () => {
    const markup = renderToStaticMarkup(
      <AdminPageHeader
        eyebrow={
          <>
            <svg aria-hidden="true" />
            Malaysia Vendor Network
          </>
        }
        title="Vendor Approval"
      />,
    );

    expect(markup).toContain('class="mb-1 inline-flex max-w-full flex-wrap items-center gap-2');
    expect(markup.indexOf("<svg")).toBeLessThan(markup.indexOf("Malaysia Vendor Network"));
  });

  it("renders supplied metrics and omits the grid when there are no items", () => {
    const metricsMarkup = renderToStaticMarkup(
      <AdminMetricGrid
        items={[
          { label: "Needs action", value: 12, detail: "Open queues" },
          { label: "Flagged", value: 4, tone: "text-amber-700" },
          { label: "Reviewed", value: 28 },
        ]}
      />,
    );

    expect(metricsMarkup).toContain("grid");
    expect(metricsMarkup).toContain("grid-cols-2");
    expect(metricsMarkup).toContain("border-border");
    expect(metricsMarkup).toContain("bg-card");
    expect(metricsMarkup).toContain("rounded-2xl");
    expect(metricsMarkup).toContain("Needs action");
    expect(metricsMarkup).toContain("Flagged");
    expect(metricsMarkup).toContain("Reviewed");
    expect(metricsMarkup).toContain("text-amber-700");
    expect(renderToStaticMarkup(<AdminMetricGrid items={[]} />)).toBe("");
  });
});
