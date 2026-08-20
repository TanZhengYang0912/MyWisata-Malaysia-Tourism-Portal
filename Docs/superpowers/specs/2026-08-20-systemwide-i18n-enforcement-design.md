# System-wide i18n enforcement design

**Date:** 2026-08-20

**Status:** Approved direction; awaiting written-spec review
**Product:** MyWisata Malaysia Tourism Portal

## Context

MyWisata already persists a selected locale and has translation resources for English (`en`), Simplified Chinese (`zh-CN`), and Malay (`ms`). However, changing the language does not currently guarantee that all fixed system UI changes with it. The Preferences page demonstrates three distinct failure modes:

1. option definitions contain valid translation keys but the component renders their English `label` fields;
2. customer navigation derives translation keys from URLs instead of using the existing explicit `labelKey`, so valid translated entries can fall through to English labels;
3. the runtime config allows English as a fallback, so missing non-English messages can silently appear in English.

The current locale-parity script and contract tests pass despite these defects. They verify resource structure and some translation usage, but they do not prove that every user-visible source string is translated or that the correct key is rendered.

Research into the official i18next, FormatJS, Lingui, next-intl, GitLab, Zulip, and Logseq practices supports a layered solution: migrate existing fixed UI, enforce catalog completeness, statically reject new hard-coded user-visible strings, and make missing translations visible instead of silently falling back to English. The supporting research is recorded in [the system-wide i18n enforcement research note](../../research/2026-08-20-systemwide-i18n-enforcement.md).

## Product contract

When a user selects a supported language, the entire fixed system interface must use that language:

- selecting English renders English system UI;
- selecting Simplified Chinese renders Simplified Chinese system UI;
- selecting Malay renders Malay system UI;
- refreshes, authentication transitions, and role changes preserve the selected locale;
- a non-English locale must never silently substitute English fixed UI.

The contract applies across Customer, Vendor/Outlet, Admin, authentication, guest, and shared experiences. It includes navigation, headings, buttons, tabs, form copy, placeholders, validation, status labels, dialogs, toasts, errors, loading and empty states, tooltips, accessibility labels, and fixed option/enum labels.

The contract does not translate user or partner content automatically. Personal names, emails, messages, reviews, outlet/product names, vendor descriptions, and other database-provided content remain in their authored language unless a separate multilingual-content feature is introduced.

## Goals

1. Repair the known Preferences and customer-navigation defects.
2. Migrate remaining fixed system UI in all product surfaces to translation keys.
3. Keep `en`, `zh-CN`, and `ms` resources complete and structurally equivalent.
4. Remove English as a silent runtime fallback for an active Chinese or Malay locale.
5. Prevent future hard-coded user-facing copy through AST-based source linting and CI checks.
6. Keep dates, numbers, and currencies formatted with the active locale.
7. Preserve the current i18next architecture, locale persistence, design, permissions, and business behavior.

## Non-goals

- Automatically translating user-generated or vendor-generated content.
- Adding multilingual database columns, translation APIs, or machine translation.
- Replacing i18next/react-i18next with another localization framework.
- Redesigning layouts or changing visual styling.
- Refactoring authentication, authorization, navigation structure, or business logic beyond the label/key corrections required here.
- Introducing a translation-management SaaS.

## Design decisions

### 1. Keep one locale source of truth

The existing supported-locale model, cookie/account persistence, and i18next provider remain the source of truth. Client translation hooks and `Intl` formatters must consume the same normalized locale. A language change must update the current session immediately and remain selected after refresh and sign-in transitions.

### 2. Fixed UI always resolves from keys

Every fixed user-visible string must resolve through `t()`/`Trans` or an equivalent translation boundary. Data structures may contain stable values and `labelKey` fields, but a component must not render an English `label` as fixed UI.

Examples:

- preference option: store `value: "food"` and `labelKey: "preferences.interests.food"`, then render `t(labelKey)`;
- navigation item: render the declared `item.labelKey`, not a key inferred from its URL;
- status: store a stable value such as `pending_payment`, then render its localized status key;
- interpolation: translate a complete sentence/message with variables instead of concatenating English fragments.

English `defaultValue` strings are not permitted as routine fallbacks for fixed UI. A missing key is a localization defect, not an invitation to display English to a non-English user.

### 3. No cross-language English fallback

After all three catalogs are complete, runtime language fallback is disabled for fixed UI (`fallbackLng: false` or the equivalent project configuration). Namespace resolution may still use an explicitly configured same-locale shared namespace, but it must not cross from Chinese or Malay into English.

Failure behavior is deliberate:

- CI fails for missing, extra, empty, or structurally incompatible messages;
- development exposes and logs the missing namespace/key;
- production never silently substitutes English for a selected non-English locale.

English remains the authoring/source locale and is shown normally when the user explicitly selects English.

### 4. Combine migration with static enforcement

The implementation combines two necessary controls:

- **existing-debt migration:** audit and convert current fixed UI across Customer, Vendor/Outlet, Admin, Auth/Guest, and Shared surfaces;
- **future enforcement:** add the official i18next AST tooling, or a project-equivalent AST lint configuration if an integration constraint is confirmed, to reject new hard-coded user-visible strings.

The source lint must cover JSX children, relevant JSX attributes (`placeholder`, `title`, `alt`, `aria-label`, and similar), template literals, and user-visible object fields such as `label`, `title`, and `description`. It must treat string concatenation as an error where interpolation should be used.

The allowlist is narrow and reviewable. Acceptable exceptions include product/brand names such as MyWisata and Google, currency codes such as RM, URLs, IDs, CSS values, protocol values, and test fixtures. Broad directory or short-string exemptions are not acceptable because they would hide the same class of defect.

### 5. Catalogs and types are build artifacts with checks

The existing resource-parity and non-empty validation remains. The i18next toolchain is added as a development-only dependency and configured for the current namespace/file layout. Blocking checks cover:

- source-string linting;
- missing and extra keys in every supported locale/namespace;
- empty values;
- interpolation/placeholder compatibility;
- stale extraction or generated translation types where supported by the final configuration.

The checks are exposed through one project script (for example, `npm run verify:i18n`) and included in the repository's existing CI/lint workflow. No production runtime dependency is introduced solely for enforcement.

### 6. Role-by-role source inventory

Migration follows the existing role inventories and architecture rather than creating a second navigation or page registry. The audit covers:

- Customer and public/guest routes;
- Vendor and outlet routes;
- Admin routes;
- sign-in, registration, callbacks, password and account flows;
- shared headers, menus, dialogs, forms, notifications, errors, loading states, and empty states.

`My Vouchers` is excluded only from the earlier page-alignment/layout request. It is **not** excluded from this system-wide language contract and must localize like every other reachable page.

### 7. API and error boundaries

Raw English server error text must not become the visible UI fallback. Where an API error is surfaced to a user, the client maps a stable error code/state to a localized message. Unknown operational details remain log data; the user receives a translated generic error. This design does not require translating arbitrary third-party messages or altering authorization behavior.

### 8. Locale-aware formatting

Dates, times, numbers, and currencies use the existing shared localization formatter with the active locale. Fixed English date/month names or manually concatenated currency/date text are treated as localization defects.

## Implementation boundaries

### Expected areas to change

- i18next provider/configuration and localization utilities;
- preference option rendering and customer navigation binding;
- locale JSON catalogs for all five current namespaces;
- fixed UI components/pages identified by the source audit;
- i18n verification scripts, AST-lint configuration, package scripts/lockfile, and relevant CI configuration;
- focused contract/unit tests and representative locale-switch browser tests.

The exact file list is deferred to the implementation plan after the written design is accepted; it will be produced from a complete source inventory so the change does not rely on guessed paths.

### Areas not to change

- database schema, migrations, or stored user/vendor content;
- unrelated visual layout and styling;
- authentication role/permission behavior;
- unrelated business logic;
- generated local files under `output/` or `tmp/`.

## Testing strategy

Implementation follows test-driven development for each confirmed defect and enforcement layer.

1. Add failing focused tests proving preference options render their `labelKey`, navigation uses the declared key, My Vouchers is localized, and non-English runtime configuration cannot fall back to English.
2. Add/extend catalog tests for key parity, non-empty values, and interpolation compatibility.
3. Configure AST lint with a small explicit allowlist and prove that representative hard-coded JSX, attributes, and label objects fail while technical constants pass.
4. Migrate one role surface at a time until the source lint and catalogs pass.
5. Run representative route tests for Customer, Vendor/Outlet, Admin, Auth/Guest, and Shared UI under `en`, `zh-CN`, and `ms`.
6. Exercise language switching, refresh/persistence, and authenticated navigation.
7. Visually verify the reported Preferences page in Chinese and Malay, including options below the title.

Final verification runs the affected tests, the complete i18n gate, `npm run lint`, and `npx tsc --noEmit`. The project-wide test suite runs once after the final code change unless a failure requires a focused correction and rerun.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| AST lint flags technical literals or test data | Use a narrow, documented allowlist and line-level suppressions that require review. |
| An overly broad exception lets English UI return | Reject directory-wide/short-string exemptions and include violation fixtures in tests. |
| Disabling fallback exposes a missed key | Complete catalogs first, make parity/status blocking, and expose missing keys during development. |
| Same English word is valid in another locale | Permit intentional identical values through an explicit reviewed exception; do not automatically reject equality. |
| Large migration causes unrelated refactors | Work role-by-role, change translation boundaries only, and preserve layout/business code. |
| Server errors leak English | Present stable localized error states and keep raw operational messages in logs. |
| Locale persistence differs between client and server | Test switch, refresh, callback, and authenticated route transitions from the same normalized locale source. |

## Acceptance criteria

The work is complete when:

1. Switching among English, Simplified Chinese, and Malay updates all fixed system UI across every reachable role surface.
2. The reported Preferences screen contains no English fixed option/status/action text when Chinese or Malay is selected, apart from explicitly allowed brands or data.
3. Navigation and option collections render explicit translation keys instead of URL-derived or English label fallbacks.
4. A missing Chinese/Malay message cannot silently resolve to English at runtime.
5. Locale choice survives refresh and authentication transitions.
6. All locale namespaces remain in parity and pass non-empty/interpolation validation.
7. New hard-coded user-facing JSX, attributes, template strings, or label-object copy fails the i18n verification gate.
8. User/vendor-authored content remains unchanged.
9. Lint, TypeScript, affected tests, representative language-switch tests, and the system-wide i18n gate pass.
