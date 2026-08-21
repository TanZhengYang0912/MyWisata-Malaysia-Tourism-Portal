import { describe, expect, it } from "vitest";
import { getMalaysiaStateTranslationKey } from "../malaysia-states";

describe("getMalaysiaStateTranslationKey", () => {
  it("maps a known state to its customer translation key", () => {
    expect(getMalaysiaStateTranslationKey("Perak")).toBe("ui.malaysiaStates.perak");
  });

  it("leaves an unknown or absent state as user-authored content", () => {
    expect(getMalaysiaStateTranslationKey("Custom district")).toBeNull();
    expect(getMalaysiaStateTranslationKey(null)).toBeNull();
  });
});
