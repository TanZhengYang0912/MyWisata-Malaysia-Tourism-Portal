# Profile City Autocomplete Design

**Status:** Implemented; deployment and browser design QA blocked pending migration/import
**Date:** 2026-08-30

## Context

Profile currently stores free-text `city` and `country`. The product needs country-scoped, multilingual city suggestions for residents and international travellers while retaining manual entry. The first design used Google Places as the autocomplete master, but Google permits indefinite storage of Place IDs while restricting long-term storage of other Places content. A persistent Profile city is therefore a poor fit for Google-owned master data.

The approved production architecture is provider-neutral: MyWisata owns a canonical city catalogue imported from GeoNames, and Google remains an optional future supplement for map/address workflows. Users never see provider IDs.

## Goals

- Searchable country selector covering ISO 3166-1 alpha-2 countries, defaulting to Malaysia.
- City suggestions limited to the selected country.
- Multilingual/alternate-name lookup, including `吉隆坡` resolving to `Kuala Lumpur`.
- Stable internal `city_id` for catalogue selections.
- Manual city entry for missing locations or service/data failures.
- Identical behavior in the incomplete Profile wizard and completed Profile editor.
- Preserve all existing Profile completion and authorization rules.

## Non-goals

- Residential addresses, postal codes, maps, pins, routes, or coordinates in the Profile UI.
- Reusing Google Place IDs as MyWisata's city identity.
- Refactoring Recommendation/Vendor location flows.
- Changing Phone, KYC, Entitlements, Affiliate, Checkout, Wallet, or Admin rules.

## Data model

### Canonical catalogue

`location_cities` stores the subset of GeoNames fields required for search and identity:

- internal UUID primary key
- `geonames_id` stable external source identifier
- canonical `name` and `ascii_name`
- search-only alternate names
- ISO `country_code`
- administrative code, coordinates, population, timezone
- source modification date and timestamps

GeoNames `cities1000.zip` is the default import: roughly 130,000 populated places or administrative seats. Its embedded alternate-name field is sufficient for the first multilingual search index. The importer is repeatable and upserts by `geonames_id`.

### User location reference

`users` remains backward compatible and gains nullable metadata:

- `city_id UUID NULL REFERENCES location_cities(id)`
- `country_code CHAR(2) NULL`
- `city_source TEXT NOT NULL DEFAULT 'manual'` with `catalogue | manual`

Existing `city` and `country` strings remain the display and public-profile fields. For a catalogue selection the backend resolves and writes canonical strings from the selected database row; it never trusts client-supplied canonical labels. For manual entry it writes the trimmed user strings and clears `city_id`.

## Search architecture

- Authenticated `GET /api/locations/cities?country=MY&q=吉隆坡` is the browser boundary.
- The route validates a two-letter country code and a 2–100 character query.
- It calls a database search RPC with a maximum of five results.
- Search is always country-scoped, prioritizes prefix/canonical matches, then alternate-name similarity, then population.
- Only `id`, `name`, administrative label, and country code leave the API.
- Queries are not logged by application code.
- Empty catalogues, failures, or missing imported data do not block manual Profile entry.

## Import and licensing

- `scripts/import-geonames-cities.mjs` downloads or accepts a local `cities1000.zip`, streams its TSV contents, and batch-upserts through PostgreSQL using `DATABASE_URL`.
- The script is opt-in; application startup and migrations never download external data.
- The UI attributes suggestion data to GeoNames under CC BY 4.0.
- Import documentation records the source URL, license, idempotent command, and expected operational checks.

## User experience

### Country

- Searchable, accessible combobox generated from the complete ISO code list.
- Labels use `Intl.DisplayNames` for the active locale; persistence uses the canonical English label plus ISO code.
- Existing legacy country strings are mapped when recognized and preserved when unknown.
- Deliberately changing Country clears the unsaved City selection/text.

### City

- Existing MyWisata input skeleton and design tokens remain unchanged.
- Suggestions start after two trimmed characters with a 300 ms debounce.
- Up to five results show canonical city plus administrative context.
- Selecting a result records its internal `city_id`; it does not submit automatically.
- Editing selected text clears `city_id` and returns to manual mode.
- The user can always ignore suggestions and save their own City string.
- Keyboard behavior supports Arrow Up/Down, Enter, Escape, focus retention, listbox semantics, and announced active options.
- The dropdown contains a visible `City data © GeoNames, CC BY 4.0` attribution link.

## Persistence rules

`PATCH /api/profile/identity` accepts the existing fields plus optional location metadata:

```ts
{
  fullName: string;
  city: string;
  country: string;
  cityId?: string | null;
  countryCode?: string | null;
}
```

- When `cityId` is present, the backend requires a matching active catalogue row for `countryCode`, then writes canonical city/country values and `city_source = 'catalogue'`.
- Invalid/mismatched IDs fail closed with a validation error.
- When `cityId` is absent, the existing string validation applies and the backend writes `city_source = 'manual'`.
- Profile completion continues to depend on non-empty `city` and `country` strings; catalogue selection is not mandatory.

## Privacy and security

- Search receives only the typed city query and selected country code—never name, email, phone, KYC, entitlement, or account ID.
- Location tables are not directly writable by customers.
- Catalogue imports require an explicit database administrator connection and are never exposed through application endpoints.
- APIs do not expose source archive paths, database credentials, raw alternate-name blobs, coordinates, or query logs.

## Surfaces

### Create

- `supabase/migrations/20260830123000_profile_location_catalogue.sql`
- `scripts/import-geonames-cities.mjs`
- `lib/location/countries.ts`
- `lib/location/city-types.ts`
- `app/api/locations/cities/route.ts`
- `components/profile/country-combobox.tsx`
- `components/profile/city-autocomplete.tsx`
- `components/profile/profile-location-fields.tsx`
- focused tests for each boundary

### Modify

- `lib/validation/profile-schemas.ts`
- `app/api/profile/identity/route.ts`
- `app/api/profile/me/route.ts`
- `lib/profile/profile-summary.ts`
- `backend/core/types.ts`
- `app/customer/profile/page.tsx`
- `components/profile/profile-sections.tsx`
- customer locale JSON for English, Simplified Chinese, and Bahasa Melayu
- `package.json` for the explicit import command

## Files not touched

- Recommendation Google picker and recommendation persistence
- Vendor address/outlet location flows
- Phone/KYC/Entitlement/Affiliate/Checkout/Wallet/Admin code
- Existing public Profile authorization rules
- Unrelated dirty-worktree files

## Dependencies

No new npm dependency. The importer uses Node built-ins, the existing `pg` package, and the system `unzip` executable. Runtime Profile search uses Supabase/PostgreSQL only.

## Verification

- Migration contract tests prove schema, RLS/grants, country matching, and canonical-vs-manual update behavior.
- Importer unit tests prove TSV parsing, batching, and absence of credential/data logging.
- API tests prove auth, validation, bounded results, and safe errors.
- Component tests prove country scoping, debounce/stale response handling, selection/manual transitions, keyboard behavior, attribution, and failure fallback.
- Both Profile editors share the same controlled component.
- A focused permission/privacy review checks query data, RLS, import credentials, and response fields.
- Browser QA covers English/Chinese/Malay, dark/light, desktop/narrow widths, Malaysia/China searches, manual fallback, and both Profile surfaces.

## References

- [GeoNames download format and CC BY 4.0 license](https://download.geonames.org/export/dump/readme.txt)
- [GeoNames search and language behavior](https://www.geonames.org/export/geonames-search.html)
- [Google Places content storage policy](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Place ID storage and refresh](https://developers.google.com/maps/documentation/places/web-service/place-id)
