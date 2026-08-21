# Recommendation Content Localization Design

**Date:** 2026-08-21
**Status:** Proposed — user review requested
**Scope:** Chinese and Malay display drafts for English vendor recommendations, with a reusable path for verified vendor, outlet, product, and place content.

## Context

`vendor_recommendations.vendor_name`, `vendors.name`, `outlets.name`, and `products.name` store one source-language value. The UI locale files can translate system-owned labels, but cannot translate an arbitrary recommendation or business name. Replacing the source field with AI output would break search, deduplication, vendor identity, and brand names.

A recommendation currently collects a Google Maps place or dropped pin (`google_place_id`, formatted address, latitude, and longitude), not a MyWisata `places` record. Google identifies the real-world business location; it must not be mistaken for the platform's curated state, region, or POI hierarchy.

## Decisions

- The submitted English name remains the immutable source value for recommendation matching and audit.
- Machine translation produces Chinese (`zh-CN`) and Malay (`ms`) **drafts**, never a public replacement by itself.
- Brand and registered names default to the source value. A draft may provide a local display form or transliteration, but it must be approved by an administrator or the claimed vendor before customers see it.
- System labels and canonical state names continue using static i18n resources; they do not enter the AI translation pipeline. For example, English `Penang` resolves to Chinese `槟城` and Malay `Pulau Pinang` before public content is rendered.
- Geographic hierarchy is translated independently from commercial content. A `place` is platform-maintained geography/editorial content; it can have approved translations for its POI name, tagline, and introduction. A vendor, outlet, or product is only linked to that place by IDs and never supplies, inherits, or overwrites the place translation.
- A recommender selects a Google location, never an internal Area. The system may derive a candidate MyWisata Place from the address and coordinates, but a Super Admin must confirm or clear that candidate before it becomes the recommendation's internal geographic association.
- Google `place_id` and MyWisata `places.id` are separate identifiers. The former is external location evidence; the latter is curated platform geography.
- Translation generation starts only after an administrator has approved a recommendation. This prevents spending AI calls on spam, duplicates, rejected submissions, and private contact data.
- The first delivery uses an administrator-triggered “Generate translations” action after approval. It can later be invoked by a scheduler without changing the data model.

## Data Model

Create a reusable `content_translations` table rather than adding `name_zh` and `name_ms` columns to every entity:

```sql
content_translations (
  id uuid primary key,
  entity_type text check (entity_type in ('vendor_recommendation','vendor','outlet','product','place')),
  entity_id uuid not null,
  field text check (field in ('name','description')),
  locale text check (locale in ('zh-CN','ms')),
  source_text text not null,
  source_hash text not null,
  translated_text text not null,
  status text check (status in ('draft','approved','rejected','stale')),
  provider text,
  model text,
  created_at timestamptz not null default now(),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  unique (entity_type, entity_id, field, locale, source_hash)
)
```

`source_hash` marks a draft stale when a vendor edits its English source text. The table stores no contact details, storage paths, or full recommendation evidence.

The recommendation migration adds an optional, auditable internal geographic resolution:

```sql
vendor_recommendations (
  suggested_place_id uuid references places(id) on delete set null,
  resolved_place_id uuid references places(id) on delete set null,
  place_resolution_status text check (place_resolution_status in ('unresolved','suggested','confirmed','cleared'))
)
```

`suggested_place_id` is a non-authoritative server calculation from the Google address/coordinates. `resolved_place_id` changes only through Super Admin review. A valid recommendation may remain unresolved when no appropriate Area or POI exists.

## Workflow

1. A customer submits a recommendation in English. The existing recommendation RPC stores only the original value and returns normally; submission is never delayed by an AI call.
2. The server derives a non-authoritative internal Place candidate from the Google address and coordinates. It does not turn a Google `place_id` into a MyWisata Place ID.
3. A Super Admin verifies the business and confirms, changes, or clears the suggested Area/POI. The recommendation may remain geographically unresolved.
4. After approval, the Super Admin requests Chinese and Malay drafts from the existing server-side AI provider abstraction.
5. The translation prompt receives only a bounded, PII-redacted field value, source language, target locale, content type, and a rule to retain registered/brand names unless a natural local display form is clear. It never receives the recommender identity, phone, email, website, images, or storage paths.
6. Each result is stored as `draft`. The administrator can edit and approve it; after a vendor claims the recommendation, the vendor may propose edits but cannot self-approve public copy.
7. Public display resolves an approved translation for the active locale and the current source hash. If none exists or it is stale, it shows the original source value.
8. When a recommendation is converted to a vendor, translation records are copied only when the final vendor field exactly equals the recommendation source. Otherwise the new vendor field receives fresh drafts.

## Geographic Display Rules

1. Canonical Malaysian states and other fixed geographic labels use static locale resources. They must not depend on an AI provider or a vendor record.
2. `places` stores the source name and editorial content for the state, region, or POI. For non-canonical content such as POI names, taglines, and introductions, approved `content_translations` rows with `entity_type = 'place'` provide the Chinese and Malay display text.
3. A Place page first resolves its own geographic translation, then renders linked activities through `product_places` and nearby outlets by location. It does not derive the Place name from a vendor or activity.
4. A translated vendor, outlet, or product remains its own record. Its association to a Place remains an ID relation, so changing any translation cannot change discovery, search identity, or the geographic hierarchy.

## Boundaries and Security

- Only Super Admins can generate, approve, reject, or list review drafts across entities.
- A vendor owner can submit a replacement draft only for their own vendor/outlet/product; a Super Admin approves it.
- Customer reads are limited to `approved` translations for public entities; drafts are not exposed through public API responses.
- Translation endpoints use the existing server-side AI provider; client code never receives provider credentials.
- Calls reserve a per-entity/locale/source-hash idempotency boundary before the provider is called, so concurrent refreshes cannot create duplicate billable requests.
- Direct client writes to `content_translations`, `suggested_place_id`, and `resolved_place_id` are forbidden. The server calculates suggestions; a Super Admin route/RPC validates active internal Place IDs and records final resolution.
- Provider outages leave the original text visible and show a retryable admin error; they never block recommendation approval.

## Delivery Phases

1. **Recommendation geography and drafts:** migration for internal Place candidates/resolution, Super Admin resolution and translation-review UI, and tests for source preservation, authorization, idempotency, no-private-data prompt content, and no Google-to-Place identifier conflation.
2. **Public resolver:** reusable server/client resolver for approved `vendor_recommendation` and `vendor` names, with locale fallback tests.
3. **Broadened content:** add reviewed place POI/tagline/intro translations, then reuse the same table and resolver for outlet and product names/descriptions after their owner/admin editing policy is approved. Canonical state labels remain static i18n from the start.

## Out of Scope

- overwriting source names;
- translating a recommendation at customer submission time;
- exposing drafts to customers;
- translating private contacts, images, storage paths, or user-generated chat;
- automatic publication without administrator review;
- bulk backfill of existing public vendors, outlets, products, or places.

## Verification

- Database migration tests for constraints, RLS, and idempotency uniqueness.
- API tests for Super Admin authorization, allowed prompt fields, duplicate requests, provider failure, and status transitions.
- Resolver tests for locale selection, stale source fallback, and unpublished draft fallback.
- UI tests for draft editing, Super Admin approval, and original-name fallback.
