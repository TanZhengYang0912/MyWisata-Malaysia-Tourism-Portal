# Profile City Autocomplete Design

**Status:** Approved design; implementation not started
**Date:** 2026-08-30

## Context

The customer Profile Identity step currently accepts free-text `city` and `country` values. This allows inconsistent spellings and gives travellers no help when entering a city. The product needs Google-like city suggestions without limiting the platform to Malaysian residents: Malaysia remains the default, while a traveller who selects China or another country receives suggestions within that country.

The repository already has `@googlemaps/js-api-loader` and a Google place picker for recommendation evidence. The Profile page and completed-Profile editor do not reuse it. The vendor address autocomplete is not suitable for this feature: it targets full outlet addresses, is visually vendor-specific, and currently calls an absent `/api/address/search` route.

## Goals

- Replace the Profile Country free-text input with a searchable country selector.
- Provide city and administrative-area suggestions restricted to the selected country.
- Default to Malaysia while supporting travellers from every ISO 3166 country.
- Preserve manual City entry when Google is unavailable or the desired city is not returned.
- Keep the incomplete Profile wizard and completed Profile editor consistent.
- Preserve the existing Profile completion and authorization rules.

## Non-goals

- Full residential or postal-address collection.
- A map, draggable pin, latitude, or longitude in Profile.
- Server-side Google validation or treating Google as an authorization source.
- Changes to Profile completion, Entitlements, Phone, KYC, Affiliate, Checkout, or Recommendation rules.
- Refactoring the existing Recommendation Google map picker or repairing the vendor address autocomplete.

## Selected approach

Use a custom Profile location experience backed by the Google Maps JavaScript Places library's Autocomplete Data API.

The custom UI is preferred over Google's self-contained `PlaceAutocompleteElement` because it can exactly reuse MyWisata's input, dropdown, dark-mode, focus, validation, and responsive tokens. It is preferred over a bundled worldwide city database because Google provides better multilingual aliases and current coverage without maintaining a large geography dataset in this repository.

Google is an input assistant only. The existing authenticated Profile API remains the sole persistence boundary, and the backend continues to validate trimmed `fullName`, `city`, and `country` strings.

## User experience

### Country

- Country is a searchable combobox backed by the complete ISO 3166 alpha-2 code list.
- New and empty Profiles default to `MY` / `Malaysia`.
- Display labels use `Intl.DisplayNames` for the active customer locale when available, with canonical English labels as fallback.
- The submitted value remains the canonical English country name so current database records and public Profile rendering remain compatible.
- Existing stored country names are mapped back to their ISO code. An unknown legacy value remains visible until the user chooses a recognized country; it is never silently discarded.
- Changing Country clears the current unsaved City value and any selected Google suggestion, preventing invalid combinations such as `Johor Bahru, China`.

### City

- The City field remains visually identical to the existing Profile input.
- Suggestions begin after two trimmed characters and a 300 ms debounce.
- Requests are restricted to the selected ISO country and to city/locality or administrative-area results; business, hotel, attraction, and street-address suggestions are excluded.
- Show at most five suggestions.
- The query accepts multilingual input. The selected value is normalized to the canonical English city or administrative-area name when Google provides it; examples include `吉隆坡` to `Kuala Lumpur` and `广州` to `Guangzhou`.
- Selecting a suggestion updates City but does not auto-submit the form.
- Free text remains valid. A user may ignore suggestions, enter a city Google does not return, and continue normally.
- Keyboard support includes Arrow Up/Down, Enter, Escape, focus return, and an announced active option. Pointer selection must not blur the field before selection is applied.

## Component boundaries

### `ProfileLocationFields`

Owns the relationship between selected Country and City. It receives controlled `city` and `country` strings plus change callbacks, renders both fields, maps stored country names to ISO codes, and clears City when the user deliberately changes Country.

It does not submit Profile data and does not know about Profile completion.

### `CountryCombobox`

Provides searchable ISO country selection, localized display names, canonical English persistence names, keyboard navigation, and accessible combobox/listbox semantics.

It does not call Google or any project API.

### `CityAutocomplete`

Owns Google library readiness, debounced prediction requests, session lifecycle, stale-response rejection, dropdown state, keyboard interaction, selection normalization, and manual-entry fallback.

It receives an ISO country code and never receives the user's name, email, account ID, phone, Profile completion state, or other Profile fields.

### Location utilities

A small location module owns the ISO code list, localized/canonical country labels, legacy country-name matching, Google address-component parsing, and pure result normalization. These functions remain independent of React and Google network calls so they can be unit tested without browser credentials.

## Data flow

1. `/api/profile/me` loads the existing `city` and `country` strings.
2. `ProfileLocationFields` maps Country to an ISO code and renders controlled inputs.
3. After two City characters and 300 ms, `CityAutocomplete` asks Google for predictions restricted to the selected ISO country.
4. One fresh session token groups prediction requests until the user selects a suggestion or abandons the search.
5. On selection, the component fetches only the fields needed to resolve canonical city and country labels.
6. The user presses the existing Continue or Save button.
7. The existing `PATCH /api/profile/identity` request submits `{ fullName, city, country }` and the existing Zod schema and authenticated update path remain unchanged.

No Place ID, coordinates, full address, raw Google response, or query history is persisted in MyWisata.

## Google configuration, cost, and privacy

- Use the existing browser Google Maps loader; do not add a second script tag or a new package.
- The Google Cloud project must enable Maps JavaScript API and Places API (New), have billing enabled, and use a browser key restricted by allowed website referrers and the minimum required APIs.
- Use session tokens and minimal field fetching to avoid ungrouped autocomplete requests and unnecessary billable data.
- Only the typed City query, selected country restriction, locale, and session token are sent to Google.
- Do not proxy browser autocomplete through a server route or expose a server-side Maps key.
- Never log City queries, Google raw responses, session tokens, or browser API keys through application logs or analytics.

## Error and fallback behavior

- Missing browser key, loader failure, API denial, quota exhaustion, timeout, and empty results never block Profile completion.
- The City input remains editable and the existing server validation remains authoritative.
- A localized, non-technical hint explains that suggestions are temporarily unavailable and manual entry is allowed.
- Do not show raw Google error messages or credential details.
- Cancel the debounce and ignore stale responses when City, Country, component lifecycle, or request generation changes.
- Closing the dropdown does not clear typed City text.
- Google loading state is limited to the City field and never disables Full Name, Country, or the existing Continue/Save action.

## Surfaces to update

- `app/customer/profile/page.tsx`: use the shared Profile location fields in the incomplete Identity step.
- `components/profile/profile-sections.tsx`: use the same component in completed-Profile personal editing.
- New Profile location components under `components/profile/`.
- New pure country and Google place-normalization utilities under `lib/location/`.
- Customer locale JSON for English, Simplified Chinese, and Bahasa Melayu.
- Focused component, utility, Profile contract, and i18n tests.

## Scope boundaries

### Files not to modify

- Profile API authorization and persistence routes, unless a test reveals a confirmed compatibility defect in the existing string contract.
- Supabase migrations, schema, RLS, RPCs, or seed data.
- `components/recommendations/google-place-picker.tsx`.
- Vendor address components and outlet forms.
- Phone, KYC, Entitlement, Affiliate, Checkout, Wallet, or Admin files.

### Dependencies

No new npm dependency. Reuse `@googlemaps/js-api-loader`, `google.maps` types already available to the project, existing UI tokens, and the browser `Intl.DisplayNames` API.

### Database changes

None. Continue persisting `users.city` and `users.country` strings. Place ID and ISO country code persistence are explicitly deferred because manual City entry remains supported and neither value is currently required by authorization or Profile completion.

## Testing strategy

### Automated tests

- Country list covers ISO codes, defaults to Malaysia, produces canonical English persistence labels, and maps existing stored values.
- Country changes clear City only for deliberate user selection, not initial Profile hydration.
- City queries do not start before two characters and are debounced.
- Prediction requests contain the selected country restriction and city/administrative-area type restriction.
- Stale and out-of-order Google responses cannot replace current suggestions.
- Selection normalization handles locality, administrative-area fallback, multilingual input, and malformed results.
- API failure keeps manual entry usable and exposes only localized fallback copy.
- Both incomplete and completed Profile surfaces use the shared component.
- Existing identity schema, Profile completion, and i18n inventory tests continue to pass.
- CI uses a mocked Google adapter and never performs a billable network call.

### Browser QA

- English, Simplified Chinese, and Bahasa Melayu labels.
- Light and dark themes.
- Desktop and narrow viewport without dropdown clipping or horizontal overflow.
- Malaysia default: `吉隆坡` or `Kuala` can select `Kuala Lumpur`.
- China selection: `广州` can select `Guangzhou` without Malaysian priority.
- Country change clears unsaved City.
- Keyboard-only selection and screen-reader semantics.
- Missing/disabled Places API visibly falls back to manual City entry.

## Risks and mitigations

- **Google billing abuse:** restrict the browser key by referrer and API, use sessions, debounce, minimum query length, and minimal fields.
- **Privacy leakage:** send only City query and country scope; do not send or log account/Profile data.
- **Inconsistent legacy Country values:** preserve unknown values and require explicit user selection before normalization.
- **Google outage:** manual City entry remains valid and backend validation does not depend on Google.
- **Stale suggestions:** generation checks and cleanup ignore out-of-order requests.
- **Two Profile editors diverge:** both surfaces consume the same controlled component and share contract tests.
- **Theme mismatch:** use existing MyWisata tokens rather than Google's self-contained widget UI.

## External setup required

Before production verification, a Google Cloud administrator must confirm billing, enable Places API (New), and restrict the browser key to approved MyWisata development and production referrers plus Maps JavaScript API and Places API. This is an external deployment prerequisite, not an application-code task.

## References

- [Google Place Autocomplete Widget (New)](https://developers.google.com/maps/documentation/javascript/place-autocomplete-new)
- [Google Place Autocomplete Data API](https://developers.google.com/maps/documentation/javascript/place-autocomplete-data)
- [Google Places session tokens](https://developers.google.com/maps/documentation/places/web-service/using-session-tokens)
- [Google Maps Platform API key security](https://developers.google.com/maps/api-security-best-practices)
