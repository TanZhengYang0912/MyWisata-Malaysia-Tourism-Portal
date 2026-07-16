import { describe, expect, it } from "vitest";
import { createDefaultOutletPageDocument } from "@/lib/vendor/outlet-page-schema";
import {
  getOutletBuilderDraftStorageKey,
  getOutletBuilderMediaUrls,
  OUTLET_BUILDER_AUTOSAVE_DELAY_MS,
  parseOutletBuilderLocalDraft,
  serializeOutletBuilderLocalDraft,
  updateOutletPageInlineText,
} from "@/components/vendor/outlet-builder-editing";

describe("outlet builder editing helpers", () => {
  it("updates only the requested hero or block field", () => {
    const document = createDefaultOutletPageDocument("City Square");
    const blockId = document.blocks[0].id;

    const heroUpdated = updateOutletPageInlineText(document, {
      scope: "hero",
      field: "title",
      value: "A new hero title",
    });
    const blockUpdated = updateOutletPageInlineText(heroUpdated, {
      scope: "block",
      blockId,
      field: "body",
      value: "A new story",
    });

    expect(blockUpdated.hero.title).toBe("A new hero title");
    expect(blockUpdated.blocks[0].body).toBe("A new story");
    expect(blockUpdated.blocks[0].title).toBe(document.blocks[0].title);
    expect(blockUpdated.blocks[1]).toEqual(document.blocks[1]);
  });

  it("scopes local Draft storage keys by vendor and outlet", () => {
    expect(getOutletBuilderDraftStorageKey("vendor-1", "outlet-1")).toBe(
      "outlet-studio-draft:vendor-1:outlet-1",
    );
    expect(
      getOutletBuilderDraftStorageKey("vendor-1", "outlet-2"),
    ).not.toBe(getOutletBuilderDraftStorageKey("vendor-1", "outlet-1"));
  });

  it("rejects malformed local Draft snapshots", () => {
    expect(parseOutletBuilderLocalDraft("not-json")).toBeNull();
    expect(parseOutletBuilderLocalDraft(JSON.stringify({ document: null }))).toBeNull();
  });

  it("round-trips a valid local Draft snapshot", () => {
    const document = createDefaultOutletPageDocument("City Square");
    const parsed = parseOutletBuilderLocalDraft(
      serializeOutletBuilderLocalDraft(document, 4, 123),
    );

    expect(parsed?.draftVersion).toBe(4);
    expect(parsed?.updatedAt).toBe(123);
    expect(parsed?.document.hero.title).toBe("City Square");
    expect(parsed?.pending).toBe(true);
  });

  it("uses a slower idle delay for server autosave", () => {
    expect(OUTLET_BUILDER_AUTOSAVE_DELAY_MS).toBe(8000);
  });

  it("deduplicates media URLs available to the outlet library", () => {
    const document = createDefaultOutletPageDocument("City Square");
    document.hero.imageUrl = "https://example.com/hero.jpg";
    document.gallery = [
      { url: "https://example.com/hero.jpg" },
      { url: "https://example.com/gallery.jpg" },
    ];
    document.blocks[0].imageUrl = "https://example.com/gallery.jpg";

    expect(getOutletBuilderMediaUrls(document)).toEqual([
      "https://example.com/hero.jpg",
      "https://example.com/gallery.jpg",
    ]);
  });
});
