# Outlet Builder Photo Palette Implementation Plan

**Goal:** Replace the duplicate Image and Image + text tools with one Photo tool and organize the builder palette into collapsible, user-facing categories.

**Architecture:** Keep the existing `image` and `image_text` block types for backwards compatibility. New Photo blocks use `image_text` by default, while the inspector lets vendors switch between Image only and Image + story layouts. The palette exposes grouped metadata and keeps drag/click insertion unchanged.

**Verification:** Add unit coverage for the grouped palette and shared Photo label, then run focused Vitest tests, TypeScript, lint, and production build.

## Implementation tasks

- [x] Add grouped palette metadata and a shared block-label helper.
- [x] Replace the duplicate palette entries with one Photo item and collapsible groups.
- [x] Add Photo layout selection to the inspector and show text fields only for the story layout.
- [x] Make the public/editor renderer distinguish Image only from Image + story.
- [x] Run focused tests, type checks, lint, and build.
