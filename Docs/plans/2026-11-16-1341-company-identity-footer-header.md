# "Powered by MES EVENT MANAGEMENT" in the logo and footer

Status: implemented 2026-11-16 (uncommitted), superseding the decisions below. The user
supplied a new logo artwork with "Powered by MES EVENT MANAGEMENT" built in, and asked for the
footer to say only "Powered by MES EVENT MANAGEMENT" (no registration numbers). Done:

- `public/branding/mylawatan-logo-transparent.png` replaced (white background made transparent,
  same 758:306 canvas and content box as the old asset, 2x resolution); cache version bumped
  from `?v=3` to `?v=4` in the customer header, the shared logo, `next.config.ts` and the three
  branding tests. No `LogoPoweredBy` component and no header text line were needed.
- Footer: `common:brand.poweredBy` ("Powered by {{name}}", translated in ms and zh-CN) with
  `OPERATOR_NAME` from `lib/i18n/invariant-tokens.ts`, under the copyright in both variants.
- Known limit: at header size (79 to 118 px wide) the tagline inside the artwork is about
  2 to 3 px tall and not readable; the footer line is the readable attribution.

The original draft follows for the record.

## Context

The About page now states that MYLawatan is operated under MES EVENT MANAGEMENT
(KT0624597-M) in partnership with SCASHTEC SDN BHD (1334393-M). The user asked for the
same attribution in two more places, with a screenshot of each:

1. **Website logo (header):** `MYLAWATAN` with `Powered by MES EVENT MANAGEMENT`.
2. **Footer** ("Here also"): the current line is `© 2026 MYLawatan. All rights reserved.`

## Existing implementation (read-only inventory)

- **Customer header:** the `<nav>` in `app/customer/layout.tsx` (line ~209). The logo is an
  inline `next/image` of `/branding/mylawatan-logo-transparent.png?v=3`, 62 to 118 px wide
  depending on width, inside a fixed `h-17` row (68 px). The header measures itself
  (`components/customer/use-customer-header-layout.ts`): one row when links fit, otherwise two
  rows, and it publishes `--customer-header-h` for the home hero.
- **Shared logo:** `components/shared/mylawatan-logo.tsx` (`MyLawatanLogo`, `MyLawatanMark`).
  `MyLawatanLogo` is used by the guest layout, Help and legal layouts, login
  (`app/login/page.tsx`), reset-password, not-found and `components/shared/auth-page-shell.tsx`.
  The vendor and admin portal sidebars use only `MyLawatanMark` (the symbol, no wordmark).
- **Contract tests that pin the branding:** `app/customer/__tests__/customer-header-reference.contract.test.ts`
  (source must still contain the logo `src`, `width={758}`, `height={306}`, `h-17`, the
  header class strings and `gap-4` in the shared logo), `app/__tests__/branding.contract.test.ts`,
  `components/shared/__tests__/mylawatan-logo.test.ts`.
- **Footer:** `components/customer/customer-site-footer.tsx`, variants `full` and `slim`; both
  render the copyright from `common:brand.copyright`. Consumers: customer layout, Help and legal
  layouts, `auth-page-shell.tsx`, login. Test: `customer-site-footer.print.test.tsx`.
- **Brand constants:** `lib/i18n/invariant-tokens.ts` (`BRAND_NAME`, `LOGO_BRAND_NAME`, ...);
  locale-independent names live here, human-readable copy does not.
- **About page:** done (`legal.about.*`, `legal-article.tsx`, `app/legal/about/page.tsx`, new test).

Nothing else in the code mentions MES EVENT MANAGEMENT or SCASHTEC.

## Decisions

Answered by the user on 2026-11-16 unless marked open.

1. **Footer wording (decided: yes, include the details).** Read as "yes, also the registration
   number and SCASHTEC" (the question offered that as the alternative; confirm if the intent was
   the short line only). Footer, under the copyright:
   `Powered by MES EVENT MANAGEMENT (KT0624597-M) · In partnership with SCASHTEC SDN BHD (1334393-M)`.
   `Powered by` and `In partnership with` are translated (ms, zh-CN); the company names and
   registration numbers stay as written in every language. The logo line stays short:
   `Powered by MES EVENT MANAGEMENT`.
2. **Phones, header placement (open, elaborated).** The line is about 31 characters. At 10 px that
   is roughly 160 px, against a phone logo of 62 px (under 360 px wide), 84 px (360 to 419 px) or
   94 px (420 px and up), in a row that also holds currency (56 to 80 px) and the account
   icons, with only 8 px side padding. Options:
   - **A. Hide the line on phones (recommended).** It shows from `sm` (640 px) up. Phones still
     get it in the footer on every page. No risk to the header row, and `--customer-header-h`
     (the home hero height) is untouched. Cost: phone users do not see it at the top.
   - **B. Two short lines under the logo.** "Powered by" over "MES EVENT MANAGEMENT" still needs
     about 125 px at 9 px, wider than the logo, and about 100 px at 7 px, which is too small to
     read. Not viable without squeezing the controls next to it.
   - **C. Truncate with an ellipsis.** Cuts the company name ("MES EVENT MANA..."). Not
     recommended for a legal name.
   - **D. A thin strip under the header on phones.** Readable, but adds height to the sticky
     header, changes `--customer-header-h`, and shifts the home hero and every sticky offset
     that uses it. Needs its own check; recommended only if phone visibility at the top matters.
   These widths are estimates from the CSS, not measured: the header only renders for a signed-in
   or guest session, and I could not open one here. Implementation includes measuring at 360, 390
   and 430 px before settling on A.
3. **Where the logo line appears (decided: every page).** Read as every page that shows the logo
   wordmark: the customer header and everything using `MyLawatanLogo` (guest, Help, legal, login,
   reset-password, not-found, auth shell). The vendor and admin sidebars show only the 32 px
   symbol, so there is nothing to attach a line to. If "every page" also means those portals,
   say so; it would need a small line in the sidebar and a footer, which is a separate decision.
4. **Footer (decided: both variants).** The two-line block above under the copyright in `full`
   and `slim`, with the company line linked to `/legal/about`. On phones the slim footer
   (cart, checkout, login) wraps the line onto two rows.
5. **Out of scope, flagged.** Privacy and Terms pages do not name the operator and Terms still has
   the "prototype" section. A privacy notice normally names who runs the service. Recommend a
   separate plan.

## Reuse decisions (Reuse audit complete)

| Candidate | Path | Decision | Reason |
|---|---|---|---|
| Shared logo | `components/shared/mylawatan-logo.tsx` | Extend | Add one small `LogoPoweredBy` line component and an opt-in `poweredBy` prop on `MyLawatanLogo`; existing markup, `gap-4` and `data-brand-logo` unchanged |
| Customer header logo | inline `<Image>` in `app/customer/layout.tsx` | Extend in place | Switching it to `MyLawatanLogo` would change strings that the header contract tests pin; render `LogoPoweredBy` next to the existing image instead |
| Brand constants | `lib/i18n/invariant-tokens.ts` | Extend | Add `OPERATOR_NAME = "MES EVENT MANAGEMENT"` plus the registration numbers and partner name (Phase 3); identical in every locale, same as `BRAND_NAME` |
| Footer component | `components/customer/customer-site-footer.tsx` | Extend | One component serves all five consumers; reuse `LogoPoweredBy` or the same key |
| Copyright key | `common:brand.copyright` | Reuse unchanged | Existing text and tests keep working |
| Header layout hook | `use-customer-header-layout.ts` | Reuse unchanged | Already measures width; a wider logo block just flips to two rows earlier |
| Legal link row, header nav data | `legal-footer-links.tsx`, `header-navigation.ts` | Reuse unchanged | No link changes |
| About page content | `legal.about.company.*` | Reuse as source of truth | Registration numbers are not duplicated in code |
| New constants file or new context | none | Reject | Not justified for one string and one component |

New: `LogoPoweredBy` (inside the existing `mylawatan-logo.tsx`, so no new file). It has
two or more consumers (customer header, `MyLawatanLogo`, footer), which meets the shared-component rule.

## Phases

### Phase 1: constant, key and component (no visible change yet)

- `lib/i18n/invariant-tokens.ts`: add `OPERATOR_NAME`.
- `app/i18n/locales/{en,ms,zh-CN}/common.json`: add `brand.poweredBy` ("Powered by {{name}}").
  Malay and Chinese wording needs a native check before launch.
- `components/shared/mylawatan-logo.tsx`: add `LogoPoweredBy` (small muted text, no
  `defaultValue`, keyed translation) and the optional `poweredBy` prop on `MyLawatanLogo`.

### Phase 2: header and shared logo

- `app/customer/layout.tsx`: wrap the existing logo `<Image>` and `LogoPoweredBy` in a column
  inside the existing `<Link>`; keep every pinned class string, `src`, `width`, `height` and `h-17`.
  Hidden below `sm` unless decision 2 changes (option A is the default).
- Pass `poweredBy` from guest, Help, legal, login, reset-password, not-found and `auth-page-shell`.

### Phase 3: footer

- `invariant-tokens.ts`: also add `OPERATOR_REG_NO`, `PARTNER_NAME`, `PARTNER_REG_NO`
  (identical in every locale, like `BRAND_NAME`). `common.json`: add `brand.partnership`
  ("In partnership with {{name}}"). The About page text keeps its own copy (it is a translated
  paragraph), so the registration numbers exist in the tokens and in `legal.about.company.*`;
  a test asserts they match.
- `customer-site-footer.tsx`: add the two-line block under the copyright in `slim` and `full`,
  with the company line linked to `/legal/about`. Keep `print:hidden` and theme tokens.

### Phase 4: tests

- Extend `mylawatan-logo.test.ts` (new prop and component) and `customer-site-footer.print.test.tsx`
  (both variants show the line and link to `/legal/about`).
- Existing contract tests must pass unchanged. If one of them has to change, stop and ask.
- Register nothing new in the i18n inventory contract unless the new text is in a new file.

## Files

Modified: `lib/i18n/invariant-tokens.ts`, `app/i18n/locales/{en,ms,zh-CN}/common.json`,
`components/shared/mylawatan-logo.tsx`, `app/customer/layout.tsx`,
`components/customer/customer-site-footer.tsx`, the logo consumers listed in Phase 2,
`components/shared/__tests__/mylawatan-logo.test.ts`,
`components/customer/__tests__/customer-site-footer.print.test.tsx`.

New files: none. New dependencies: none. Database changes: none.

Not touched: vendor and admin sidebars, `header-navigation.ts`, the header layout hook, the
About page (already done), Privacy and Terms.

## Risks

- **Header width.** The 165 px line under the logo is wider than the 118 px logo, so the logo
  block grows and the header may switch to two rows at slightly wider screens. Check at 1280,
  1366 and 1440 px, and with Malay and Chinese labels, which are longer.
- **Header height.** The row is 68 px; the logo at 118 px wide is about 48 px tall, leaving about
  20 px for the line. Tight but workable; verify no clipping and that `--customer-header-h` (the
  home hero height) is unchanged.
- **Dark mode and the logo image.** The logo is a transparent PNG; the new text uses theme tokens.
- **Legal and trademark wording** is supplied by the user and used as given; not checked against a
  registry.
- **Translations** of "Powered by" are machine-written.

## Resource cost and lifecycle checks

Not applicable: static text in existing components. No new queries, network calls, writes,
uploads or stored files.

## Verification

- `npm run verify:i18n`, `npm run lint`, `npx tsc --noEmit`.
- Affected tests: the three branding contract tests, the logo test, the footer test.
- Browser check on localhost (en, ms, zh-CN; light and dark) of the customer header at phone,
  tablet and desktop widths, the footer on a customer page, login (slim) and a legal page.
