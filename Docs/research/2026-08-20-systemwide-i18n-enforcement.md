# System-wide i18n enforcement research

**Date:** 2026-08-20

**Question:** When a user selects Chinese or Malay, how do mature React/Next.js projects keep fixed system UI from silently falling back to English?
**Scope:** First-party source and documentation only. This note is research; it does not change application code.

## Executive conclusion

Option 2 (fix the shared runtime and audit the existing UI) and option 3 (AST/ESLint enforcement) solve different failure modes. Option 2 removes the current debt; option 3 prevents new hard-coded UI strings. Neither is sufficient alone:

| Layer | What it catches | What it cannot guarantee |
| --- | --- | --- |
| Shared runtime + page audit | Wrong namespace, wrong label key, English fallback, missing component wiring, existing hard-coded labels | That a future developer will not add another raw string |
| AST/ESLint lint | New JSX text, attributes, object labels, templates, and other source literals that look user-visible | That every locale file has the same keys, that a translation is non-empty, or that a runtime fallback will not show English |
| Locale parity/status check | Missing/extra keys, empty values, stale catalogs, placeholder/ICU shape errors | Raw strings that never enter the translation catalog |

The mature pattern is therefore **all three together**: migrate existing UI to translation calls, make non-English resources complete, make missing translations visible instead of English in non-English locales, and make extraction/lint/parity a required CI check. A hardcoded-string linter is an enforcement layer, not a replacement for the migration and catalog checks.

This directly addresses the user scenario: if a person cannot read English, showing an English fallback is a product failure. For MyWisata, a missing Chinese/Malay translation should be reported and should not silently resolve through fallback language English.

## What the mature ecosystems do

### 1. i18next / i18next-cli (closest to MyWisata)

**Official facts**

- The official i18next-cli analyzes JavaScript/TypeScript with an AST, extracts translation keys, can generate TypeScript definitions, synchronizes locales, reports translation status, and lints hard-coded strings. The project explicitly describes these as one integrated workflow. [i18next-cli README](https://github.com/i18next/i18next-cli#features)
- status exits non-zero when keys are missing; it checks the primary locale too, so a typo or an extraction omission is a failure rather than a silent runtime problem. [status command](https://github.com/i18next/i18next-cli#status-locale)
- lint treats user-facing strings in JSX elements/attributes as errors when they are not wrapped in t()/Trans. It also checks interpolation parameters and can make string-concatenation checks fail instead of merely warn. [lint command and checks](https://github.com/i18next/i18next-cli#lint)
- The CLI exposes CI-oriented checks: extract --ci fails when extraction would update files, types --ci fails when generated definitions are stale, and the README gives a GitHub Actions example. [CI/CD integration](https://github.com/i18next/i18next-cli#cicd-integration)
- The CLI's instrument migration is intentionally heuristic. Its documentation warns about false positives/negatives, dynamic strings, plurals, framework-specific patterns, and the need for manual review. This supports using instrumentation as a migration aid, not as the final guarantee. [instrument limitations](https://github.com/i18next/i18next-cli#limitations)
- i18next's fallback model can fall back across language variants, configured fallback languages, namespaces, and finally the key. Its documentation says production should explicitly configure an existing fallback language; it also documents using the key itself as a fallback. [fallback principles](https://www.i18next.com/principles/fallback.html) [translation resolution](https://www.i18next.com/principles/translation-resolution)

**Implication for MyWisata**

MyWisata already uses i18next/react-i18next and has a locale-resource parity check. The current provider sets fallback language English in [components/providers/i18n-provider.tsx](../../components/providers/i18n-provider.tsx), so a missing Chinese/Malay key can visibly become English. The existing [resource parity test](../../lib/i18n/__tests__/resources.test.ts) and [coverage script](../../scripts/verify-i18n-coverage.mjs) catch missing/extra keys and empty values, but they do not inspect source literals or prove that a runtime fallback cannot be English.

The practical i18next posture is:

1. Keep English as the authoring/source locale and keep all three locale namespaces in key parity.
2. For a non-English active locale, do not use English as a user-visible runtime fallback. Prefer complete resources plus fallbackLng false (or a non-English-safe missing marker) after the catalog is complete. Do not treat defaultValue with English text in a component as harmless; it is another English fallback path.
3. Use i18next-cli lint/project-specific ESLint rules to forbid new user-visible literals, and use status/the existing parity script in CI.
4. Keep a small explicit allowlist for product names, brand names, protocol values, CSS classes, IDs, URLs, and other non-copy strings; do not blanket-ignore all short English strings.

### 2. FormatJS / react-intl

**Official facts**

- FormatJS provides a dedicated ESLint rule, no-literal-string-in-jsx, because JSX text and accessibility attributes such as aria-label, placeholder, title, and alt are easy to forget. The rule reports literal JSX children and configured attributes. [FormatJS linter](https://formatjs.github.io/docs/tooling/linter/#no-literal-string-in-jsx)
- FormatJS also has no-literal-string-in-object, specifically covering option objects such as label: Chocolate. This is the same class of bug as a PREFERENCES array with English labels that bypasses t(). [object literal rule](https://formatjs.github.io/docs/tooling/linter/#no-literal-string-in-object)
- formatjs extract collects messages from source, and formatjs verify can check missing keys, extra keys, and structural equality against a source locale. Structural equality verifies that placeholders/message structure remain formattable. [FormatJS CLI extraction and verification](https://formatjs.github.io/docs/tooling/cli/#verification) [FormatJS CLI source](https://github.com/formatjs/formatjs/blob/main/crates/formatjs_cli/README.md#verify-command)
- In react-intl, a missing translation produces MISSING_TRANSLATION when there is no defaultMessage; the development guide also says the runtime is designed to fall back to defaultLocale when there are translation issues. [missing-translation behavior](https://formatjs.github.io/docs/guides/develop/#missing_translation)

**Implication**

FormatJS demonstrates why a JSX-only check is not enough: labels often live in arrays, option objects, accessibility props, table definitions, and other data structures. A strict MyWisata policy should lint both rendered JSX and user-visible fields in objects. It should also treat an English defaultValue/fallback as a deliberate exception requiring review, not as proof of localization.

### 3. Lingui + eslint-plugin-lingui

**Official facts**

- Lingui's official project combines a CLI that extracts, compiles, and validates messages with an ESLint plugin. It supports explicit message IDs as well as generated IDs and keeps rich-text messages connected to the source catalog. [Lingui repository](https://github.com/lingui/js-lingui#key-features)
- The official ESLint plugin recommends its normal rules but deliberately does not enable no-unlocalized-strings by default because every project needs a project-specific allowlist. The rule must be enabled and configured intentionally. [eslint-plugin-lingui README](https://github.com/lingui/eslint-plugin#flat-config-eslintconfigjs)
- no-unlocalized-strings targets string literals, template literals, and JSX text, then excludes project-defined non-copy values by attribute/property/variable/function rules. Its documentation explicitly calls out className, src, id, CSS helper calls, and other values that should not be translated. [rule documentation](https://github.com/lingui/eslint-plugin/blob/main/docs/rules/no-unlocalized-strings.md)

**Implication**

Lingui supplies a useful policy boundary: “all user-visible source strings must be localized” plus a narrowly documented allowlist for technical values and proper nouns. The allowlist should be reviewed like code, because an overly broad ignore list can recreate the original problem.

### 4. next-intl (Next.js ecosystem reference)

**Official facts**

- next-intl supports TypeScript augmentation for the supported locale union, message shape, and format names. Its message typing catches invalid message keys and can type-check interpolation arguments. [next-intl TypeScript workflow](https://github.com/amannn/next-intl/blob/main/docs/src/pages/docs/workflows/typescript.mdx)
- The official configuration guide recommends storing messages with the application and explains that the active locale affects useTranslations and formatting APIs. It also documents locale loading from a cookie/user setting when locale-based routing is not used. [next-intl configuration](https://github.com/amannn/next-intl/blob/main/docs/src/pages/docs/usage/configuration.mdx)

**Implication**

Type-safe translation keys prevent typos, but they do not find a raw button with Save that never calls a translation function. next-intl is evidence for adding typed message keys to the i18next setup, not for replacing source-literal lint or locale parity.

## Fallback and content boundary

### Fixed system UI

These must always use a translation key and exist in every supported locale:

- navigation labels, page titles, buttons, tabs, form labels, placeholders, validation errors, empty states, status badges, dialogs, tooltips, accessibility text, dates/numbers/currency formatting labels, and enum/status display labels;
- labels held in arrays or objects (label, title, description, emptyState, ariaLabel) are still fixed UI and must be translated at render time or created from a translation function;
- a stable business value such as pending_payment may be stored as a value, but its displayed label must resolve through status.pending_payment, not through an English label stored beside the value.

### User/content data

Names, email addresses, product names, outlet names, customer reviews, chat messages, vendor descriptions, and other values supplied by users or partners are data, not system UI. Mature source lints operate on source ASTs, so they do not and should not translate database values automatically. This is an inference from the scope of the i18next, FormatJS, and Lingui source-string rules; translating content would require separate multilingual fields or an explicit translation service.

Product/brand names and unavoidable technical tokens (MyWisata, Google, RM, order IDs, CSS classes, URLs) should be explicit allowlist entries or stored as data. They should not be used as a general excuse to keep English UI copy in source.

### Recommended failure behavior for this requirement

For the selected Chinese/Malay locale:

- missing key in CI: fail the build;
- missing key in development: show a conspicuous marker such as [missing:customer.actions.save] and log the namespace/key;
- missing key in production: do not silently use English. A key/marker is preferable to misleading English for this product requirement, with monitoring so it cannot remain unnoticed;
- English may remain the source locale, but only an explicit user choice of English should render English copy.

This is stricter than i18next's general-purpose fallback recommendation, but it follows the product requirement that non-English users must not receive English system UI.

## Recommended MyWisata combination

### Decision

Use option 2 **and** the enforcement half of option 3. Do not migrate from i18next merely to obtain these controls; the official i18next toolchain now covers extraction, types, status, lint, sync, and CI checks for this stack.

### Implementation shape

1. **Shared runtime contract**
   - Keep en, zh-CN, and ms as explicit supported locales.
   - Keep all namespaces (common, auth, customer, vendor, admin) in parity.
   - Remove English as a runtime fallback for active non-English locales, or replace it with a visible missing-key marker. Audit every defaultValue that contains English.
   - Keep a single locale source of truth for i18n.language, the server request locale, cookie/account preference, and Intl formatting.

2. **Source migration**
   - Replace hard-coded JSX text and object/array labels with translation keys.
   - Store enum values as stable identifiers and translate only at the UI boundary.
   - Translate accessibility attributes, placeholders, tooltips, table headings, toasts, error messages, and loading/empty states—not only page headings.
   - Preserve user/vendor-generated content as original data unless the product separately adds multilingual content.

3. **Static enforcement**
   - Add i18next-cli (or an equivalent project-specific ESLint rule) for JS/TS/JSX/TSX source scanning.
   - Configure accepted technical tags/attributes and a small allowlist for IDs, URLs, CSS classes, brand/proper names, and data values. Review every suppression.
   - Turn concatenation checks into errors and use interpolation keys for sentences; this prevents English word-order assumptions from leaking into other languages.

4. **Catalog enforcement**
   - Keep the existing parity/non-empty checks.
   - Add checks for missing and extra keys in every namespace and for placeholder/interpolation parity.
   - Add an explicit review/allowlist for values intentionally identical across languages; do not assume target equals en is always a bug because brands, currency codes, and proper nouns exist.

5. **CI gate**

   A practical gate is:

   npm run verify:i18n
   npx i18next-cli lint
   npx i18next-cli status
   npx i18next-cli extract --dry-run --ci
   npx i18next-cli types --ci
   npm run lint
   npx tsc --noEmit

   status, lint, and the existing parity script should be blocking checks. Extraction/type generation can be adopted after the current catalog format and key conventions are configured; the CLI's --ci modes are specifically documented for this purpose. [i18next-cli CI/CD](https://github.com/i18next/i18next-cli#cicd-integration)

6. **Runtime test matrix**
   - Render representative Customer, Vendor, Admin, auth, shared navigation, dialogs, and error states under each of en, zh-CN, and ms.
   - Assert that fixed UI contains no raw English fallback for zh-CN/ms; exclude explicit allowlist values.
   - Exercise locale switching, refresh, server render, authenticated routes, and a missing-key fixture so a future change cannot reintroduce English fallback silently.

## Bottom line for the current incident

The visible English is not evidence that language selection failed. It is evidence that the selected locale is incomplete at the source/runtime boundary: a hard-coded label, an incorrect key, an English defaultValue, or an English fallback language can each produce the same symptom. Mature projects handle this by combining migration, typed/key-parity catalogs, source-literal lint, and CI—not by relying on a single language switch or a single AST rule.
