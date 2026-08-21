# Recommendation Content Localization Design

**Date:** 2026-08-21
**Status:** Proposed — user review requested
**Scope:** Chinese and Malay display drafts for English vendor recommendations, with a reusable path for verified vendor, outlet, product, and place content.

## Context

`vendor_recommendations.vendor_name`, `vendors.name`, `outlets.name`, and `products.name` store one source-language value. The UI locale files can translate system-owned labels, but cannot translate an arbitrary recommendation or business name. Replacing the source field with AI output would break search, deduplication, vendor identity, and brand names.

## Decisions

- The submitted English name remains the immutable source value for recommendation matching and audit.
- Machine translation produces Chinese (`zh-CN`) and Malay (`ms`) **drafts**, never a public replacement by itself.
- Brand and registered names default to the source value. A draft may provide a local display form or transliteration, but it must be approved by an administrator or the claimed vendor before customers see it.
- System labels and canonical state names continue using static i18n resources; they do not enter the AI translation pipeline.
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

## Workflow

1. A customer submits a recommendation in English. The existing recommendation RPC stores only the original value and returns normally; submission is never delayed by an AI call.
2. A Super Admin approves the recommendation, verifies it is a real business, then requests Chinese and Malay drafts from the existing server-side AI provider abstraction.
3. The translation prompt receives only the field value, source language, target locale, content type, and a rule to retain registered/brand names unless a natural local display form is clear. It never receives the recommender identity, phone, email, website, images, or storage paths.
4. Each result is stored as `draft`. The administrator can edit and approve it; after a vendor claims the recommendation, the vendor may propose edits but cannot self-approve public copy.
5. Public display resolves an approved translation for the active locale and the current source hash. If none exists or it is stale, it shows the original source value.
6. When a recommendation is converted to a vendor, translation records are copied only when the final vendor field exactly equals the recommendation source. Otherwise the new vendor field receives fresh drafts.

## Boundaries and Security

- Only Super Admins can generate, approve, reject, or list review drafts across entities.
- A vendor owner can submit a replacement draft only for their own vendor/outlet/product; a Super Admin approves it.
- Customer reads are limited to `approved` translations for public entities; drafts are not exposed through public API responses.
- Translation endpoints use the existing server-side AI provider; client code never receives provider credentials.
- Calls have a per-entity/locale/source-hash idempotency boundary so refreshes cannot create duplicate billable requests.
- Provider outages leave the original text visible and show a retryable admin error; they never block recommendation approval.

## Delivery Phases

1. **Recommendation drafts:** migration, Super Admin generation/review UI, and tests for source preservation, authorization, idempotency, and no-private-data prompt content.
2. **Public resolver:** reusable server/client resolver for approved `vendor_recommendation` and `vendor` names, with locale fallback tests.
3. **Broadened content:** reuse the same table and resolver for outlet, product, and place names/descriptions after their owner/admin editing policy is approved.

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
