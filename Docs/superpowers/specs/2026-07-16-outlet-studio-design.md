# Outlet Studio Canvas-first Builder

## Status

Proposed design approved in conversation on 2026-07-16. Implementation is intentionally paused until this specification is reviewed.

## Problem

Vendor registration, recommendation approval, multi-outlet management, product catalogue, pricing, inventory, booking, checkout, and vouchers already exist in the portal. The largest usability and reliability gap is the outlet shop-page editor.

The current editor is a right-side block list with basic form fields. It does not let a non-technical vendor place content directly on the page. More importantly, the editor preview and the public shop page render their own separate markup. This creates visible mismatches: Hero text edits are ignored, block images are not always visible in preview, an empty page can show temporary preview blocks that are not saved, and a successful save does not verify the published result.

## Goals

1. Let a vendor build an outlet page by dragging elements into a central canvas without writing code.
2. Make the editor preview and the customer-facing shop use the same block schema and renderer.
3. Fix the current save/display defects, including Hero content, images, empty blocks, and post-save verification.
4. Keep layouts responsive and safe on desktop and mobile by snapping content into responsive sections rather than allowing unconstrained pixel positioning.
5. Keep each outlet's page, products, prices, inventory, opening hours, contact details, and booking configuration independent.
6. Add a clear draft/publish boundary so unfinished edits do not immediately replace the customer-facing page.
7. Improve the existing 4.1–4.4 module without expanding into multi-manager administration or a full pixel design tool.

## Non-goals

- Multiple outlet managers or co-managers per outlet.
- A Photoshop/Figma-style unrestricted absolute-position canvas.
- Full AI-generated page design.
- A separate mobile application.
- Replacing the existing vendor approval, catalogue, booking, payment, voucher, or Supabase authorization model.

## Design decision

Use a Canvas-first Builder with Responsive Section Snapping.

The interaction should feel like Canva: choose an element, drag it into the middle of the page, click it, and edit it. The underlying layout remains section/grid based so content reflows on mobile and cannot be placed outside the page or made inaccessible.

### Alternatives considered

#### A. Improve the existing right-side list builder

Low risk and quick, but it still makes the vendor think in terms of blocks and forms. It does not satisfy the direct-manipulation requirement.

#### B. Canvas-first responsive builder — recommended

The vendor sees the final page in the centre, drags content into visible drop zones, and edits the selected element in a property panel. It provides the requested freedom while preserving responsive behaviour and a manageable data model.

#### C. Fully freeform pixel canvas

Most flexible on desktop, but difficult to make responsive, accessible, and stable. It would create a much larger implementation and testing scope than this FYP module needs.

## User experience

### Overall layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Outlet name  Undo  Redo  Desktop/Mobile  Save Draft  Publish │
├───────────────┬──────────────────────────┬───────────────────┤
│ ADD ELEMENTS   │       SHOP CANVAS        │   EDIT ELEMENT     │
│ + Text         │  ┌────────────────────┐  │ Selected: Hero    │
│ + Image        │  │      Hero block     │  │ Title             │
│ + Product      │  │    Drop here        │  │ Subtitle          │
│ + Gallery      │  └────────────────────┘  │ Image             │
│ + Hours        │                          │ Button            │
│ + Contact      │  ┌────────────────────┐  │ Alignment         │
│ + Voucher      │  │   Product section   │  │ Background        │
│                │  │    Drop here        │  │ Spacing           │
│                │  └────────────────────┘  │                   │
│                │       + Drop here        │                   │
└───────────────┴──────────────────────────┴───────────────────┘
```

### Addable blocks

Initial block types:

- `hero`
- `text`
- `image`
- `image_text`
- `product_grid`
- `gallery`
- `hours`
- `contact`
- `voucher_banner`
- `cta`
- `review_highlight`
- `social_proof`

Existing block types (`intro`, `product_grid`, `gallery`, `hours`, `contact`, and `cta`) must remain readable for backward compatibility. Existing `intro` content can render as the new `text` presentation without requiring a destructive migration.

### Direct manipulation

- The left panel adds a new block to the canvas or starts a drag operation.
- The canvas displays an insertion indicator before, after, or inside a compatible section.
- Dropping creates a real block in editor state; it is not temporary preview content.
- Clicking a block selects it and opens its properties in the right panel.
- A selected block has a visible focus ring and a small move handle.
- Delete requires a clear action and supports undo.
- Reordering uses keyboard-accessible move controls as a fallback to pointer dragging.
- The canvas supports desktop and mobile preview modes using the same renderer.

### Block editing

Hero properties:

- title
- subtitle/body
- image upload or media-library selection
- image position
- overlay opacity
- text alignment
- button label and destination
- background colour

Text properties:

- heading
- body
- alignment
- emphasis style
- optional image

Product grid properties:

- selected products from the current outlet only
- product order
- column count
- show price
- show rating
- show booking or purchase action

Image and gallery properties:

- upload/replace/delete
- ordered items
- alt text
- crop/aspect ratio preset
- focal position

Contact, hours, voucher, review, and CTA properties should use platform data where possible instead of asking the vendor to duplicate information manually.

## Data model

Use a versioned, typed block document. The exact database representation can remain JSONB, but the application must validate it with a shared schema before saving and before rendering.

Example:

```json
{
  "id": "hero-001",
  "type": "hero",
  "props": {
    "title": "Taste Johor Like a Local",
    "body": "Discover local food and culture.",
    "imageUrl": "https://…",
    "buttonText": "Explore now",
    "buttonLink": "/customer/activity/…"
  },
  "style": {
    "backgroundColor": "#00004D",
    "textAlign": "left",
    "spacing": "large"
  }
}
```

The existing fields (`title`, `body`, `image`, `imageUrl`, and `cta`) must be normalized at the boundary so older saved pages continue to render. The public renderer must ignore unknown block types gracefully and show an admin-friendly validation error when a vendor tries to publish an invalid document.

## Draft and publish flow

Recommended flow:

```text
Edit → Save draft → Preview → Publish → Customer public shop
```

The initial implementation may keep the existing `outlet_pages` row and add lifecycle fields:

- `draft_blocks` or an equivalent draft document
- `published_blocks` or an equivalent published document
- `draft_version`
- `published_version`
- `published_at`
- `last_published_by`
- `updated_at`

If the current schema makes a single-row design too awkward, use an `outlet_page_versions` table with one draft and one published version per outlet. The final choice must preserve the invariant that an outlet can have only one active published page.

Save draft must return the canonical saved document from the database. Publish must validate the document again, record the publishing user, and return the published version. The UI must display `Saved`, `Unsaved changes`, `Published`, and actionable errors rather than a generic success message.

## Data flow and authorization

1. Vendor opens an outlet builder using the existing vendor/outlet authorization.
2. The API loads the current draft, published version, products for that outlet, and media references.
3. The editor validates changes locally with the shared block schema.
4. Save draft sends the complete document with an idempotency/request identifier.
5. The server validates the document, verifies that referenced products belong to the same outlet, normalizes media entries, and upserts the draft.
6. Publish repeats validation and changes only the published version.
7. The public shop reads only the published document and active outlet data.
8. The editor's preview calls the same `OutletBlockRenderer` used by the public shop.

Supabase requirements:

- Keep RLS enabled on exposed page and media tables.
- Keep vendor authorization scoped to the requested vendor and outlet before using the service client.
- Validate product IDs against the current outlet server-side; do not trust client-selected IDs.
- Do not expose the service-role key to the browser.
- Ensure public reads can see only published data from active/approved outlets.
- Add/update policies and storage policies for uploaded media, including SELECT, INSERT, and UPDATE when replacing files.

## Shared rendering architecture

Create focused modules:

- `outlet-page-schema`: typed block definitions, normalization, validation, migration helpers.
- `outlet-block-renderer`: shared block rendering for editor and public page.
- `outlet-builder-canvas`: selection, insertion zones, drag/drop, keyboard movement, undo/redo.
- `outlet-builder-sidebar`: add-block palette and page settings.
- `outlet-builder-inspector`: selected-block property editor.
- `outlet-page-persistence`: save draft, publish, reload, optimistic status, and error handling.

The public route should not contain a second copy of block-specific rendering rules. It should load the published document and pass it to the shared renderer with a `mode="public"` option. The editor should pass the same document with `mode="editor"` and selection/drop affordances enabled.

## Fixes included in this design

1. Hero title/body/button values are read from the saved Hero block instead of hardcoded text.
2. Regular block images are rendered in both editor and public modes.
3. Empty pages initialize real default blocks before saving; temporary preview blocks are removed.
4. Save reloads and displays canonical server data.
5. Public shop reads the published page version and can be opened with a cache-busting/revalidation-safe navigation path.
6. A save/publish error identifies validation, authorization, media, or database failure separately.
7. Product selections are checked against the current outlet to prevent cross-outlet content leakage.
8. The public page and editor cannot silently disagree about supported block fields.

## 4.1–4.4 enhancements in scope

### Vendor and outlet management

- Keep self-registration, customer recommendation, and Admin approval.
- Keep one Vendor Owner managing multiple independent outlets.
- Keep one Outlet Manager per outlet for this scope.
- Add page template selection, media upload, draft/publish status, public preview, and SEO/OG preview.

### Product, pricing, and inventory

- Keep product-per-outlet ownership and current pricing rules.
- Add explicit price-rule precedence and conflict feedback.
- Add capacity reservation, low-stock warnings, and consistent sold-out presentation.
- Ensure payment failure and refund paths release or restore reserved inventory.

### Booking and purchase

- Keep mixed cart and the current three-day-plus-calendar timeslot interaction.
- Finish payment failure, retry, timeout, refund, and receipt flows.
- Keep review eligibility tied to completed purchase and preserve review pagination.

### Vouchers

- Keep percentage, fixed, BOGO, minimum spend, dates, caps, customer limits, product/outlet rules, CSV bulk creation, code generation, and checkout validation.
- Add stacking rules, concurrency protection, CSV row-level errors, attributed revenue, discount cost, redemption rate, and top-voucher reporting.

## Error handling

The UI must handle:

- network failure while loading or saving
- unauthorized/out-of-scope outlet
- invalid image URL or upload failure
- missing/deleted product reference
- stale draft version conflict
- invalid block configuration
- publish validation failure
- public page missing or inactive outlet

Errors should be shown next to the relevant control where possible and summarized in the top bar. The editor must keep unsaved local changes when a save fails.

## Testing and acceptance criteria

### Persistence and regression tests

- Save a Hero title, reload the editor, and confirm the value remains.
- Publish the Hero, open the public shop, and confirm the same title/body/image/button are rendered.
- Add, reorder, edit, and delete blocks; reload and confirm order and values.
- Start with an empty page, save, and confirm default blocks are real persisted blocks.
- Add a section image and confirm it appears in editor and public modes.
- Select a product from another outlet and confirm the server rejects it.
- Save as draft and confirm the public page remains unchanged.
- Publish and confirm the public page changes to the new version.
- Simulate a failed save and confirm local changes are preserved.

### Interaction and accessibility tests

- Drag a block into the first, middle, and last insertion zones.
- Move a block using keyboard controls.
- Use the builder at desktop and mobile preview widths.
- Confirm focus states and accessible names for add, select, move, delete, save, and publish actions.
- Confirm reduced-motion users are not dependent on animation to understand drop state.

### Existing module regression tests

- Vendor approval still controls public visibility.
- Products remain isolated by outlet.
- Inventory decrement and sold-out logic still work.
- Mixed cart and booking timeslot selection still work.
- Voucher validation still enforces dates, caps, customer limits, and product/outlet eligibility.
- Review submission remains restricted to eligible completed purchases.

## Success criteria

This work is complete when a non-technical Vendor can create an outlet page by dragging a Hero, Text, Image, Product Grid, Gallery, Voucher, and CTA into the central canvas; edit each element without code; save a draft; publish it; and see the exact same content on the customer-facing Outlet Shop. The workflow must survive reloads, invalid input, failed saves, mobile preview, and outlet-scope authorization checks.

