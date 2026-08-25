# Admin Recommendation Clickable Row Design

**Status:** Approved direction; awaiting implementation approval  
**Date:** 2026-08-26

## Context

The Admin Recommendation queue currently requires an administrator to click a small **View details** button. The Admin Withdrawal queue already uses a clearer pattern: the complete row is a semantic link to its detail page.

## Decision

Make every Admin Recommendation queue row a single Next.js `Link` to `/admin/recommendations/[id]`.

- Clicking anywhere on the row opens the matching Recommendation detail page.
- Keyboard users can focus the row and press Enter to open it.
- The row receives the same hover and focus-visible treatment used by Withdrawal rows.
- Replace the nested **View details** button with a non-interactive arrow cue so the markup never contains one link inside another.
- Preserve the current row content, status badges, SLA indicator, contributor information, assignment information, filters, pagination, and detail page.

## Implementation Boundary

### Files to modify

- `app/admin/recommendations/page.tsx`
  - Replace each Recommendation `<article>` and nested detail link with one row-level `Link`.
  - Replace the `Eye` action with the Withdrawal-style `ArrowUpRight` cue.
  - Add hover, focus-visible, and group transition classes matching the Admin Withdrawal interaction.
### Files to create

- `app/admin/recommendations/__tests__/page.contract.test.ts`
  - Assert that each Recommendation item has one row-level detail link.
  - Assert that the old nested **View details** button pattern is absent.

### Files not being touched

- Recommendation API routes and database migrations
- Recommendation detail page and review actions
- Customer Recommendation pages
- Withdrawal pages and shared Admin shell
- Translation resources, because no new user-facing copy is introduced

## Dependencies and Database

- No new dependencies.
- No database changes.

## Error and Accessibility Behaviour

Navigation remains native link navigation, so standard browser behaviours such as opening in a new tab continue to work. The row receives an accessible label derived from the recommendation name and existing detail-action translation. Interactive controls will not be nested inside the row link.

## Verification

- Contract test confirms one semantic detail link per Recommendation row and no nested action link.
- Existing Recommendation page tests continue to pass.
- ESLint and TypeScript pass for the affected files.
- Browser verification confirms click, Enter key, focus ring, hover state, filters, and pagination.

## Risks

- A nested interactive element inside the row would produce invalid and confusing interaction semantics. The implementation avoids this by making the arrow decorative.
- Row navigation must not interfere with filters or pagination because those controls remain outside the linked rows.
