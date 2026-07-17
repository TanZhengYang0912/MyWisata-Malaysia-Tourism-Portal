# Outlet Studio preview, draft recovery, and media workflow

## Goal

Make the Outlet Studio safe to edit and easy to verify without leaving the
builder: fix stale Fast Refresh history calls, separate draft from published
preview, allow a vendor to discard a draft back to the published page, confirm
publishing, and make image upload/media reuse available near the canvas.

## Implementation

1. Add pure UI/editing helpers and tests for preview labels and deduplicated
   outlet media URLs.
2. Add a DELETE page API that resets `draft_document` to the published
   document while preserving the live page.
3. Add draft/published preview state, publish confirmation, discard-draft
   action, and a preview overlay to Outlet Studio.
4. Add canvas-adjacent upload controls, drag-and-drop file handling, and a
   lightweight media library sourced from the outlet page document.
5. Run focused tests, TypeScript, lint, production build, and the full test
   suite; report any pre-existing failures separately.
