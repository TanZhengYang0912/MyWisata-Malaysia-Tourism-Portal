import { describe, expect, it } from "vitest";
import { calculateViewportClampedPopoverPosition } from "../use-viewport-clamped-popover-position";

describe("calculateViewportClampedPopoverPosition", () => {
  it("centers a panel under its trigger when it fits within the viewport", () => {
    const position = calculateViewportClampedPopoverPosition(
      { left: 200, bottom: 50, width: 36 },
      { width: 288 },
      { width: 500, height: 800 },
    );

    expect(position).toEqual({ position: "fixed", left: 74, top: 62, maxHeight: 730 });
  });

  it("keeps a panel against the right viewport gutter when its trigger is near the edge", () => {
    const position = calculateViewportClampedPopoverPosition(
      { left: 282, bottom: 50, width: 36 },
      { width: 288 },
      { width: 320, height: 800 },
    );

    expect(position).toEqual({ position: "fixed", left: 24, top: 62, maxHeight: 730 });
  });

  it("leaves an 8px gutter when the panel is wider than the available viewport", () => {
    const position = calculateViewportClampedPopoverPosition(
      { left: 120, bottom: 50, width: 36 },
      { width: 400 },
      { width: 320, height: 800 },
    );

    expect(position.left).toBe(8);
  });

  it("limits panel height to the space below the trigger", () => {
    const position = calculateViewportClampedPopoverPosition(
      { left: 200, bottom: 760, width: 36 },
      { width: 288 },
      { width: 500, height: 800 },
    );

    expect(position).toEqual({ position: "fixed", left: 74, top: 772, maxHeight: 20 });
  });
});
