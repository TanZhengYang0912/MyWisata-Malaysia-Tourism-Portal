# Trip Copilot Direct Itinerary Add and Route Ordering

**Status:** Implementation complete; local verification passed; database/browser integration pending.
**Created:** 2026-11-17 13:43 Asia/Kuala_Lumpur
**Workspace:** `/Users/tanzhengyang/Documents/GitHub/MyWisata-Malaysia-Tourism-Portal`
**Branch:** `fix/trip-planner-availability-weather`

## Context

The Trip Planner already has a Trip Copilot panel, catalogue-grounded suggestions, a selected itinerary date, route display, and a versioned trip mutation path. Today the Copilot returns at most five suggestions and the user adds them one at a time. The route view follows the saved item sequence; it does not optimize stop order. The user wants a clear natural-language request such as “add 10 food places to day two” to add real catalogue locations directly and arrange the day to avoid unnecessary backtracking.

This plan extends Trip Copilot. The separate customer Support Agent remains for platform support and will not gain trip access or write tools.

## Decisions and assumptions

- An explicit request naming a day, category, and count authorizes direct addition without a second confirmation. If the day, destination, or requested category is ambiguous or invalid for the trip, ask one focused follow-up before writing.
- Recommendations and additions must come from active, approved catalogue records with real coordinates. The model cannot invent a venue, product ID, price, or location.
- **Confirmed partial-add behavior (2026-11-17):** when fewer than the requested number of valid, not-yet-added catalogue places are found, add the available matches and report the actual number. Do not fabricate or duplicate venues.
- Keep existing scheduled-time stops fixed in their chronological order. Optimize newly selected and other unscheduled stops around those anchors; do not silently invalidate booked or time-specific stops.
- Prefer a bounded real travel-time matrix from an already configured route provider. If that provider cannot supply the matrix for the selected travel mode, use a clearly identified geographic approximation and never call it road-optimal. The current route display remains the source of the final ordered route estimate.
- For Mapbox Matrix, use the non-traffic profile for the selected supported mode: up to 25 coordinates per request; do not use `driving-traffic` for a larger set because it is limited to 10. Matrix usage is billed by source-destination elements, so cap points and make one request at most.
- Batch semantics: reject repeated product IDs inside one request; under the trip lock, skip products already in the itinerary and return the inserted/skipped IDs. This makes a replay after an unknown response reconcilable without turning a successful first write into a duplicate error.
- Preserve manually selected dates, trip origin, current catalogue filters/discovery behavior, weather, route display, purchase checks, and existing itinerary controls.
- No new provider, package, database table, or background job. One migration adds an authenticated batch RPC that reuses the current locked trip mutation checks.

## Existing implementation and Reuse Decisions

| Candidate | Existing behavior | Decision |
| --- | --- | --- |
| `app/customer/trip/[tripId]/trip-planner-client.tsx` | Owns the Trip Copilot panel, current trip items, selected date, existing suggestion cards, and route view. `requestAiPlan` posts to `/api/trips/plan`; `addAiSuggestion` calls the trip hook. | **Extend.** Reuse the existing panel and selected-date state for the natural-language command and concise completion/error result. |
| `app/api/trips/plan/route.ts` | Authenticates the customer, checks AI capability and trip ownership, bounds request size/rate, gathers current items and real catalogue candidates, and applies AI quota/workload fallback. | **Extend.** Validate structured day/count/category constraints and return a grounded ordered plan; keep all existing authorization, quota, and fallback guards. |
| `lib/customer/trip-copilot.ts` | Resolves state/category cues, searches active catalogue data, excludes current products, caps candidates at 12 by default, and lets Gemini select only supplied IDs; current output is capped at five. | **Extend.** Keep default caps and allow direct add to retrieve at most 30 candidates and return at most ten. Preserve candidate-ID validation and deterministic fallback. |
| `app/customer/trip/[tripId]/use-trip-items.ts` | Serializes mutations, tracks the trip version, rejects duplicate IDs already in loaded state, blocks retries after unknown results, and exposes `verify()`. | **Extend.** Add one batch-add method and reconcile unknown results before any retry. Do not issue ten uncoordinated client writes. |
| `app/customer/trip/actions.ts` and `backend/domains/trips.ts` | Server actions delegate to `mutate_customer_trip`, return stable result codes, revalidate the trip, and use the authenticated owner/version contract. | **Extend.** Add a bounded batch domain operation through the same versioned RPC path. |
| `supabase/migrations/20261024210934_trip_mutation_consistency.sql` | Defines the parent-row lock, owner/version check, active-product validation, schedule constraints, and atomic trip writes. | **Reuse through a new batch RPC.** The new function locks and checks the trip, delegates additions and final reorder to the existing mutation function in the same transaction, and returns a single final receipt. Never edit the applied migration. |
| `app/api/route/route.ts`, `app/api/route/route-state.ts`, `lib/routing.ts` | Existing authenticated route service supports driving through Mapbox/OSRM and supported ORS modes, bounded coordinates, provider slots, and rate limits. It calculates routes in supplied order; it has no stop-order optimizer or travel-time matrix contract. | **Extend only for bounded matrix/ordering support.** Reuse provider credentials, profile mapping, rate limits, and provider concurrency controls. Verify provider matrix limits and mode support before implementation. |
| `lib/customer/trip-planner.ts` | Provides date resolution, route origin, route ordering, schedule validation, and route feasibility helpers. | **Reuse and extend with a focused pure route-order helper** if the existing functions cannot express constrained ordering. Do not create a second trip schedule model. |
| `app/i18n/locales/{en,ms,zh-CN}/customer.json` | Existing localized Trip Planner strings, AI states, and route labels. | **Extend** with concise direct-add progress, result, partial-result, clarification, and approximate-route status strings. |
| Trip Copilot and trip mutation tests: `lib/customer/__tests__/trip-copilot.test.ts`, `app/api/trips/plan/__tests__/route.test.ts`, `app/customer/trip/[tripId]/__tests__/use-trip-items.test.tsx`, and existing route tests under `app/api/route/__tests__/` | Existing tests cover scope resolution, candidate grounding, authorization, request limits, serialized writes, and route-provider behavior. | **Extend.** Assert observable result and rejection behavior; add focused tests for batch atomicity, count limits, route ordering, and unknown-result reconciliation. |
| `components/shared/chatbot-widget.tsx`, `lib/chatbot/agent.ts`, and `docs/plans/2026-11-10-2328-customer-support-assistant.md` | The customer Support Agent handles catalogue discovery and platform support but intentionally has no Trip context/write tool. | **Reject for this feature.** It is a separate service contract and adding trip mutations there would duplicate planner authorization/state handling. |

**Reuse audit complete.** No new shared UI component is needed: there is one concrete consumer, and the existing Trip Copilot controls can express this interaction.

## UI/UX preflight

- **Observed issue:** Copilot suggestions require repeated manual adds; route order is the user's current sequence, with no automatic backtracking reduction.
- **Selected skill/order:** repository-required global `skill-router` is not present in the available skill catalog. `product-design:index` was checked for routing; this is a focused extension of an existing coded flow, not a visual redesign. Continue with existing planner components/tokens and use the repository's browser setup for the implementation finish review.
- **Design direction/tradeoff:** keep one natural-language request in Trip Copilot. A clear command adds the plan directly; ambiguous requests clarify first. Show how many real places were added, the target day, and whether route ordering is provider-based or approximate. This saves repetitive clicks while keeping AI-generated assumptions visible.
- **Verified scope:** existing planner panel, current trip state, selected date, catalogue suggestions, existing route sequence, and existing trip mutation controls. No Support Agent or checkout flow changes.
- **Acceptance checks:** an explicit command such as “day two, ten food places” adds validated candidates to day two; only real catalogue records appear; duplicate items are skipped; fixed-time stops remain valid; route order reduces provider travel time when a matrix is supported; fallback is marked approximate; partial results state the actual count; controls remain keyboard accessible and localized.

## Phases

### 1. Define and validate the requested plan

- Extend the existing Trip Copilot request contract with bounded intent fields for target trip day/date, category, and requested count (maximum ten additions per command).
- Resolve a day number against `getTripDayDates`; reject out-of-range days and ask one clarification when multiple destinations or categories remain ambiguous.
- Use explicit user constraints and current trip state only. Exclude catalogue IDs already in the trip and ensure candidates are active/approved with valid coordinates.
- Expand the current candidate/suggestion cap only as needed to fulfill at most ten; retain deterministic fallback and validate every model-selected ID against the server candidate set.
- Keep the existing AI quota, trip-plan rate limit, workload controls, abort behavior, and request byte limit. Do not add a second model call just to parse a clear command.

### 2. Order stops using bounded route evidence

- Add a pure helper that orders candidate stops while honoring the trip origin and fixed-time itinerary anchors.
- During implementation, verify configured Mapbox/ORS matrix endpoint limits, supported profiles, authentication, and billing/quota semantics from provider documentation before calling it.
- Prefer one bounded matrix request for at most 25 proposed and existing same-day stops. Use the matrix to reduce total route travel time with a deterministic heuristic; do not claim a globally optimal solution unless the provider actually guarantees one.
- If no configured matrix supports the selected mode, use coordinate distance only to cluster nearby candidates and mark the result approximate. If safe ordering cannot be determined, preserve existing order and report that route optimization was unavailable.
- Preserve chronological order and locations of fixed-time/booked stops. Do not assign invented visit times or imply restaurant hours/reservations were confirmed.

### 3. Add the ordered plan safely

- Extend `mutate_customer_trip` in a new migration with a bounded batch-add operation, under the existing trip owner/version row lock.
- Validate the full payload before inserting: trip date range, at most ten new items, unique product IDs inside the request, active/approved product and outlet, and real coordinates. While holding the trip lock, skip IDs already in that trip and return them separately. Any other invalid item rejects the entire batch; do not leave a partially written batch.
- Return the inserted rows and new version from the same transaction. Preserve the currently scheduled and fixed-time records; use the planned ordering for same-day rows through the existing complete-order contract.
- Add a server action and `useTripItems` batch method. On a lost/unknown response, call existing `verify()` and reconcile by product IDs before offering any retry; never blindly repeat the batch mutation.
- Pin additions to the active outlet used during route evaluation and persist the product's geocoded place coordinate when available, falling back to that outlet's coordinate.
- No new idempotency table is required if this atomic versioned batch RPC plus read-before-retry fully resolves the result. Revisit only if implementation evidence shows the unknown outcome cannot be reconciled safely.

### 4. Integrate direct-add interaction

- Extend the existing Trip Copilot prompt/result area with direct-add progress, success, partial-success, clarification, and safe failure states in English, Malay, and Simplified Chinese.
- A clear request writes the validated batch directly to the requested day and opens the itinerary panel. Show the actual number and names added; do not silently claim the requested count when fewer matches exist.
- Ask before mutation when the requested day is invalid/ambiguous, a required destination/category is unclear, or the route/order result would require changing fixed-time stops.
- Keep existing individual suggestion cards and manual add actions working.

### 5. Verify the complete affected flow

- Add focused tests for parsed day/count/category, count cap, real-candidate-only output, duplicates, partial candidate count, and no extra model call for clarification.
- Add SQL contract or database tests for atomic batch behavior, authorization/version checks, unavailable products/outlets, invalid dates, duplicate IDs, and rollback on one invalid row.
- Add route-order tests covering fixed anchors, deterministic tie-breaking, provider failure fallback, mode/point limits, and no claim of exact optimization.
- Verify the UI with the existing browser setup: direct add, ambiguity, insufficient candidates, a previously populated day, and a constrained/fixed-time route.
- Run affected tests, `npx tsc --noEmit`, `npm run lint`, locale JSON parsing, and `git diff --check` once after the final implementation change. Hosted database migration application and live provider behavior remain separate gates unless explicitly authorized.

## Exact files expected to change

- `app/customer/trip/[tripId]/trip-planner-client.tsx`
- `app/customer/trip/[tripId]/use-trip-items.ts`
- `app/customer/trip/actions.ts`
- `backend/domains/trips.ts`
- `app/api/trips/plan/route.ts`
- `lib/customer/trip-copilot.ts`
- `lib/customer/trip-planner.ts` or a focused new `lib/customer/trip-route-order.ts` helper and its test
- `app/api/route/route.ts` and `app/api/route/route-state.ts` only if the configured provider matrix can be safely supported by the existing route boundary
- `lib/routing.ts` only for shared provider/profile typing or validated conversion helpers
- New migration: `supabase/migrations/20261117134300_customer_trip_batch_add.sql`
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/ms/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
- Focused Copilot API, candidate, trip mutation, route ordering/provider, and migration contract tests in the existing test directories
- This plan's implementation status/evidence after execution

The implementation must narrow this list after provider capability research; do not add route API files unless matrix-based ordering is actually supported by a configured provider.

## Scope boundaries and files not being touched

- Do not add itinerary write tools to `components/shared/chatbot-widget.tsx` or `lib/chatbot/agent.ts`.
- Do not change the Support Agent, cart/checkout availability rules, payment rules, weather/radar rendering, customer profile preferences, trip sharing, or vendor listing data.
- Do not change unrelated trip-planner filters, route presentation, or manual ordering behavior.
- Do not add a new AI model/provider, route provider, package, database table, background worker, or automatic reservation/purchase action.
- Do not apply the migration to a hosted database, deploy, push, merge, or commit as part of implementation unless separately authorized.

## Resource, privacy, and lifecycle checks

- Current Copilot candidate retrieval reuses the shared catalogue search and can read a broad active/approved pool before capping candidates. This is an existing per-request cost; the new flow must not issue one search per requested place. Search once, exclude loaded trip product IDs, then cap and rank.
- Cap each command at ten additions and the route order request at the route service's verified point limit. Make at most one AI generation call and one bounded provider matrix call per command; use existing rate limits, quotas, `withPortalWorkload`, and route provider slots.
- Keep route coordinates, existing stop order, and scheduled times on the server for deterministic route evaluation. Send Gemini only the explicit request, necessary trip-day context, and bounded catalogue candidate facts; do not send account profile, contact data, cart contents, payment state, or unrelated trip history.
- The RPC batch validates current product/outlet state inside the transaction, which prevents stale candidate data from becoming an unavailable or unapproved saved itinerary item. No inventory reservation or booking is implied.
- Reuse the current client queue/version lock and unknown-result reconciliation. A repeated submit after an unknown outcome first reloads the trip and recognizes already inserted product IDs; the server also skips existing IDs under lock, so retry cannot create duplicates.
- No uploaded files or staged artifacts are introduced. The only persistent writes are the requested trip items and their sequence/date under the existing trip mutation transaction.
- Measure existing and added catalogue reads, AI calls, route provider calls, trip RPC writes, and end-to-end latency in the local/test environment. Do not invent capacity targets or add infrastructure.

## Risks and unresolved implementation checks

- Route ordering is the largest uncertainty: `/api/route` currently returns a route for coordinates in the supplied order and has no matrix or optimizer. Provider matrix support and profile/quota limits must be verified before implementation; a nearest-coordinate fallback is only an approximation.
- A user may request more venues than exist in the selected destination/category. Proposed default is partial add with an exact count and no fabricated padding; this has not been separately confirmed.
- Ten food stops may not fit reasonable opening hours or meal timing. The feature will not invent times; existing schedule/feasibility indicators remain authoritative and the completion state must not imply a fully timed itinerary.
- The new batch RPC migration must preserve the current `mutate_customer_trip` ownership, version, product status, schedule, and result-code contracts. Rollback behavior needs a focused database/migration test.
- The repository-provided `docs/requirements.md`, `docs/architecture.md`, `docs/coding-standards.md`, `docs/testing.md`, and `docs/ai-guidelines.md` paths are absent in this checkout. The available Trip Planner readiness/recommendations plan and customer-support plan were used as relevant maintained evidence; implementation should follow the supplied `AGENTS.md` and inspected source/tests.
- Global `skill-router` is unavailable in the tool catalog. The existing planner UI is the visual target; preserve it and perform focused browser verification after implementation.

## Implementation record

- Added bounded English, Malay, and Simplified Chinese intent parsing for count (maximum ten), category, and trip day. Missing or out-of-range day, missing category, ambiguous destination, or no destination anchor returns a localized clarification before writing.
- Reused existing candidate search, model grounding, AI quota/workload/rate guards, selected trip date, serialized mutation hook, and state verification. Direct additions use one authenticated batch server action and a new versioned batch RPC; request-internal duplicates reject and already-saved products are returned as skipped.
- Added deterministic ordering that keeps the day origin first and fixed-time stops chronological. Supported Mapbox matrix profiles use one server-side request up to 25 points; transit, unsupported point counts, provider failure, rate limit, and missing credentials use a clearly approximate geographic order. Outlet and product coordinates are validated/reused for the persisted stops.
- Added focused parser, ordering, catalogue cap, API, mutation-hook, and migration permission/contract tests. Final local verification: 7 test files / 61 tests passed; `npm run lint`, `npx tsc --noEmit`, locale JSON parsing, and `git diff --check` passed.
- Browser end-to-end and database execution were not run: the new migration is present locally but has not been applied to a database, and the repository's browser flow relies on the app's seeded/authenticated database. No live database mutation or provider call is claimed as verified.
- Read-only `luna_worker` security review and one focused re-review found no remaining must-fix permission or atomicity issues. It confirmed the unknown-result reconciliation and UUID normalization fixes.
