import { describe, expect, it } from "vitest";
import {
  duplicateOutletPageBlock,
  getBuilderConfirmationCopy,
  getBuilderBlockLabel,
  getBlockActionState,
  getBlockMoveTargetIndex,
  getBuilderPreviewLabel,
  getBuilderViewportConfig,
  getPublishedOutletFeedback,
  isOutletBuilderBusy,
} from "@/components/vendor/outlet-builder-ui";
import {
  BUILDER_PALETTE_GROUPS,
  BUILDER_PALETTE,
} from "@/components/vendor/outlet-builder-palette";

describe("outlet builder UI rules", () => {
  it("uses explicit preview widths for desktop, tablet, and mobile", () => {
    expect(getBuilderViewportConfig("desktop").width).toBe(1120);
    expect(getBuilderViewportConfig("tablet").width).toBe(768);
    expect(getBuilderViewportConfig("mobile").width).toBe(390);
    expect(getBuilderViewportConfig("mobile").label).toBe("Mobile 390px");
  });

  it("disables block movement at the relevant list edges", () => {
    expect(getBlockActionState(0, 3)).toEqual({
      canMoveUp: false,
      canMoveDown: true,
    });
    expect(getBlockActionState(1, 3)).toEqual({
      canMoveUp: true,
      canMoveDown: true,
    });
    expect(getBlockActionState(2, 3)).toEqual({
      canMoveUp: true,
      canMoveDown: false,
    });
  });

  it("duplicates a block with a fresh id while retaining its content", () => {
    const source = {
      id: "text-original",
      type: "text" as const,
      title: "Our story",
      body: "A local experience.",
    };

    const duplicate = duplicateOutletPageBlock(source);

    expect(duplicate).toMatchObject({
      type: "text",
      title: "Our story",
      body: "A local experience.",
    });
    expect(duplicate.id).not.toBe(source.id);
  });

  it("calculates a real reorder target for up and down actions", () => {
    expect(getBlockMoveTargetIndex(1, "up")).toBe(0);
    expect(getBlockMoveTargetIndex(1, "down")).toBe(3);
  });

  it("labels draft and published previews clearly", () => {
    expect(getBuilderPreviewLabel("draft")).toBe("Draft preview");
    expect(getBuilderPreviewLabel("published")).toBe("Published version");
  });

  it("explains publish and discard confirmations in the UI", () => {
    expect(getBuilderConfirmationCopy("publish")).toEqual({
      title: "Publish this draft?",
      body: "Customers will see these changes on the public shop.",
      confirm: "Publish now",
    });
    expect(getBuilderConfirmationCopy("discard").confirm).toBe("Discard draft");
  });

  it("uses one photo tool for both image layouts", () => {
    expect(BUILDER_PALETTE.filter((item) => ["image", "image_text"].includes(item.type))).toEqual([
      expect.objectContaining({ type: "image_text", label: "Photo" }),
    ]);
    expect(getBuilderBlockLabel("image")).toBe("Photo");
    expect(getBuilderBlockLabel("image_text")).toBe("Photo");
  });

  it("organizes builder tools into user-facing categories", () => {
    expect(BUILDER_PALETTE_GROUPS.map((group) => group.label)).toEqual([
      "Common content",
      "Products & sales",
      "Outlet information",
      "Trust & reviews",
    ]);
    expect(BUILDER_PALETTE_GROUPS[0].defaultOpen).toBe(true);
    expect(BUILDER_PALETTE_GROUPS.flatMap((group) => group.items).length).toBe(
      BUILDER_PALETTE.length,
    );
  });

  it("keeps the builder busy while publishing so close cannot interrupt it", () => {
    expect(isOutletBuilderBusy({ saving: false, publishing: true, discarding: false, closing: false })).toBe(true);
    expect(isOutletBuilderBusy({ saving: false, publishing: false, discarding: false, closing: false })).toBe(false);
  });

  it("creates a clear global message for a published outlet page", () => {
    expect(getPublishedOutletFeedback("KLCC", "12")).toBe(
      "KLCC shop page published successfully. Customer shop now uses version 12.",
    );
  });
});
