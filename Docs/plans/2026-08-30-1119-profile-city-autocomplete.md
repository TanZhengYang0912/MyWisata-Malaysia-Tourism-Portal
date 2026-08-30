# Profile City Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable ISO Country selector and Google Places city autocomplete to both customer Profile editors while preserving manual entry, existing persistence, and all authorization rules.

**Architecture:** A pure `lib/location` layer owns country labels, Google request construction, and place normalization. A narrow Google adapter wraps the existing Maps JavaScript loader, while three controlled Profile components own country search, city suggestion state, and the country-city relationship. Both existing Profile surfaces consume the same component and continue submitting the unchanged `{ fullName, city, country }` API contract.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, `@googlemaps/js-api-loader` 2.1.1, Google Maps JavaScript Places API (New), i18next, TailwindCSS, Vitest.

## Global Constraints

- Follow the approved design in `Docs/superpowers/specs/2026-08-30-profile-city-autocomplete-design.md`.
- Country defaults to `MY` / `Malaysia`, but every ISO 3166 alpha-2 country is selectable.
- Google suggestions are restricted to the selected country and city-like results; manual City entry always remains valid.
- Persist only the existing canonical English `city` and `country` strings. Do not persist Place ID, coordinates, session tokens, queries, or raw Google responses.
- Do not modify Profile completion, Entitlements, Phone, KYC, Affiliate, Checkout, Recommendation, Admin, database schema, RLS, RPCs, or seeds.
- Do not modify `components/recommendations/google-place-picker.tsx` or vendor address components.
- Reuse the existing `@googlemaps/js-api-loader`; add no npm dependency and no server-side Google route.
- Never log City queries, Google responses, session tokens, or API keys.
- All new customer copy must exist in English, Simplified Chinese, and Bahasa Melayu.
- CI must mock the Google seam and make no billable network request.
- Preserve unrelated dirty-worktree files.

## Exact file map

**Create:**

- `lib/location/countries.ts` — ISO country codes, localized/canonical labels, and stored-country matching.
- `lib/location/google-city-autocomplete.ts` — provider contract, Google Places adapter, request construction, and selection normalization.
- `lib/location/__tests__/countries.test.ts` — country default, localization, matching, and unknown-legacy behavior.
- `lib/location/__tests__/google-city-autocomplete.test.ts` — request restriction, minimal fields, normalization, and mocked provider behavior.
- `components/profile/country-combobox.tsx` — controlled accessible searchable Country selector.
- `components/profile/city-autocomplete.tsx` — controlled manual City input plus debounced Google suggestions.
- `components/profile/profile-location-fields.tsx` — shared relationship wrapper that clears City only on deliberate Country change.
- `components/profile/__tests__/profile-location-fields.test.ts` — component contract and accessible interaction seam.

**Modify:**

- `app/customer/profile/page.tsx` — replace the incomplete Identity City/Country inputs.
- `components/profile/profile-sections.tsx` — replace the completed-Profile personal City/Country inputs.
- `app/customer/profile/__tests__/profile-completion.test.ts` — require the shared component in the wizard.
- `components/profile/__tests__/profile-sections.test.ts` — require the shared component in completed-Profile editing, or create this contract file if absent.
- `app/customer/__tests__/sitewide-i18n.contract.test.ts` — include new Profile component files in the explicit inventory if required by the existing contract.
- `app/i18n/locales/en/customer.json` — English Country/City search and fallback copy.
- `app/i18n/locales/zh-CN/customer.json` — Simplified Chinese copy.
- `app/i18n/locales/ms/customer.json` — Bahasa Melayu copy.
- `Docs/plans/2026-08-30-1119-profile-city-autocomplete.md` — checklist and final evidence only.

**New dependencies:** None.

**Database changes:** None.

**Files explicitly not touched:** Profile API routes, `lib/validation/profile-schemas.ts`, Supabase files, Recommendation Google picker, vendor address autocomplete/outlet form, Entitlement code, Phone/KYC code, Affiliate/Checkout/Wallet/Admin code.

---

### Task 1: Canonical country model

**Files:**
- Create: `lib/location/__tests__/countries.test.ts`
- Create: `lib/location/countries.ts`

**Interfaces:**
- Produces: `CountryOption`, `DEFAULT_COUNTRY_CODE`, `getCountryOptions(locale)`, `getCanonicalCountryName(code)`, `findCountryCode(value, locale)`.
- Consumes: browser/Node `Intl.DisplayNames`; no React, Google, database, or network.

- [ ] **Step 1: Write the failing country tests**

```ts
import {
  DEFAULT_COUNTRY_CODE,
  findCountryCode,
  getCanonicalCountryName,
  getCountryOptions,
} from "@/lib/location/countries";

describe("profile countries", () => {
  it("defaults to Malaysia and exposes the complete ISO list", () => {
    expect(DEFAULT_COUNTRY_CODE).toBe("MY");
    const options = getCountryOptions("en");
    expect(options).toHaveLength(249);
    expect(options.find((item) => item.code === "MY")?.canonicalName).toBe("Malaysia");
    expect(options.find((item) => item.code === "CN")?.canonicalName).toBe("China");
  });

  it("localizes labels but keeps canonical English persistence names", () => {
    const china = getCountryOptions("zh-CN").find((item) => item.code === "CN");
    expect(china).toMatchObject({ code: "CN", canonicalName: "China" });
    expect(china?.label).not.toBe("");
  });

  it("maps existing canonical, localized, and code values", () => {
    expect(findCountryCode("Malaysia", "en")).toBe("MY");
    expect(findCountryCode("China", "zh-CN")).toBe("CN");
    expect(findCountryCode("CN", "en")).toBe("CN");
    expect(findCountryCode("Legacy Atlantis", "en")).toBeNull();
    expect(getCanonicalCountryName("MY")).toBe("Malaysia");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run lib/location/__tests__/countries.test.ts`

Expected: FAIL because `@/lib/location/countries` does not exist.

- [ ] **Step 3: Implement the ISO country utility**

Use the exact ISO alpha-2 list, represented compactly without a dependency:

```ts
export const ISO_COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ") as readonly string[];

export type CountryOption = {
  code: string;
  label: string;
  canonicalName: string;
};

export const DEFAULT_COUNTRY_CODE = "MY";

function displayNames(locale: string) {
  return new Intl.DisplayNames([locale], { type: "region" });
}

export function getCanonicalCountryName(code: string): string {
  return displayNames("en").of(code.toUpperCase()) ?? code.toUpperCase();
}

export function getCountryOptions(locale: string): CountryOption[] {
  const localized = displayNames(locale);
  return ISO_COUNTRY_CODES.map((code) => ({
    code,
    label: localized.of(code) ?? getCanonicalCountryName(code),
    canonicalName: getCanonicalCountryName(code),
  })).sort((a, b) => a.label.localeCompare(b.label, locale));
}

export function findCountryCode(value: string | null | undefined, locale: string): string | null {
  const normalized = value?.trim().toLocaleLowerCase(locale);
  if (!normalized) return DEFAULT_COUNTRY_CODE;
  const upper = normalized.toUpperCase();
  if (ISO_COUNTRY_CODES.includes(upper)) return upper;
  const match = getCountryOptions(locale).find((item) =>
    item.label.toLocaleLowerCase(locale) === normalized
    || item.canonicalName.toLocaleLowerCase("en") === normalized.toLocaleLowerCase("en"));
  return match?.code ?? null;
}
```

If Node's canonical label differs for a historically stored country alias, add only an explicit tested alias map; do not introduce fuzzy country matching.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run lib/location/__tests__/countries.test.ts`

Expected: PASS with 249 country options, Malaysia default, localized labels, canonical English values, and unknown values preserved as unmapped.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/location/countries.ts lib/location/__tests__/countries.test.ts
git commit -m "feat: add canonical profile countries"
```

---

### Task 2: Google city autocomplete adapter

**Files:**
- Create: `lib/location/__tests__/google-city-autocomplete.test.ts`
- Create: `lib/location/google-city-autocomplete.ts`

**Interfaces:**
- Consumes: `@googlemaps/js-api-loader` `setOptions()` / `importLibrary("places")`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, Google Places API (New).
- Produces: `CitySuggestion`, `CitySelection`, `CityAutocompleteProvider`, `createGoogleCityAutocompleteProvider()`, `buildCityAutocompleteRequest()`, `normalizeCityPlace()`.

- [ ] **Step 1: Write failing pure request and normalization tests**

```ts
import {
  buildCityAutocompleteRequest,
  normalizeCityPlace,
  type CityPlaceSnapshot,
} from "@/lib/location/google-city-autocomplete";

it("restricts predictions to city-like results in the selected country", () => {
  expect(buildCityAutocompleteRequest({
    input: "Johor",
    countryCode: "MY",
    language: "en",
    sessionToken: {} as google.maps.places.AutocompleteSessionToken,
  })).toMatchObject({
    input: "Johor",
    includedRegionCodes: ["my"],
    includedPrimaryTypes: ["(cities)"],
    language: "en",
    region: "my",
  });
});

it("normalizes locality and country without persisting address or coordinates", () => {
  const place: CityPlaceSnapshot = {
    displayName: "Guangzhou",
    addressComponents: [
      { longText: "Guangzhou", shortText: "Guangzhou", types: ["locality", "political"] },
      { longText: "China", shortText: "CN", types: ["country", "political"] },
    ],
  };
  expect(normalizeCityPlace(place)).toEqual({ city: "Guangzhou", country: "China" });
  expect(normalizeCityPlace({ displayName: null, addressComponents: [] })).toBeNull();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run lib/location/__tests__/google-city-autocomplete.test.ts`

Expected: FAIL because the adapter module does not exist.

- [ ] **Step 3: Implement pure request construction and place normalization**

```ts
export type CitySelection = { city: string; country: string };
export type CityPlaceSnapshot = {
  displayName: string | null | undefined;
  addressComponents: ReadonlyArray<{
    longText: string;
    shortText: string;
    types: readonly string[];
  }> | undefined;
};

export function buildCityAutocompleteRequest(input: {
  input: string;
  countryCode: string;
  language: string;
  sessionToken: google.maps.places.AutocompleteSessionToken;
}): google.maps.places.AutocompleteRequest {
  const region = input.countryCode.toLowerCase();
  return {
    input: input.input.trim(),
    includedRegionCodes: [region],
    includedPrimaryTypes: ["(cities)"],
    language: input.language,
    region,
    sessionToken: input.sessionToken,
  };
}

function component(place: CityPlaceSnapshot, type: string) {
  return place.addressComponents?.find((item) => item.types.includes(type));
}

export function normalizeCityPlace(place: CityPlaceSnapshot): CitySelection | null {
  const city = component(place, "locality")?.longText
    ?? component(place, "postal_town")?.longText
    ?? component(place, "administrative_area_level_2")?.longText
    ?? place.displayName
    ?? null;
  const country = component(place, "country")?.longText ?? null;
  return city?.trim() && country?.trim() ? { city: city.trim(), country: country.trim() } : null;
}
```

- [ ] **Step 4: Extend the failing test with a mocked provider contract**

Test these exact behaviors without network access:

```ts
const provider = await createGoogleCityAutocompleteProvider({
  key: "test-key",
  loadPlaces: async () => fakePlacesLibrary,
});
const session = provider.createSession();
const suggestions = await provider.search({ input: "Kuala", countryCode: "MY", language: "en", session });
expect(fakeFetch).toHaveBeenCalledWith(expect.objectContaining({ includedRegionCodes: ["my"], sessionToken: session }));
expect(suggestions).toHaveLength(1);
const selection = await provider.select(suggestions[0]);
expect(fakeFetchFields).toHaveBeenCalledWith({ fields: ["displayName", "addressComponents"] });
expect(selection).toEqual({ city: "Kuala Lumpur", country: "Malaysia" });
```

- [ ] **Step 5: Run the provider test and verify RED**

Run: `npx vitest run lib/location/__tests__/google-city-autocomplete.test.ts`

Expected: FAIL because `createGoogleCityAutocompleteProvider` is not implemented.

- [ ] **Step 6: Implement the provider and safe loader**

Use these exact public interfaces:

```ts
export type CitySuggestion = {
  id: string;
  primaryText: string;
  secondaryText: string;
  prediction: google.maps.places.PlacePrediction;
};

export type CityAutocompleteSession = google.maps.places.AutocompleteSessionToken;

export type CityAutocompleteProvider = {
  createSession(): CityAutocompleteSession;
  search(input: { input: string; countryCode: string; language: string; session: CityAutocompleteSession }): Promise<CitySuggestion[]>;
  select(suggestion: CitySuggestion): Promise<CitySelection | null>;
};
```

Implementation requirements:

```ts
const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLibrary;

return {
  createSession: () => new AutocompleteSessionToken(),
  async search({ input, countryCode, language, session }) {
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(
      buildCityAutocompleteRequest({ input, countryCode, language, sessionToken: session }),
    );
    return suggestions.flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction) return [];
      return [{
        id: prediction.placeId,
        primaryText: prediction.mainText?.toString() ?? prediction.text.toString(),
        secondaryText: prediction.secondaryText?.toString() ?? "",
        prediction,
      }];
    }).slice(0, 5);
  },
  async select(suggestion) {
    const place = suggestion.prediction.toPlace();
    await place.fetchFields({ fields: ["displayName", "addressComponents"] });
    return normalizeCityPlace(place);
  },
};
```

`createGoogleCityAutocompleteProvider()` returns `null` when no key exists. If `window.google?.maps?.importLibrary` already exists, call it directly; otherwise call `setOptions({ key, v: "weekly" })` once in this module and then `importLibrary("places")`. Never log the key or loader error.

- [ ] **Step 7: Run Task 2 tests and TypeScript**

Run:

```bash
npx vitest run lib/location/__tests__/google-city-autocomplete.test.ts
npx tsc --noEmit
```

Expected: PASS; no real Google request occurs.

- [ ] **Step 8: Commit Task 2**

```bash
git add lib/location/google-city-autocomplete.ts lib/location/__tests__/google-city-autocomplete.test.ts
git commit -m "feat: add Google city suggestion adapter"
```

---

### Task 3: Accessible Profile location components

**Files:**
- Create: `components/profile/__tests__/profile-location-fields.test.ts`
- Create: `components/profile/country-combobox.tsx`
- Create: `components/profile/city-autocomplete.tsx`
- Create: `components/profile/profile-location-fields.tsx`

**Interfaces:**
- Consumes: Task 1 country functions; Task 2 `CityAutocompleteProvider` and `createGoogleCityAutocompleteProvider()`.
- Produces: `ProfileLocationFields({ city, country, onCityChange, onCountryChange, invalid?, disabled? })`.

- [ ] **Step 1: Write the failing component contract**

The test reads the source files and requires:

```ts
expect(profileLocationSource).toContain("export function ProfileLocationFields");
expect(profileLocationSource).toContain("<CountryCombobox");
expect(profileLocationSource).toContain("<CityAutocomplete");
expect(profileLocationSource).toContain('onCityChange("")');
expect(countrySource).toContain('role="combobox"');
expect(countrySource).toContain('role="listbox"');
expect(citySource).toContain('aria-autocomplete="list"');
expect(citySource).toContain("window.setTimeout");
expect(citySource).toContain("300");
expect(citySource).toContain("requestGeneration");
expect(citySource).toContain("manualEntryHint");
```

Also assert there is no map, latitude, longitude, full-address field, or server autocomplete route.

- [ ] **Step 2: Run the component contract and verify RED**

Run: `npx vitest run components/profile/__tests__/profile-location-fields.test.ts`

Expected: FAIL because all three components are absent.

- [ ] **Step 3: Implement `CountryCombobox`**

Required props:

```ts
type CountryComboboxProps = {
  value: string;
  locale: string;
  onSelect: (country: { code: string; canonicalName: string }) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
};
```

Behavior:

- Resolve `value` with `findCountryCode`; preserve unknown legacy text.
- Filter `getCountryOptions(locale)` by localized label, canonical English name, or ISO code.
- Use `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, a `role="listbox"`, and `role="option"` rows.
- Support Arrow Up/Down, Enter, Escape, pointer selection with `onMouseDown(event.preventDefault())`, and outside blur closure.
- Render with existing `border`, `bg-background`, `text-foreground`, `muted-foreground`, `primary`, and rounded-xl tokens; do not hardcode white-only dropdown colors.

- [ ] **Step 4: Implement `CityAutocomplete`**

Required props:

```ts
type CityAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  countryCode: string | null;
  locale: string;
  label: string;
  placeholder: string;
  unavailableMessage: string;
  noResultsMessage: string;
  manualEntryHint: string;
  disabled?: boolean;
  invalid?: boolean;
  providerFactory?: () => Promise<CityAutocompleteProvider | null>;
};
```

Behavior:

- Every keystroke immediately calls `onChange`; Google is never required for manual input.
- Below two trimmed characters or without a recognized country: cancel debounce, close suggestions, and do not initialize Google.
- Debounce 300 ms; capture a monotonically increasing `requestGeneration` and ignore responses/errors whose generation is no longer current.
- Create one session on the first eligible query; reuse it while typing; after successful `select()`, discard it so the next search creates a new token.
- Never log errors. Loader/search/select errors set a local fallback state and leave the input active.
- Suggestion dropdown shows at most five rows with primary and secondary text, keyboard navigation, accessible listbox semantics, dark/light tokens, and `Powered by Google` attribution text required by the Places UI policy.
- Selecting a suggestion calls `onChange(selection.city)` only. `ProfileLocationFields` owns Country consistency.

- [ ] **Step 5: Implement `ProfileLocationFields`**

Required props:

```ts
type ProfileLocationFieldsProps = {
  city: string;
  country: string;
  onCityChange: (value: string) => void;
  onCountryChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
};
```

Use `useTranslation("customer")` and `i18n.resolvedLanguage ?? i18n.language ?? "en"`. When `CountryCombobox` emits a country whose canonical name differs from the current Country, call `onCountryChange(canonicalName)` and then `onCityChange("")`. Initial hydration and locale changes must not invoke either callback.

Render Country before City so the restriction is explicit. On a Google City selection whose returned country is canonical but equivalent to the chosen country, keep the selected Country unchanged.

- [ ] **Step 6: Run Task 3 tests and scoped ESLint**

Run:

```bash
npx vitest run components/profile/__tests__/profile-location-fields.test.ts lib/location/__tests__
npx eslint components/profile/country-combobox.tsx components/profile/city-autocomplete.tsx components/profile/profile-location-fields.tsx
```

Expected: PASS with no errors or new warnings.

- [ ] **Step 7: Commit Task 3**

```bash
git add components/profile/country-combobox.tsx components/profile/city-autocomplete.tsx components/profile/profile-location-fields.tsx components/profile/__tests__/profile-location-fields.test.ts
git commit -m "feat: add profile location fields"
```

---

### Task 4: Integrate both Profile editors and localize copy

**Files:**
- Modify: `app/customer/profile/__tests__/profile-completion.test.ts`
- Modify or Create: `components/profile/__tests__/profile-sections.test.ts`
- Modify: `app/customer/profile/page.tsx`
- Modify: `components/profile/profile-sections.tsx`
- Modify: `app/customer/__tests__/sitewide-i18n.contract.test.ts`
- Modify: `app/i18n/locales/en/customer.json`
- Modify: `app/i18n/locales/zh-CN/customer.json`
- Modify: `app/i18n/locales/ms/customer.json`

**Interfaces:**
- Consumes: Task 3 `ProfileLocationFields`.
- Produces: consistent Profile wizard and completed-Profile edit behavior; unchanged `/api/profile/identity` body.

- [ ] **Step 1: Write failing integration contracts**

Require both surfaces to import and render `ProfileLocationFields` with the existing controlled state:

```ts
expect(profilePage).toContain('import { ProfileLocationFields }');
expect(profilePage).toContain('city={city}');
expect(profilePage).toContain('country={country}');
expect(profilePage).toContain('onCityChange={setCity}');
expect(profilePage).toContain('onCountryChange={setCountry}');

expect(profileSections).toContain('import { ProfileLocationFields }');
expect(profileSections).toContain('<ProfileLocationFields');
```

Reject the old paired raw City/Country inputs in the relevant edit branches, while preserving `identitySchema.safeParse({ fullName, city, country })` and the existing API body.

- [ ] **Step 2: Run integration contracts and verify RED**

Run:

```bash
npx vitest run app/customer/profile/__tests__/profile-completion.test.ts components/profile/__tests__/profile-sections.test.ts
```

Expected: FAIL because neither surface uses `ProfileLocationFields`.

- [ ] **Step 3: Add exact locale keys in all three customer locale files**

Under `ui.profileWizard.location`, add equivalent localized values for:

```json
{
  "countrySearchPlaceholder": "Search for a country",
  "countryNoResults": "No country found",
  "citySearchHint": "Type at least 2 characters for city suggestions",
  "cityNoResults": "No city suggestions found",
  "citySuggestionsUnavailable": "City suggestions are temporarily unavailable.",
  "manualEntryHint": "You can still enter your city manually.",
  "citySuggestionsLabel": "City suggestions",
  "poweredByGoogle": "Powered by Google"
}
```

Malay and Simplified Chinese must be authored translations, not English copies. Reuse existing `ui.profileWizard.city`, `country`, `cityPlaceholder`, and `countryPlaceholder` for field labels/default placeholders.

- [ ] **Step 4: Replace the incomplete Profile raw location inputs**

In `app/customer/profile/page.tsx`, preserve Full Name and its error behavior, then render:

```tsx
<ProfileLocationFields
  city={city}
  country={country}
  onCityChange={(value) => { setCity(value); setIdentityError(null); }}
  onCountryChange={(value) => { setCountry(value); setIdentityError(null); }}
  invalid={Boolean(identityError)}
  disabled={identityBusy}
/>
```

Do not change `submitIdentity`, `identitySchema`, Continue behavior, progress, Phone/KYC cards, or Business banner.

- [ ] **Step 5: Replace the completed-Profile raw location inputs**

In `components/profile/profile-sections.tsx`, keep Full Name and Bio unchanged and replace only the paired raw City/Country inputs with the same controlled `ProfileLocationFields`. Preserve `savePersonal`, `identitySchema`, `/api/profile/identity`, `/api/profile/bio`, Cancel, and all other Profile sections.

- [ ] **Step 6: Run affected integration and i18n tests**

Run:

```bash
npx vitest run app/customer/profile/__tests__/profile-completion.test.ts components/profile/__tests__/profile-sections.test.ts components/profile/__tests__/profile-location-fields.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts lib/location/__tests__
npm run verify:i18n
npx tsc --noEmit
```

Expected: PASS; all three locales remain at 100% coverage and no API/backend file changes.

- [ ] **Step 7: Commit Task 4**

```bash
git add app/customer/profile/page.tsx app/customer/profile/__tests__/profile-completion.test.ts components/profile/profile-sections.tsx components/profile/__tests__/profile-sections.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts app/i18n/locales/en/customer.json app/i18n/locales/zh-CN/customer.json app/i18n/locales/ms/customer.json
git commit -m "feat: connect global city search to profile"
```

---

### Task 5: Browser QA, permission/privacy review, and release verification

**Files:**
- Modify only if a confirmed in-scope failure exists in Task 1–4 files.
- Modify: `Docs/plans/2026-08-30-1119-profile-city-autocomplete.md` for final evidence.
- Update ignored local `design-qa.md` and `.superpowers/sdd/design-qa/*` evidence without staging them.

**Interfaces:**
- Produces verified release evidence; no new runtime interface.

- [ ] **Step 1: Run one desktop and narrow browser flow in the in-app browser**

Verify:

1. `/customer/profile` retains the approved skeleton, Business banner, Phone/KYC cards, and four steps.
2. Country is searchable and defaults/preserves Malaysia.
3. Malaysia + `Kuala` or `吉隆坡` offers `Kuala Lumpur` when external Places configuration permits.
4. China + `广州` offers a China-scoped city when external Places configuration permits.
5. Changing Country clears the unsaved City.
6. Manual City entry and Continue remain usable when Google is unavailable.
7. Completed-Profile personal editing uses the same fields.
8. Keyboard navigation, Escape, focus, dark/light theme, and `390px` layout work without clipping or horizontal overflow.
9. Final console error log is empty or contains only classified pre-existing warnings.

If Places API (New) is not enabled for the configured key, record the external blocker and verify the manual fallback; do not weaken key security or introduce a server proxy.

- [ ] **Step 2: Perform the required focused `luna_worker` privacy/security review**

Inspect only: typed-query/PII exposure, API-key handling and restrictions, logging, session-token reuse, request cost controls, stale responses, manual fallback, and confirmation that no entitlement/backend/database boundary changed. One repair cycle and one focused re-review maximum for confirmed must-fix findings.

- [ ] **Step 3: Run final verification once after the final code change**

Run:

```bash
git diff --check
npm run lint
npx tsc --noEmit
npm run verify:i18n
npm test
```

Expected: all commands exit 0. Existing unrelated warnings may be recorded; no new warning is accepted in the owned file set. Do not rerun the broad suite unless a failed verification requires one bounded repair and one fresh run.

- [ ] **Step 4: Record evidence and commit the verified plan status**

Update this plan with test counts, browser evidence, external Google Cloud configuration status, review result, and any non-blocking follow-up. Stage only this task's owned files and plan, then commit:

```bash
git add -f Docs/plans/2026-08-30-1119-profile-city-autocomplete.md
git commit -m "test: verify profile city autocomplete"
```

## Risks

- Google configuration may not yet enable Places API (New); the product must remain usable through manual City entry.
- An unrestricted browser key can create financial exposure; production readiness requires referrer and API restrictions outside this repository.
- Multiple loader initialization paths can warn or fail after SPA navigation; the adapter must reuse `window.google.maps.importLibrary` when already loaded and configure the package only once otherwise.
- Session-token misuse can cause per-request billing; one token is reused only within one typing session and discarded after selection.
- Out-of-order results can display the wrong country; request generations and cleanup must default to current state only.
- Localized display names can conflict with canonical persistence; Country persists English canonical names while UI labels follow locale.
- Unknown legacy country text must be preserved until deliberate user selection.
- Country selection can accidentally clear hydrated City; only a user-initiated change clears City.
