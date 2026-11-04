import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";

describe("Breadcrumbs", () => {
  it("links ancestors and marks the final name as the current page", () => {
    const markup = renderToStaticMarkup(<Breadcrumbs label="Breadcrumb" items={[{ label: "Home", href: "/customer" }, { label: "A long destination name" }]} />);
    expect(markup).toContain('href="/customer"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("A long destination name");
    expect(markup.match(/<nav/g)).toHaveLength(1);
  });
  it("renders nothing for an empty trail", () => {
    expect(renderToStaticMarkup(<Breadcrumbs label="Breadcrumb" items={[]} />)).toBe("");
  });
});
