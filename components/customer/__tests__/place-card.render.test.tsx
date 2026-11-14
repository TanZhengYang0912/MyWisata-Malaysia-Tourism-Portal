import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/backend/core/types";

// English copy straight from the locale file, so the card is checked against what customers read.
const en = JSON.parse(readFileSync(resolve(process.cwd(), "app/i18n/locales/en/customer.json"), "utf8"));
function t(key: string, options: Record<string, unknown> = {}) {
  const lookup = (path: string) => path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
  const plural = typeof options.count === "number" ? lookup(`${key}_${options.count === 1 ? "one" : "other"}`) : undefined;
  const text = (plural ?? lookup(key) ?? key) as string;
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ""));
}

const translated: { entityType: string; entityId: string; field: string; sourceText: string }[] = [];

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/shared/reference-price", () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR.toFixed(2)}</span> }));
vi.mock("@/components/customer/localized-content", () => ({
  LocalizedContent: (props: { entityType: string; entityId: string; field: string; sourceText: string; children?: (value: { text: string; control: null }) => React.ReactNode }) => {
    translated.push({ entityType: props.entityType, entityId: props.entityId, field: props.field, sourceText: props.sourceText });
    return props.children ? props.children({ text: props.sourceText, control: null }) : <span>{props.sourceText}</span>;
  },
}));

import { PlaceCard } from "@/components/customer/place-card";

const placeFixture: Place = {
  id: "poi-1", parentId: "melaka", level: "poi", name: "A Famosa", slug: "a-famosa",
  tagline: null, intro: null, imageUrl: "/a-famosa.jpg", state: "Melaka", district: "Melaka Tengah",
  lat: 2.19, lng: 102.25, entryFee: null, managedByVendorId: null, detail: null,
};
const render = (place: Partial<Place>, productCount = 0) => renderToStaticMarkup(<PlaceCard place={{ ...placeFixture, ...place }} productCount={productCount} />);

beforeEach(() => { translated.length = 0; });

describe("PlaceCard on the shared place card", () => {
  it("does not call a paid place free when it has no linked products", () => {
    const html = render({ entryFee: 25 }, 0);
    expect(html).toContain('data-card-frame="place"');
    expect(html).toContain("RM25.00");
    expect(html).toContain("Reference Entry");
    expect(html).not.toContain("Free to explore");
    expect(html).not.toContain("vendor option");
  });

  it("shows free entry and counts linked experiences, never as vendors", () => {
    const html = render({ entryFee: 0 }, 2);
    expect(html).toContain("Free Entry");
    expect(html).toContain("2 Experiences");
    expect(html).not.toContain("vendor");
    expect(render({ entryFee: 0 }, 1)).toContain("1 Experience<");
  });

  it("says when entry is not specified and shows no count without products", () => {
    const html = render({ entryFee: null }, 0);
    expect(html).toContain("Entry Not Specified");
    expect(html).not.toContain("Experience");
    expect(html).not.toContain("No gate");
  });

  it("is one whole-card link to the place with no badge, buttons, rating, save or share", () => {
    const html = render({ entryFee: 0 }, 3);
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('href="/customer/place/a-famosa"');
    expect(links[0]).toContain("data-card-link");
    expect(html).not.toContain("<button");
    expect(html).not.toMatch(/>poi</i);
    expect(html).not.toContain("View details");
    expect(html).not.toContain("Choose options");
    expect(html).not.toContain("data-save");
    expect(html).not.toContain("data-share");
    expect(html.split("Melaka Tengah, Melaka")).toHaveLength(2);
    expect(html).not.toContain('src=""');
  });

  it("falls back to its initial when there is no image", () => {
    const html = render({ imageUrl: null });
    expect(html).not.toContain("<img");
    expect(html).toContain(">A<");
  });

  it("prefers a real tagline, then a real intro, and otherwise shows no description", () => {
    expect(render({ tagline: "Portuguese fortress gate.", intro: "Long intro." })).toContain("Portuguese fortress gate.");
    expect(translated.map(({ field }) => field)).toEqual(["name", "tagline"]);

    translated.length = 0;
    const introHtml = render({ tagline: "   ", intro: "Built in 1511." });
    expect(introHtml).toContain("Built in 1511.");
    expect(translated.map(({ field }) => field)).toEqual(["name", "intro"]);

    translated.length = 0;
    const bare = render({ tagline: " ", intro: null });
    expect(bare).not.toContain(en.ui.place.cardFallback);
    expect(translated.map(({ field }) => field)).toEqual(["name"]);
    expect(translated.every(({ entityType, entityId }) => entityType === "place" && entityId === "poi-1")).toBe(true);
  });
});
