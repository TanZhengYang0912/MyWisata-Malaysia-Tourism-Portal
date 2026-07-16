# Outlet Studio Editor UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make Outlet Studio practical for non-technical vendors by keeping the editor controls visible, making block actions obvious, and providing stable desktop/tablet/mobile preview sizes.

**Architecture:** Keep the existing section-based document model and public renderer. Refactor only the editor shell into a fixed-height studio with independent palette, canvas, and inspector scroll regions; add a small pure viewport/action configuration module so the UI behavior is testable without a browser DOM.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, lucide-react, Vitest.

## Global Constraints

- Do not change the persisted outlet page schema or public page API.
- Keep the current draft/publish flow intact.
- Preserve keyboard-accessible selection and buttons.
- Keep the same rendered document for public pages; editor-only chrome must not leak into public output.
- Verify with focused Vitest tests, `npx tsc --noEmit`, and `npm run lint`.

---

### Task 1: Add testable editor viewport and block-action rules

**Files:**
- Create: `components/vendor/outlet-builder-ui.ts`
- Test: `components/vendor/__tests__/outlet-builder-ui.test.ts`

**Interfaces:**
- `BuilderViewport = "desktop" | "tablet" | "mobile"`
- `getBuilderViewportConfig(view: BuilderViewport)` returns the label, target width, and Tailwind classes used by the canvas.
- `getBlockActionState(index: number, total: number)` returns whether moving up or down is allowed.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { getBlockActionState, getBuilderViewportConfig } from "@/components/vendor/outlet-builder-ui";

describe("outlet builder UI rules", () => {
  it("uses explicit preview widths for desktop, tablet, and mobile", () => {
    expect(getBuilderViewportConfig("desktop").width).toBe(1120);
    expect(getBuilderViewportConfig("tablet").width).toBe(768);
    expect(getBuilderViewportConfig("mobile").width).toBe(390);
    expect(getBuilderViewportConfig("mobile").label).toBe("Mobile 390px");
  });

  it("disables block movement at the relevant list edges", () => {
    expect(getBlockActionState(0, 3)).toEqual({ canMoveUp: false, canMoveDown: true });
    expect(getBlockActionState(1, 3)).toEqual({ canMoveUp: true, canMoveDown: true });
    expect(getBlockActionState(2, 3)).toEqual({ canMoveUp: true, canMoveDown: false });
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- components/vendor/__tests__/outlet-builder-ui.test.ts`

Expected: FAIL because the new UI module does not exist yet.

- [ ] **Step 3: Implement the minimal pure helpers**

Create the `BuilderViewport` type, the three configurations with widths `1120`, `768`, and `390`, and the edge-aware action-state function.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- components/vendor/__tests__/outlet-builder-ui.test.ts`

Expected: PASS with 2 tests passing.

### Task 2: Refactor the studio shell into independent scroll regions

**Files:**
- Modify: `components/vendor/outlet-page-builder.tsx`

**Interfaces:**
- Use `BuilderViewport` for the selected preview mode.
- Keep `OutletBuilderPalette`, `OutletBuilderCanvas`, and `OutletBuilderInspector` as separate child responsibilities.

- [ ] **Step 1: Add the three-mode viewport state and controls**

Use `Monitor`, `Tablet`, and `Smartphone` controls with visible labels, and set `view` to `"desktop" | "tablet" | "mobile"`.

- [ ] **Step 2: Make the modal shell fixed-height**

Change the outer editor to fill the viewport and make its header `shrink-0`. Use a `min-h-0 flex-1` content row so the browser page itself does not become the editor scroll surface.

- [ ] **Step 3: Give palette, canvas, and inspector independent scroll behavior**

Use `min-h-0 overflow-y-auto` on the left settings column and the right inspector. Keep the center column `overflow-hidden` with the canvas owning its vertical scrolling. On small screens stack the regions and cap the inspector height so the inputs remain usable.

- [ ] **Step 4: Add selected-section context in the inspector**

Pass a compact `Editing: <section>` heading and keep the inspector's current selected block content. The inspector should remain visible while the center canvas scrolls.

### Task 3: Replace clipped arrows with a visible block toolbar

**Files:**
- Modify: `components/vendor/outlet-page-builder.tsx`
- Modify: `components/vendor/outlet-builder-canvas.tsx`

**Interfaces:**
- Add `onDuplicate(blockId: string)` to the canvas props.
- Keep `onMove(blockId, targetIndex)` as the single ordering mutation.

- [ ] **Step 1: Add duplicate behavior in the page builder**

Clone the selected block with a new id from `createOutletPageBlock(block.type)`, copy its fields, insert it after the source, and select the new block.

- [ ] **Step 2: Add explicit block action buttons**

Render a toolbar inside each block, rather than outside the canvas edge. Use icon plus short visible labels for `Move up`, `Move down`, `Duplicate`, and `Delete`; disable movement at the relevant list edge; keep a separate visible drag handle.

- [ ] **Step 3: Keep the toolbar visible for selected blocks**

Selected blocks show the toolbar at all times. Unselected blocks reveal it on hover/focus. Use a stronger amber/blue selection ring and `aria-label`s for every control.

- [ ] **Step 4: Scroll the selected block into view**

Store block element refs and call `scrollIntoView({ block: "center", behavior: "smooth" })` when the selected block changes, so clicking a block and editing it keeps the selection in context.

### Task 4: Add stable viewport framing and editor empty states

**Files:**
- Modify: `components/vendor/outlet-builder-canvas.tsx`
- Modify: `components/outlet/outlet-block-renderer.tsx`

**Interfaces:**
- Use the viewport config from Task 1 for editor-only width and frame classes.
- Preserve the existing `mode="editor"` and `mode="public"` rendering contract.

- [ ] **Step 1: Wrap desktop/tablet/mobile previews in explicit frames**

Desktop uses a bounded `1120px` canvas, tablet uses `768px`, and mobile uses a centered `390px` phone-style frame with a visible bezel. Permit horizontal scrolling only inside the stage when a viewport is wider than the available editor column.

- [ ] **Step 2: Add clear editor placeholders for incomplete blocks**

When an editor image block has no image, show a dashed `Drop image here` placeholder. When a product grid has no selected products, show `Select products in the editor`. These messages are editor-only and must not appear in public mode.

- [ ] **Step 3: Run the focused test and static checks**

Run:

```bash
npm test -- components/vendor/__tests__/outlet-builder-ui.test.ts components/vendor/__tests__/outlet-builder-history.test.ts
npx tsc --noEmit
npm run lint
```

Expected: focused tests pass, TypeScript exits 0, and lint reports no errors.

### Task 5: Final verification

**Files:**
- Verify: all changed files and current branch diff.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: no new failures beyond the repository's known pre-existing failures.

- [ ] **Step 2: Review the diff and working tree**

Run: `git diff --check && git status --short`.

Expected: no whitespace errors; only the planned editor files and plan/test artifacts are changed.

- [ ] **Step 3: Report the exact files and verification results**

Include the branch name, changed files, what the user can inspect in the Vendor Portal, and any remaining work that was intentionally not included.
