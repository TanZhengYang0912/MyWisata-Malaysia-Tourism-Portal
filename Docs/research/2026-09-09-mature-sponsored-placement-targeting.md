# Mature Sponsored Placement Targeting Research

**Date:** 2026-09-09  
**Scope:** Geo/category targeting, national versus state campaigns, four visible positions, priority conflicts, overlapping schedules, and approval behavior for MyWisata.

## Primary-source findings

### Targeting determines eligibility before priority is considered

Google Ad Manager models geography as one targeting dimension on a line item. A line item can include or exclude geographic areas such as country, state, or city. Targeting narrows where an advertisement is eligible to serve; it is not itself the final rank. [Google Ad Manager: Target geographic locations for delivery](https://support.google.com/admanager/answer/1260290?hl=en)

Conditions inside the same targeting dimension use OR semantics, while conditions across dimensions use AND semantics. Applied to MyWisata, multiple selected states would mean Penang OR Melaka, while a state plus category would mean Penang AND Food. [Google Ad Manager: How targeting works with multiple conditions](https://support.google.com/admanager/answer/9643591?hl=en)

### Priority is a competition rule, not a permanent globally unique position

Google Ad Manager uses numeric priority as one factor in ad selection, with lower numbers representing higher priority. It first determines eligible line items for an ad request, then chooses among them. [Google Ad Manager: Line item types and priorities](https://support.google.com/admanager/answer/177279?hl=en) and [How we decide which ad is served](https://support.google.com/admanager/answer/11204312?hl=en)

Mature systems therefore do not normally require each campaign in the database to own a globally unique priority number. Two campaigns may use the same priority if their targeting or dates do not overlap. Where they do overlap, the system needs a deterministic tie-breaker or an explicit merchandising position policy.

### Conflict is defined by overlapping audience and time

Google Ad Manager's forecasting identifies contending line items when they compete for the same impressions, specifically when targeting criteria and campaign dates overlap. Its UI reports higher-, same-, and lower-priority contenders rather than silently shifting every unrelated campaign. [Google Ad Manager: Forecast display](https://support.google.com/admanager/answer/2913775?hl=en)

This means a Penang-only campaign should not conflict with a Melaka-only campaign. A national campaign does overlap both, and a Food campaign may overlap an All Categories campaign in the same geography.

### Mature booking warns before approval

Ad Manager offers inventory forecasting before booking and exposes contending line items so an operator can see whether a new campaign may displace existing commitments. [Google Ad Manager: Check available inventory](https://support.google.com/admanager/answer/82234?hl=en)

For MyWisata, a lightweight equivalent is a conflict preview at draft creation and a required confirmation at approval. The reorder/pause/archive operation should be atomic at approval so a draft never disrupts live content.

## Current MyWisata behavior

- `state = null` and `category_slug = null` represent All States and All Categories.
- `priority` currently accepts `0..1000`; duplicate values are allowed.
- Customer requests first filter by approved status, effective dates, state and category, then sort by descending numeric priority and return at most four.
- The current system does not reserve four positions per targeting scope, warn about overlap, shift ranks, pause displaced campaigns, or archive older paused campaigns.

## Recommended MyWisata model

### 1. Treat the customer page as one four-position ad unit

For each customer request, build an eligible candidate pool from:

- approved campaigns whose date range is active;
- campaigns whose state is either the selected state or All Malaysia;
- campaigns whose category is either a selected category or All Categories;
- products that remain active and approved.

Then fill positions 1 through 4 from that eligible pool.

### 2. Prefer specific targeting, then use broader campaigns as fallback

Within the eligible pool:

1. campaigns matching both the exact state and exact category;
2. campaigns matching the exact state and All Categories;
3. All Malaysia campaigns matching the exact category;
4. All Malaysia plus All Categories campaigns.

Within the same specificity level, use display position 1 through 4, then a deterministic fallback such as approval time and ID. This lets Penang have its own promoted content while national campaigns fill unused positions rather than displacing every local campaign.

Example for a Penang + Food request:

- Penang + Food positions are chosen first.
- Penang + All Categories can fill remaining space.
- All Malaysia + Food can then fill remaining space.
- All Malaysia + All Categories is the final fallback.
- Stop when four advertisements have been selected.

Melaka follows the same evaluation independently. A Penang-only campaign and a Melaka-only campaign do not collide because they never compete for the same request.

### 3. Detect conflicts by overlap, not by matching number alone

A proposed position conflicts only when another approved or pending campaign has:

- an overlapping date range;
- overlapping state targeting, where All Malaysia overlaps every state;
- overlapping category targeting, where All Categories overlaps every category;
- the same specificity tier and requested position.

The Admin warning should name the affected campaigns and show the proposed order. Approval then inserts the new campaign, shifts affected campaigns back, pauses any campaign displaced beyond position 4, keeps the two most recently paused rows visible, and archives older paused rows from the default list. Database history and audit events remain retained.

### 4. Do not require a national campaign to have run separately in every state

Mature targeting systems treat country/national scope as an audience rule, not as proof assembled from child campaigns. Requiring a campaign to exist in every state would create duplicates and operational complexity.

If MyWisata wants a quality gate before All Malaysia targeting, use an explicit national-eligibility rule instead. For example, allow All Malaysia only when the product is active and approved and an authorized reviewer marks it `nationally_eligible`. This is clearer and auditable. It should not be inferred merely because the product previously had a Penang campaign.

## Recommended decision for this project

Use request-time eligibility plus specificity fallback, not a separate hard-coded four-row table for every state/category combination. Keep positions 1–4 meaningful inside overlapping targeting segments. Preview conflicts during draft creation and resolve them atomically at approval. Preserve audit history by archiving, not deleting, older paused campaigns.
