# Outlet Studio Canvas-first Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Replace the current outlet page list editor with a responsive Canvas-first Builder that saves reliable drafts, publishes a verified public page, and uses one renderer for editor and customer views.

**Architecture:** Keep the existing `outlet_pages` row and legacy columns for compatibility, then add a validated JSON document for draft and published page state. Build a shared block schema and renderer used by both the vendor editor and the public outlet page. Use native pointer/HTML drag-and-drop with insertion zones, keyboard move controls, an inspector panel, undo/redo, and explicit Save Draft/Publish actions.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/Postgres, Zod, Tailwind CSS, Vitest, native drag-and-drop events.

## Global Constraints

- Preserve self-registration, customer recommendation, Admin approval, multi-outlet ownership, and one Outlet Manager per outlet.
- Preserve existing product, booking, payment, inventory, review, voucher, and authorization behavior.
- Do not expose the Supabase service-role key to the browser.
- Validate every selected product against the current outlet server-side.
- Keep public reads limited to active/approved outlet content and the published page document.
- Preserve compatibility with existing `outlet_pages` legacy fields and existing saved `blocks` data.
- Do not introduce multiple Outlet Managers or an unrestricted pixel-positioning canvas.
- Use `apply_patch` for source edits and run focused tests before each implementation checkpoint.

---

## Task 1: Create the shared outlet page document contract

**Files:**
- Create: `lib/vendor/outlet-page-schema.ts`
- Create: `lib/vendor/__tests__/outlet-page-schema.test.ts`
- Modify: `lib/vendor/outlet-page-builder.ts`

**Interfaces:**
- `OutletPageDocument`: `{ version: number; hero: HeroBlock; blocks: OutletPageBlock[]; gallery: GalleryItem[]; brandColour: string; fontFamily: string; featuredIds: string[]; seoTitle: string; seoDescription: string }`
- `normalizeOutletPageDocument(value: unknown, legacy?: LegacyOutletPageFields): OutletPageDocument`
- `createDefaultOutletPageDocument(outletName: string): OutletPageDocument`
- `validateOutletPageDocument(value: unknown): SafeParseReturnType<unknown, OutletPageDocument>`
- `documentToLegacyFields(document: OutletPageDocument): Record<string, unknown>`

- [ ] **Step 1: Write failing tests for legacy normalization, defaults, and Hero content.**

```ts
it('normalizes legacy blocks without losing hero title or image', () => {
  const document = normalizeOutletPageDocument({
    blocks: [{ id: 'hero-1', type: 'hero', title: 'Taste Johor', body: 'Local food', image: 'https://example.com/hero.jpg' }],
    hero_url: 'https://example.com/hero.jpg',
  });
  expect(document.hero.title).toBe('Taste Johor');
  expect(document.hero.imageUrl).toBe('https://example.com/hero.jpg');
});

it('creates real default blocks for an empty page', () => {
  const document = createDefaultOutletPageDocument('City Square');
  expect(document.blocks.map((block) => block.type)).toEqual(['intro', 'product_grid', 'gallery', 'hours', 'contact', 'cta']);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the contract does not exist.**

Run: `npm test -- lib/vendor/__tests__/outlet-page-schema.test.ts`

Expected: FAIL with missing module or missing export errors.

- [ ] **Step 3: Implement the Zod schema, legacy normalization, default document, and legacy-field adapter.**

Use stable block IDs for generated defaults, accept both legacy `image` and `imageUrl`, map the legacy Hero block into `document.hero`, clamp `featuredIds` to 12 values, and reject invalid hex colours or malformed URLs.

- [ ] **Step 4: Run the focused test and confirm it passes.**

Run: `npm test -- lib/vendor/__tests__/outlet-page-schema.test.ts`

Expected: all schema tests pass.

- [ ] **Step 5: Update `syncHeroBlockImage` to delegate to the document normalization rules and run its existing tests.**

Run: `npm test -- lib/vendor/__tests__/outlet-page-builder.test.ts lib/vendor/__tests__/outlet-page-schema.test.ts`

- [ ] **Step 6: Commit the contract.**

```bash
git add lib/vendor/outlet-page-schema.ts lib/vendor/__tests__/outlet-page-schema.test.ts lib/vendor/outlet-page-builder.ts
git commit -m "feat: add outlet page document contract"
```

## Task 2: Add draft/published persistence without breaking legacy pages

**Files:**
- Create: `supabase/migrations/20260716000100_outlet_page_drafts.sql`
- Modify: `app/api/vendors/[vendorId]/outlets/[outletId]/page/route.ts`
- Create: `app/api/vendors/[vendorId]/outlets/[outletId]/page/publish/route.ts`
- Create: `lib/vendor/__tests__/outlet-page-persistence.test.ts`

**Interfaces:**
- `GET /api/vendors/:vendorId/outlets/:outletId/page` returns `{ draft, published, draftVersion, publishedVersion, publishedAt, isPublished }`.
- `PATCH /api/vendors/:vendorId/outlets/:outletId/page` accepts `{ document, expectedDraftVersion? }` and returns the canonical saved draft.
- `POST /api/vendors/:vendorId/outlets/:outletId/page/publish` accepts `{ expectedDraftVersion? }` and returns the canonical published document.
- `selectPublicDocument(row: LegacyOrLifecyclePageRow): OutletPageDocument`
- `selectDraftDocument(row: LegacyOrLifecyclePageRow): OutletPageDocument`

- [ ] **Step 1: Write failing contract tests for draft save and published selection.**

```ts
it('public selection prefers published document over draft document', () => {
  expect(selectPublicDocument({ published_document: { version: 2 }, draft_document: { version: 3 } })).toEqual({ version: 2 });
});

it('legacy pages are readable when no draft or published document exists', () => {
  const result = selectDraftDocument({ blocks: [], hero_url: 'https://example.com/hero.jpg' });
  expect(result.hero.imageUrl).toBe('https://example.com/hero.jpg');
});
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `npm test -- lib/vendor/__tests__/outlet-page-persistence.test.ts`

Expected: FAIL because the document-selection helper and lifecycle fields do not exist.

- [ ] **Step 3: Add the migration.**

Add nullable `draft_document JSONB`, `published_document JSONB`, `draft_version INTEGER NOT NULL DEFAULT 0`, `published_version INTEGER NOT NULL DEFAULT 0`, `published_at TIMESTAMPTZ`, and `last_published_by UUID REFERENCES users(id)`. Backfill both documents from the current legacy columns for rows that have existing page data, preserve current `updated_at`, enable RLS, and keep the existing public `SELECT` policy for the published/legacy read path.

- [ ] **Step 4: Implement shared persistence helpers and update the GET/PATCH route.**

The route must authorize the vendor/outlet before using `serviceDb`, validate the full document with the shared schema, verify every `featuredIds` and product block reference belongs to `outletId`, reject stale `expectedDraftVersion` with HTTP 409, and return the row after the write. PATCH must update `draft_document` only; it must not change the published document.

- [ ] **Step 5: Implement the publish route.**

Authorize the same outlet scope, load the draft, validate it again, copy it to `published_document`, increment `published_version`, set `published_at` and `last_published_by`, and return the published document. Do not publish an invalid or empty document.

- [ ] **Step 6: Run focused persistence tests and TypeScript.**

Run: `npm test -- lib/vendor/__tests__/outlet-page-persistence.test.ts lib/vendor/__tests__/outlet-page-schema.test.ts`

Run: `npx tsc --noEmit`

Expected: focused tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit the persistence layer.**

```bash
git add supabase/migrations/20260716000100_outlet_page_drafts.sql app/api/vendors/[vendorId]/outlets/[outletId]/page/route.ts app/api/vendors/[vendorId]/outlets/[outletId]/page/publish/route.ts lib/vendor/__tests__/outlet-page-persistence.test.ts
git commit -m "feat: add outlet page draft and publish persistence"
```

## Task 3: Build the shared public/editor block renderer

**Files:**
- Create: `components/outlet/outlet-block-renderer.tsx`
- Create: `components/outlet/outlet-page-renderer.tsx`
- Create: `components/outlet/outlet-block-types.ts`
- Create: `lib/vendor/__tests__/outlet-block-renderer.test.ts`

**Interfaces:**
- `OutletBlockRenderer({ block, products, outlet, mode, onSelect })`
- `OutletPageRenderer({ document, outlet, products, mode, selectedBlockId, onSelect })`
- `mode`: `'editor' | 'public'`

- [ ] **Step 1: Write failing renderer contract tests.**

```ts
it('creates a Hero render model from document values instead of hardcoded copy', () => {
  const model = getBlockRenderModel({ id: 'hero-1', type: 'hero', props: { title: 'Taste Johor', body: 'Local food' } });
  expect(model.title).toBe('Taste Johor');
  expect(model.body).toBe('Local food');
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the renderer does not exist.**

Run: `npm test -- lib/vendor/__tests__/outlet-block-renderer.test.ts`

- [ ] **Step 3: Implement the shared renderer for all initial block types.**

Use the shared document schema, render Hero title/body/button/image, render ordinary block images in both modes, render outlet hours/contact from platform data, render current-outlet products only, and give editor mode selection/drop affordances without changing public content.

- [ ] **Step 4: Run the focused renderer tests and confirm they pass.**

Run: `npm test -- lib/vendor/__tests__/outlet-block-renderer.test.ts`

- [ ] **Step 5: Commit the renderer.**

```bash
git add components/outlet
git commit -m "feat: share outlet page rendering between editor and public shop"
```

## Task 4: Replace the list editor with Canvas-first Builder

**Files:**
- Modify: `components/vendor/outlet-page-builder.tsx`
- Create: `components/vendor/outlet-builder-canvas.tsx`
- Create: `components/vendor/outlet-builder-palette.tsx`
- Create: `components/vendor/outlet-builder-inspector.tsx`
- Create: `components/vendor/outlet-builder-history.ts`
- Create: `components/vendor/__tests__/outlet-builder-history.test.ts`

**Interfaces:**
- `OutletBuilderCanvas({ document, selectedBlockId, view, onSelect, onInsert, onMove, onDelete })`
- `OutletBuilderPalette({ onAddBlock, onBeginDrag })`
- `OutletBuilderInspector({ block, products, onUpdate })`
- `createHistory<T>(initial): { state, undo, redo, canUndo, canRedo, commit }`

- [ ] **Step 1: Write failing history tests.**

```ts
it('undoes and redoes a block insertion', () => {
  const history = createHistory(['hero']);
  history.commit(['hero', 'text']);
  expect(history.undo()).toEqual(['hero']);
  expect(history.redo()).toEqual(['hero', 'text']);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `npm test -- components/vendor/__tests__/outlet-builder-history.test.ts`

- [ ] **Step 3: Implement history and the three builder panels.**

The canvas must show real document blocks, visible insertion zones, drag-over feedback, selected-block focus, empty-page drop target, keyboard move/delete controls, and desktop/mobile width preview. The palette must support click-to-add as well as native drag-to-add. The inspector must expose the Hero, Text, Image, Product Grid, Gallery, Hours, Contact, Voucher, Review, and CTA properties required by the document schema.

- [ ] **Step 4: Replace the current builder shell.**

Load `data.draft`, initialize defaults when the draft is missing, track `dirty`, `saving`, `publishing`, `lastSavedAt`, and error state, connect Save Draft to PATCH, connect Publish to the publish endpoint, and reload the canonical document after each successful operation. Keep the existing `Open public shop` link.

- [ ] **Step 5: Run the focused history tests and TypeScript.**

Run: `npm test -- components/vendor/__tests__/outlet-builder-history.test.ts lib/vendor/__tests__/outlet-page-schema.test.ts`

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit the builder interaction.**

```bash
git add components/vendor/outlet-page-builder.tsx components/vendor/outlet-builder-canvas.tsx components/vendor/outlet-builder-palette.tsx components/vendor/outlet-builder-inspector.tsx components/vendor/outlet-builder-history.ts components/vendor/__tests__/outlet-builder-history.test.ts
git commit -m "feat: add canvas-first outlet page builder"
```

## Task 5: Connect the public outlet page to published data

**Files:**
- Modify: `app/customer/outlet/[outletId]/page.tsx`
- Modify: `app/vendor/outlets/page.tsx`
- Modify: `lib/customer/shop-navigation.ts`

- [ ] **Step 1: Write a regression test for public document selection and legacy fallback.**

Use the persistence helper to assert that a published document is selected over a newer draft and a legacy page remains visible when lifecycle columns are null.

- [ ] **Step 2: Update the public route to load the published document.**

Keep `dynamic = 'force-dynamic'`, load only active outlet data and published page content for customers, use `OutletPageRenderer mode="public"`, and preserve public product links, directions, sharing, gallery, metadata, and opening-hours behavior.

- [ ] **Step 3: Update vendor outlet list/detail actions.**

Keep the existing `Edit shop page` action, show page status and last published time where available, and make the public link open the published page after a publish action.

- [ ] **Step 4: Run focused tests and TypeScript.**

Run: `npm test -- lib/vendor/__tests__/outlet-page-schema.test.ts lib/vendor/__tests__/outlet-page-persistence.test.ts`

Run: `npx tsc --noEmit`

## Task 6: Add the 4.1–4.4 supporting improvements

**Files:**
- Modify: `components/vendor/product-form.tsx`
- Modify: `components/vendor/price-rule-manager.tsx`
- Modify: `app/vendor/products/page.tsx`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/price-rules/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/price-rules/[ruleId]/route.ts`
- Modify: `app/api/vendors/[vendorId]/vouchers/analytics/route.ts`
- Modify: `app/vendor/vouchers/page.tsx`
- Create: `lib/vendor/__tests__/price-rules.test.ts`
- Create: `lib/vendor/__tests__/voucher-analytics.test.ts`
- Modify: checkout/inventory files only where regression tests show a missing release/restore path

- [ ] **Step 1: Add failing tests for price-rule precedence and voucher analytics values.**

Cover peak/off-peak/date/group/tiered conflicts with a deterministic precedence order and assert that voucher analytics distinguish redemption count, attributed revenue, discount cost, and net revenue.

- [ ] **Step 2: Run focused tests and confirm the new assertions fail.**

Run: `npm test -- lib/vendor/__tests__/price-rules.test.ts lib/vendor/__tests__/voucher-analytics.test.ts`

- [ ] **Step 3: Implement only the missing deterministic rules.**

Keep current product, booking, payment, inventory, and voucher contracts intact. Add conflict feedback instead of silently choosing a rule, preserve outlet scoping, and ensure analytics are calculated from existing order/voucher records without adding fake records.

- [ ] **Step 4: Verify existing commerce and voucher tests.**

Run: `npm test -- lib/vendor/__tests__/price-rules.test.ts lib/vendor/__tests__/voucher-analytics.test.ts lib/**/*.test.ts`

Expected: all focused and existing unit tests pass.

## Task 7: Run integration, visual, accessibility, and production checks

**Files:**
- Create: `tests/e2e/outlet-studio.spec.ts`
- Modify: `tests/e2e` support utilities only if required for authenticated vendor setup
- Modify: `docs/superpowers/plans/2026-07-16-outlet-studio-builder.md` to mark completed steps

- [ ] **Step 1: Add an authenticated E2E flow.**

The flow must open an approved vendor outlet, add a Text and Product block by dragging, edit the Hero title, save draft, confirm the public page is unchanged, publish, reload the public page, and confirm the Hero and block content are visible.

- [ ] **Step 2: Run the focused E2E flow against the local app.**

Run: `npx playwright test tests/e2e/outlet-studio.spec.ts`

Expected: the authenticated flow passes without console errors.

- [ ] **Step 3: Run the full verification suite.**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Run: `git diff --check`

- [ ] **Step 4: Verify migration and public read behavior.**

Run the project’s Supabase migration/verification command available in the environment, then confirm: vendor scope rejects another outlet, public users see only published content, draft edits remain private, and product IDs from another outlet are rejected.

- [ ] **Step 5: Review the final diff and commit the verified implementation.**

```bash
git status --short --branch
git diff --stat
git add app components lib supabase tests docs/superpowers/plans/2026-07-16-outlet-studio-builder.md
git commit -m "feat: ship outlet studio canvas builder"
```
