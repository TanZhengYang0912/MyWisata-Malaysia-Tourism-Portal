import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("place community section", () => {
  it("renders a Local Notes surface without star ratings or public user ids", () => {
    const source = read("components/customer/place-community-section.tsx");
    expect(source).toContain('t("ui.place.localNotes.title")');
    expect(source).toContain("/api/places/${placeId}/comments");
    expect(source).toContain('method: "POST"');
    expect(source).not.toContain("rating");
    expect(source).not.toContain("comment.userId");
  });

  it("supports anonymous posting toggle and rich avatar presentation", () => {
    const source = read("components/customer/place-community-section.tsx");
    expect(source).toContain("isAnonymous");
    expect(source).toContain('t("ui.place.localNotes.postAnonymously")');
    expect(source).toContain('t("ui.place.localNotes.postingAsAnonymous")');
    expect(source).toContain("Avatar");
    expect(source).toContain("AvatarFallback");
    expect(source).toContain("formatRelativeTime");
  });

  it("uses inline validation instead of the browser-native required tooltip", () => {
    const source = read("components/customer/place-community-section.tsx");
    expect(source).toContain("validationError");
    expect(source).toContain('t("ui.place.localNotes.required")');
    expect(source).toContain("aria-invalid");
    expect(source).not.toContain("required\n");
  });

  it("keeps the note composer compact and lays out notes as a responsive grid", () => {
    const source = read("components/customer/place-community-section.tsx");
    expect(source).toContain("min-h-20");
    expect(source).toContain("md:grid-cols-2");
  });

  it("uses progressive disclosure for the composer and an explicit notes sort control", () => {
    const source = read("components/customer/place-community-section.tsx");
    expect(source).toContain("isComposerExpanded");
    expect(source).toContain('aria-expanded={isComposerExpanded}');
    expect(source).toContain('t("ui.place.localNotes.sortBy")');
    expect(source).toContain('t("ui.place.localNotes.newest")');
    expect(source).toContain('t("ui.place.localNotes.oldest")');
  });

  it("gives each note a lightweight share action and an outlined pagination action", () => {
    const source = read("components/customer/place-community-section.tsx");
    expect(source).toContain("copyNoteLink");
    expect(source).toContain('t("ui.place.localNotes.copyLink")');
    expect(source).toContain('t("ui.place.localNotes.copied")');
    expect(source).toContain('variant="outline"');
  });
});
