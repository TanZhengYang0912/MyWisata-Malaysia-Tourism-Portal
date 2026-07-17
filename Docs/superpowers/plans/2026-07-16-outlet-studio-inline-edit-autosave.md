# Outlet Studio Inline Edit and Autosave Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Let vendors edit common text and image URL content directly on the Canvas while automatically preserving unsaved Draft work across refreshes and accidental navigation.

**Architecture:** Keep the existing outlet page schema and PATCH API. Add pure, tested helpers for inline document updates and browser-local Draft snapshots; wire those helpers into the existing Canvas and page-builder lifecycle. Successful server saves clear the local recovery snapshot, while unsaved changes are written locally and trigger a browser leave warning.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest, browser localStorage.

## Global Constraints

- Do not change the persisted outlet page schema or public renderer behavior.
- Inline controls must render only for `mode="editor"`; public shops remain normal headings, paragraphs, and images.
- Autosave must use the existing authenticated page PATCH endpoint and draft-version conflict handling.
- Local recovery data is scoped by vendor and outlet and is cleared after a successful server save.

---

### Task 1: Add tested inline update and local recovery helpers

**Files:**
- Create: `components/vendor/outlet-builder-editing.ts`
- Test: `components/vendor/__tests__/outlet-builder-editing.test.ts`

**Interfaces:**
- `updateOutletPageInlineText(document, target, value)` updates only the selected hero/block title or body.
- `getOutletBuilderDraftStorageKey(vendorId, outletId)` returns a stable browser key.
- `parseOutletBuilderLocalDraft(raw)` safely parses a stored snapshot or returns `null`.

- [ ] **Step 1: Write failing tests**

Test hero title updates, block body updates without changing other blocks, stable scoped keys, and invalid local JSON returning `null`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- components/vendor/__tests__/outlet-builder-editing.test.ts`

Expected: FAIL because the new helper module does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Use immutable document updates and `normalizeOutletPageDocument` when parsing a stored snapshot so malformed local data cannot enter the editor state.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- components/vendor/__tests__/outlet-builder-editing.test.ts`

Expected: PASS.

### Task 2: Add direct Canvas editing

**Files:**
- Modify: `components/outlet/outlet-block-renderer.tsx`
- Modify: `components/vendor/outlet-builder-canvas.tsx`
- Modify: `components/vendor/outlet-page-builder.tsx`

**Interfaces:**
- Editor renderer receives optional `onEditHero` and `onEditBlock` callbacks.
- Page builder exposes immutable updates by explicit hero/block id, not only by the current inspector selection.

- [ ] **Step 1: Add editor-only controls to the renderer**

Render a title input and body textarea for editor mode, and keep public mode as the current heading/paragraph output. For image blocks, show an editor-only URL input beside the media placeholder/preview; stop input clicks from changing the selected block.

- [ ] **Step 2: Wire Canvas callbacks to page state**

When an input changes, update the document, select that block, and mark the document dirty. Keep the existing right inspector synchronized because both views read the same document.

- [ ] **Step 3: Preserve accessible selection behavior**

Inputs need visible focus rings, labels or `aria-label`s, and must remain usable on the mobile viewport.

### Task 3: Add autosave, local recovery, and leave protection

**Files:**
- Modify: `components/vendor/outlet-page-builder.tsx`

**Interfaces:**
- Local snapshot key is generated from `vendorId` and `outletId`.
- `saveDraft` accepts a silent/automatic mode so autosave does not replace the user's status message with a noisy toast.

- [ ] **Step 1: Restore a local snapshot after the server Draft loads**

If a valid local snapshot exists for this outlet, load it over the server draft, set the correct dirty state, and show `Recovered unsaved changes from this browser.`. Do not restore a snapshot after a successful server save because successful save clears it.

- [ ] **Step 2: Persist dirty documents locally**

Debounce localStorage writes by about 300ms and include the document, draft version, and `updatedAt` timestamp.

- [ ] **Step 3: Autosave to the existing PATCH endpoint**

Debounce server autosave by about 1200ms. Reuse draft-version checks; on success clear local recovery data and show a compact `Draft autosaved.` status. On failure keep the local snapshot and show the error.

- [ ] **Step 4: Protect unsaved work on navigation**

Add a `beforeunload` handler while dirty and confirm before closing the Builder with the X button.

### Task 4: Verify the two enhancements

**Files:**
- Verify: all changed files and tests.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- components/vendor/__tests__/outlet-builder-editing.test.ts components/vendor/__tests__/outlet-builder-ui.test.ts components/vendor/__tests__/outlet-builder-history.test.ts`

- [ ] **Step 2: Run static checks and build**

Run: `npx tsc --noEmit`, `npm run lint`, and `npm run build` with the existing local environment loaded without printing secrets.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git status --short`.

Report the exact files changed, how to test inline editing and recovery, and any known pre-existing full-suite failures.
