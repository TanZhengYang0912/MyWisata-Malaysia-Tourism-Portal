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
});
