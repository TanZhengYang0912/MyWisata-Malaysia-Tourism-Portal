# Sponsored Targeting and Priority Governance Design

**Status:** Proposed for user review  
**Date:** 2026-09-09

## Context

MyWisata already supports governed sponsored-product campaigns with product selection, effective dates, state/category scope, draft submission, separate approval, pause actions, customer-safe projection, and a customer carousel capped at four advertisements. The existing implementation treats `priority` as an arbitrary integer from 0 to 1000, permits ties, and resolves them deterministically by start time and placement ID. It does not preview overlapping campaigns, reserve meaningful positions 1 through 4, shift displaced campaigns, or archive older paused campaigns.

The desired behavior is a mature targeting and inventory workflow:

- each customer request shows at most four eligible sponsored advertisements;
- exact state/category campaigns take precedence over broader campaigns;
- All Malaysia and All Categories campaigns fill unused positions as fallbacks;
- position values are limited to 1 through 4, where 1 is highest;
- collisions are evaluated only when targeting and effective dates overlap;
- both the draft creator and the independent approver must see the consequences;
- approval atomically shifts affected campaigns, pauses overflow, archives older paused rows, and records audit evidence.

The supporting product research is recorded in `Docs/research/2026-09-09-mature-sponsored-placement-targeting.md`.

## Decisions

### Customer serving model

The Partners sponsored carousel is one four-result ad unit evaluated per request. It is not a single global list of four campaigns, and it is not a permanently materialized four-row table for every possible state/category combination.

For the current customer filters, a campaign is eligible only when:

- its status is `approved`;
- the current time is within `[starts_at, ends_at)`;
- its product remains active and approved;
- its state targeting matches the selected state or is All Malaysia;
- its category targeting matches one of the selected categories or is All Categories;
- the product satisfies the existing organic catalogue/query eligibility checks.

Eligible campaigns are ranked by targeting specificity before position:

1. exact state plus exact category;
2. exact state plus All Categories;
3. All Malaysia plus exact category;
4. All Malaysia plus All Categories.

Inside the same specificity tier, position 1 is highest and position 4 is lowest. Approval time and placement ID provide a stable final tie-breaker only for legacy or defensive recovery; successful governed approval must not create duplicate active positions inside the same collision segment.

The first four unique sponsored products become the carousel candidates. Broader campaigns fill remaining positions; they do not displace otherwise-eligible more-specific campaigns. Organic ordering remains unchanged after sponsored results.

### National campaign eligibility

All Malaysia is a targeting scope, not an upgrade inferred from historical state campaigns. A product does not need a previously approved state-sponsored campaign before it can target All Malaysia.

National targeting still requires:

- an active and approved product;
- an authorized campaign creator;
- independent approval by a different authorized administrator;
- explicit display in both impact previews as a broad scope that may overlap state campaigns.

This avoids duplicate prerequisite campaigns and keeps national approval auditable.

### Position and conflict semantics

The Admin UI labels the field **Position**, not an unrestricted numeric Priority. Allowed values are 1, 2, 3, and 4, with 1 highest.

Two campaigns contend only when all of the following are true:

- their effective date ranges overlap;
- their state scopes overlap, where All Malaysia overlaps every state;
- their category scopes overlap, where All Categories overlaps every category;
- they occupy the same specificity tier for at least one customer request;
- they request the same position within that collision segment.

A Penang-only campaign does not collide with a Melaka-only campaign. A Penang Food campaign can collide with another Penang Food campaign. A broad All Malaysia campaign is evaluated as a fallback tier and therefore does not take a more-specific Penang position merely because both are eligible for a Penang request.

### Collision insertion

When a new campaign is approved into an occupied position within its collision segment:

1. place the new campaign at the requested position;
2. shift the existing campaign at that position and every following campaign back by one;
3. retain positions only through 4;
4. set the campaign displaced beyond position 4 to `paused`;
5. record an automatic pause reason naming the approved campaign and the displaced position;
6. retain the two most recently paused campaigns in the default Admin view;
7. mark older paused campaigns `archived` and hide them from the default list;
8. retain all rows, tracking data, and audit events.

No sponsored campaign is permanently deleted by this workflow.

## Workflow and UI

### Draft creation

The creation form continues to select an active, approved product and effective dates. State and category controls become structured selectors using canonical values rather than free text. Position becomes a select containing 1 through 4.

Before **Create draft** commits anything, the server computes an impact preview using the same collision engine used during approval. A confirmation dialog displays:

- selected product and provider;
- state/category scope and effective dates;
- requested position;
- campaigns with overlapping targeting and dates;
- current order and proposed order;
- which campaigns would shift;
- which campaign would be paused if approved;
- which paused campaign would be archived if the visible-paused limit is exceeded.

The creator confirms the preview to create the draft. Creation records the preview reference for comparison and audit, but does not reorder, pause, or archive live campaigns.

### Submission and independent approval

Draft submission retains the existing `draft -> pending_approval` transition. The campaign creator cannot approve their own campaign.

Before **Approve**, the server recomputes the impact against current data. The approver must see and confirm a new Before/After impact dialog. The approval dialog cannot rely on the creator's earlier preview.

If the campaign set changed since the displayed approval preview, approval fails closed with a stale-preview result. The UI reloads the latest impact and requires another explicit confirmation.

Approval executes in one database transaction:

- validate authorization and creator separation;
- validate product eligibility and date range;
- lock the candidate campaign and all affected overlapping campaigns;
- validate the preview version;
- approve the new campaign;
- shift affected positions;
- pause the displaced position-4 campaign when necessary;
- archive paused campaigns beyond the two-row default-retention window;
- append audit events for every affected campaign;
- return the approved campaign and final impact summary.

Any failure rolls the entire operation back.

### Campaign list organization

The Admin page groups or filters campaigns into:

- **Active / Scheduled** — approved campaigns currently effective or waiting for their start time;
- **Pending approval** — campaigns awaiting another administrator;
- **Drafts** — campaigns not yet submitted;
- **Recently paused** — the two most recently paused campaigns shown by default;
- **Archived** — hidden by default and available through an explicit archive filter.

Every campaign row displays product/provider, targeting scope, position, effective dates, creator, approver, status, and an impact/audit summary. An automatically paused row explains which approval displaced it. Archived records remain readable to authorized staff and remain linked to impression/click and transition history.

## Architecture

### Targeting and conflict module

Introduce one focused, pure domain module responsible for:

- canonical target-scope normalization;
- scope-overlap checks;
- effective-date overlap checks;
- specificity-tier calculation for a customer request;
- collision-segment comparison;
- proposed position insertion and shift calculation;
- paused-retention/archive calculation;
- deterministic preview serialization/versioning.

The Admin preview API, approval RPC contract tests, and customer ranker use the same vocabulary and shared fixtures. The database remains the final authority for mutation and repeats all security-critical checks transactionally.

### Server APIs

The existing Admin sponsored placement API is extended rather than duplicated:

- preview draft impact without mutation;
- create a draft only after a matching creator preview confirmation;
- preview approval impact using current data;
- approve using a preview version and return stale-preview conflict when data changed;
- filter campaign lists by lifecycle group, including explicit archived access.

The API never accepts a browser-supplied list of campaigns to shift. It accepts only the requested campaign/position and preview version; affected rows are calculated server-side.

### Database

A forward-only migration:

- constrains governed position values to 1 through 4;
- adds `archived` to the permitted lifecycle when required by the current table constraint;
- stores structured automatic transition reasons or audit-event payloads without exposing them through the public projection;
- adds indexes supporting status, date, target scope, and position conflict lookups;
- introduces preview and approval RPCs, or safely extends the existing transition RPC, with row locking and transaction-scoped recomputation;
- migrates legacy priorities into deterministic positions without rewriting unrelated campaign history.

Direct authenticated table mutation remains revoked. Staff permission checks and creator self-approval denial remain enforced inside the database. The customer-safe RPC continues to expose only fields required for serving.

## Error Handling

- Invalid position or date range: inline validation plus server rejection.
- Ineligible product: reject without creating or approving a campaign.
- No conflict: preview explicitly says no existing campaign will move.
- Conflict: show Before/After ordering and all pause/archive consequences.
- Stale preview: no partial mutation; reload and require reconfirmation.
- Concurrent approvals: row locking serializes affected updates; the loser receives stale-preview conflict.
- Public placement load failure: hide the sponsored carousel while preserving the organic directory.
- Approval transaction failure: roll back every status, position, archive, and audit change.

## Testing

Pure domain tests cover:

- state and category overlap matrices;
- half-open date overlap boundaries;
- specificity precedence and national fallback;
- position insertion and shifts;
- overflow pause and two-paused archive retention;
- deterministic preview versioning.

API and database tests cover:

- authorized preview and mutation only;
- canonical state/category validation;
- creator self-approval denial;
- stale preview rejection;
- concurrent approval serialization;
- atomic shift/pause/archive/audit behavior;
- migration of legacy priorities;
- no exposure of internal review or archive metadata from the public RPC.

Admin component tests cover both creator and approver impact dialogs, explicit consequences, lifecycle filters, and stale-preview recovery.

Customer tests cover exact-target precedence, All Malaysia/All Categories fallback, unique products, effective dates, and a hard maximum of four advertisements.

## Scope Boundaries

In scope:

- sponsored product campaigns on the customer Partners sponsored carousel;
- state/category targeting and fallback;
- positions 1 through 4;
- dual impact previews;
- governed approval collision handling;
- pause/archive retention and Admin list organization;
- migrations and focused tests required for those behaviors.

Out of scope:

- auction pricing, CPM bidding, budgets, impression goals, pacing, frequency caps, or advertiser billing;
- personalized ad targeting or sensitive user profiling;
- vendor-level campaigns replacing the existing product-level model;
- permanent deletion of sponsored or audit records;
- changes to organic vendor ranking, customer navigation, or the three-second carousel interaction;
- unrelated Access Control, authentication, or checkout changes.

## Risks and Mitigations

- **Combinatorial targeting:** compute eligibility per request and use specificity tiers instead of materializing every state/category combination.
- **Broad campaigns crowd out local campaigns:** specificity ranks ahead of position, so broader campaigns only fill remaining capacity.
- **Concurrent approvals corrupt ordering:** lock affected rows, require preview versions, and update atomically.
- **Legacy arbitrary priorities:** migrate deterministically and keep an auditable mapping.
- **Admin surprise:** require consequence previews for both creator and approver.
- **List clutter:** show only two recently paused campaigns and archive older rows without deleting history.
