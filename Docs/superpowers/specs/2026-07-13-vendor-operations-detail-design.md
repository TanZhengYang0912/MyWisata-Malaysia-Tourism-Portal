# Vendor Operations Detail Design

**Status:** Approved by user for implementation on 2026-07-13

## Goal

Make the vendor portal reliable and operationally complete: product saves must validate correctly, vendors must manage media and availability through Supabase, new demo vendors must have useful remote data, and vendor dashboards must show role-scoped business activity.

## Decisions

- Existing Supabase data is preserved. New demo records use deterministic IDs and additive upserts.
- Product content changes enter `pending_review`; Admin approval is required before customer visibility.
- Product editing uses Supabase Storage for cover/gallery media and digital assets.
- Cover image is optional while drafting but required before review submission.
- Vendor owners see all assigned vendor outlets. Outlet managers see the full dashboard only for assigned outlets.
- Availability is product-type aware: stock for physical/F&B, capacity and slots for activities/experiences, and unlimited or file-backed availability for digital products.
- New vendors receive realistic order, booking, review, and payment data across dashboard periods.

## Data flow

1. The product form keeps human-friendly comma-separated tags in the input layer and transforms them into `string[]` before Zod validation and API submission.
2. `Save Draft` stores an inactive product with draft review state; `Submit for Review` validates media and availability requirements, then stores an inactive product with `pending_review`.
3. Product media uploads go to a vendor-scoped Supabase Storage path. Product rows keep the cover URL and `media_assets` keeps gallery metadata. Order items keep an image snapshot.
4. Dashboard queries continue to use the verified vendor authorization boundary and service client, with outlet IDs applied to every metric query.
5. Inventory updates run through the existing atomic inventory path. Available stock is `quantity - reserved`; zero stock disables customer purchase and low stock appears in the vendor alert panel.

## UI direction

- Product editing is organized into Basic information, Media, Pricing, Availability, and Review readiness sections in one responsive modal.
- Tags render as removable chips while preserving keyboard and comma entry.
- Empty dashboard panels explain the active period and provide the next action instead of presenting unexplained blank space.
- Owner and manager views share components, but managers receive outlet-scoped labels and metrics.

## Non-goals

- No Stripe production checkout or webhook work; Stripe remains demo-only.
- No deletion, reset, truncation, or replacement of existing Supabase data.
- No unrelated repository-wide lint cleanup.

## Acceptance criteria

- Saving an existing product with comma-separated tags no longer produces `expected array, received string`.
- A draft can be saved without media; submitting for review without a cover image is blocked with a field-level message.
- Uploaded cover/gallery files are stored in Supabase Storage and are referenced from Supabase rows.
- Product types expose only their relevant availability controls.
- Batik and Borneo owners see paid orders, charts, outlet sales, bookings, reviews, and recent transactions for all dashboard filters.
- Outlet managers see the same categories limited to assigned outlets.
- Stock alerts and stock-out behavior are visible and testable.
