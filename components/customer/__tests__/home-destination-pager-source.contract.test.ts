import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hook = readFileSync(resolve(process.cwd(), "components/customer/use-home-destination-pager.ts"), "utf8");

describe("home destination pager hook", () => {
  it("reads the wheel's starting page from the live scroll position unless a page turn is still animating", () => {
    const sync = hook.slice(hook.indexOf("const sync = useCallback"), hook.indexOf("const goToPage = useCallback"));
    // sync() runs on every scroll; it must not pin pendingPageRef, or wheel turns after a touch/trackpad scroll start from a stale page.
    expect(sync).not.toContain("pendingPageRef.current =");
    expect(hook).toContain("pendingPageRef.current ?? currentPage()");
  });

  it("reads page count and position from railPagePosition so a part-full last page gets its own dot", () => {
    expect(hook).toContain('import { railPagePosition } from "@/lib/customer/rail-pages"');
    expect(hook).not.toContain("Math.round(viewport.scrollWidth / pageStep)");
    expect(hook).not.toContain("Math.round(viewport.scrollLeft /");
  });

  it("lets the browser scroll touch swipes and only pulls an overshooting fling back to one page", () => {
    expect(hook).toContain('import { limitSwipeToOnePage } from "@/lib/customer/touch-page-turn"');
    expect(hook).toContain('addEventListener("touchstart", onTouchStart, { passive: true })');
    expect(hook).toContain('addEventListener("touchend", onTouchEnd, { passive: true })');
    expect(hook).toContain("limitSwipeToOnePage({");
    // No pointer-driven paging: iPhone Safari sends pointercancel for a slightly diagonal swipe, so it never turned.
    expect(hook).not.toContain('addEventListener("pointerup"');
    expect(hook).not.toContain("setPointerCapture");
  });
});
