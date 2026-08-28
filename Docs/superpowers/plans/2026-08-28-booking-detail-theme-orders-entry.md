# Booking Detail Theme and My Orders Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Booking Detail follow the active theme and expose the existing My Orders implementation from the customer account menu.

**Architecture:** Keep Booking Detail as the focused itinerary-entry view and `/customer/orders` as the single transaction-history implementation. Change only Booking Detail visual utilities and add one configuration-driven account-menu link with localized labels.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, TailwindCSS, i18next, Vitest

## Global Constraints

- Reuse `/customer/orders`; do not create another order list or detail page.
- Preserve Booking Detail data loading, refund handling, QR rendering, printing, layout, sizing, receipt navigation, and translations.
- Keep My Activity and checkout behavior unchanged.
- Add no dependencies and make no database or Supabase changes.

## File Map

- Modify `app/customer/bookings/[id]/page.tsx`: replace light-only utilities with semantic theme tokens.
- Modify `app/customer/bookings/__tests__/page.contract.test.ts`: lock the theme contract.
- Modify `lib/customer/header-navigation.ts`: add `/customer/orders` to the account menu.
- Modify `lib/customer/__tests__/header-navigation.test.ts`: lock the route and locale contract.
- Modify `app/i18n/locales/en/customer.json`, `app/i18n/locales/zh-CN/customer.json`, and `app/i18n/locales/ms/customer.json`: add localized account copy.

Files not touched: `app/customer/layout.tsx`, `app/customer/activity/page.tsx`, `app/customer/orders/**`, `app/customer/checkout/**`, backend domains, APIs, migrations, and Supabase configuration.

---

### Task 1: Theme Booking Detail

**Files:**
- Modify: `app/customer/bookings/[id]/page.tsx:89-130`
- Test: `app/customer/bookings/__tests__/page.contract.test.ts`

**Interfaces:**
- Consumes: `bg-card`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, and `border-border`.
- Produces: Unchanged `CustomerBookingDetailsPage` behavior with theme-aware colors.

- [ ] **Step 1: Write the failing theme contract**

Append inside the existing `describe` block:

```ts
it("uses semantic theme tokens instead of light-only receipt colors", () => {
  expect(pageSource).toContain("bg-card");
  expect(pageSource).toContain("bg-secondary/50");
  expect(pageSource).toContain("text-muted-foreground");
  expect(pageSource).toContain("border-border");
  for (const lightOnlyClass of [
    "bg-white",
    "bg-slate-50/70",
    "text-slate-500",
    "text-slate-400",
    "border-slate-100",
  ]) {
    expect(pageSource).not.toContain(lightOnlyClass);
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `npx vitest run app/customer/bookings/__tests__/page.contract.test.ts`.

Expected: FAIL because the listed light-only utilities still exist.

- [ ] **Step 3: Apply the minimal visual mapping**

```text
bg-white          -> bg-card
bg-slate-50/70    -> bg-secondary/50
text-slate-500    -> text-muted-foreground
text-slate-400    -> text-muted-foreground
border-slate-100  -> border-border
```

Keep JSX structure, handlers, links, props, and data calls unchanged.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `npx vitest run app/customer/bookings/__tests__/page.contract.test.ts`.

Expected: both Booking Detail contract tests PASS.

---

### Task 2: Reuse My Orders in the Account Menu

**Files:**
- Modify: `lib/customer/header-navigation.ts:41-48`
- Modify: `lib/customer/__tests__/header-navigation.test.ts:1-52`
- Modify: `app/i18n/locales/en/customer.json:22-100`
- Modify: `app/i18n/locales/zh-CN/customer.json:22-100`
- Modify: `app/i18n/locales/ms/customer.json:22-100`

**Interfaces:**
- Consumes: `ACCOUNT_MENU_GROUPS`, `ReceiptText`, the existing account-menu renderer, and `/customer/orders`.
- Produces: `accountItems.orders` opening the existing My Orders page in all supported languages.

- [ ] **Step 1: Write the failing route and localization contract**

Add these imports to `lib/customer/__tests__/header-navigation.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
```

Add `/customer/orders` immediately before `/customer/vouchers` in the expected routes, then append:

```ts
it("localizes the reused My Orders account entry", () => {
  const locales = {
    en: JSON.parse(readFileSync(resolve(process.cwd(), "app/i18n/locales/en/customer.json"), "utf8")),
    "zh-CN": JSON.parse(readFileSync(resolve(process.cwd(), "app/i18n/locales/zh-CN/customer.json"), "utf8")),
    ms: JSON.parse(readFileSync(resolve(process.cwd(), "app/i18n/locales/ms/customer.json"), "utf8")),
  };
  expect(locales.en.accountItems.orders).toEqual({ label: "My Orders", description: "Purchases, bookings and receipts" });
  expect(locales["zh-CN"].accountItems.orders).toEqual({ label: "我的订单", description: "购买、预订和收据" });
  expect(locales.ms.accountItems.orders).toEqual({ label: "Pesanan Saya", description: "Pembelian, tempahan dan resit" });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `npx vitest run lib/customer/__tests__/header-navigation.test.ts`.

Expected: FAIL because the account route and locale keys are absent.

- [ ] **Step 3: Add the account-menu item**

Insert first in Payments & verification:

```ts
{ href: "/customer/orders", label: "My Orders", labelKey: "accountItems.orders", description: "Purchases, bookings and receipts", icon: ReceiptText },
```

- [ ] **Step 4: Add all locale entries**

```json
// en
"orders": { "label": "My Orders", "description": "Purchases, bookings and receipts" }

// zh-CN
"orders": { "label": "我的订单", "description": "购买、预订和收据" }

// ms
"orders": { "label": "Pesanan Saya", "description": "Pembelian, tempahan dan resit" }
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run `npx vitest run lib/customer/__tests__/header-navigation.test.ts`.

Expected: all header-navigation tests PASS.

---

### Task 3: Final Verification and Commit

**Files:**
- Verify the seven implementation files in the File Map.

**Interfaces:**
- Consumes: Completed theme and account-menu changes.
- Produces: A verified commit with no duplicate order implementation.

- [ ] **Step 1: Run focused tests**

Run `npx vitest run app/customer/bookings/__tests__/page.contract.test.ts lib/customer/__tests__/header-navigation.test.ts`.

Expected: all focused tests PASS.

- [ ] **Step 2: Run TypeScript and lint**

Run `npx tsc --noEmit` and `npm run lint`.

Expected: TypeScript exits zero and lint has zero errors; existing unrelated warnings may remain.

- [ ] **Step 3: Run full verification**

Run `npx vitest run`, `git diff --check`, and `git diff --name-only`.

Expected: the full suite passes, no whitespace errors exist, and implementation changes are limited to the seven File Map files.

- [ ] **Step 4: Commit**

```bash
git add 'app/customer/bookings/[id]/page.tsx' app/customer/bookings/__tests__/page.contract.test.ts lib/customer/header-navigation.ts lib/customer/__tests__/header-navigation.test.ts app/i18n/locales/en/customer.json app/i18n/locales/zh-CN/customer.json app/i18n/locales/ms/customer.json
git commit -m "fix: theme booking details and expose orders"
```

## Dependencies, Database, and Risks

- New dependencies: none.
- Database changes and Supabase migrations: none.
- Risk: rewriting markup could alter Booking Detail behavior, so only class tokens may change.
- Risk: introducing a second Orders component would diverge from current behavior, so the menu must link to `/customer/orders`.
- Risk: missing a locale would show fallback English, so the focused test checks all three locales.
