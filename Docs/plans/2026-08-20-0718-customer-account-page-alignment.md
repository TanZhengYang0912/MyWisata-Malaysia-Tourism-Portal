# Customer Account Page Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the title group on each requested customer account page align with MyWisata while its primary body aligns visually with Home, excluding My Vouchers.

**Architecture:** Add a shared `CustomerPageTitle` wrapper that places the existing `CustomerPageHeader` on the navigation's `max-w-7xl` grid. Keep body content in the existing `CustomerPageShell` (`max-w-5xl`) and remove only the duplicate top padding after the separate title.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, TailwindCSS, Vitest

## Global Constraints

- `/customer/vouchers` must remain unchanged.
- Do not change business logic, requests, translations, routing, permissions, or state behavior.
- Reuse `CustomerPageHeader` and `CustomerPageShell`; do not introduce a second page-layout system.
- No new dependencies.
- No database or migration changes.
- Preserve unrelated working-tree changes in authentication files, `output/`, and `tmp/`.

## File map

- Modify `components/customer/customer-page-shell.tsx`: own the shared title-grid primitive.
- Modify `app/customer/profile/page.tsx`: replace the local title wrapper with the shared primitive.
- Modify `app/customer/notifications/page.tsx`, `app/customer/preferences/page.tsx`, `app/customer/wallet/page.tsx`, `app/customer/kyc/page.tsx`, and `app/customer/support/page.tsx`: split standard account headers from bodies.
- Modify `app/customer/affiliate/page.tsx`, `app/customer/profile/register-vendor/page.tsx`, and `app/customer/recommendations/page.tsx`: split headers in their branch-specific layouts.
- Modify `app/customer/calendar/page.tsx` and `app/customer/orders/page.tsx`: use the same two-anchor layout for both Activity tabs.
- Modify `app/customer/profile/__tests__/profile-title-alignment.test.ts`: assert shared primitive usage.
- Create `app/customer/__tests__/account-page-alignment.test.ts`: cover the shared contract, every migrated destination, both Activity views, and the vouchers exclusion.

Files not being touched: `app/customer/vouchers/**`, account data hooks, API routes, authentication providers, translations, Supabase files, and database migrations.

---

### Task 1: Shared wide-title primitive and Profile migration

**Files:**
- Modify: `components/customer/customer-page-shell.tsx`
- Modify: `app/customer/profile/page.tsx`
- Modify: `app/customer/profile/__tests__/profile-title-alignment.test.ts`

**Interfaces:**
- Produces: `CustomerPageTitle(props: CustomerPageHeaderProps): ReactNode`
- Consumes: the existing `CustomerPageHeader` props and navigation-aligned Tailwind tokens.

- [ ] **Step 1: Update the Profile test so it expects the shared primitive**

```ts
expect(source).toContain("CustomerPageTitle");
expect(source).not.toContain("function ProfilePageTitle");
expect(source.match(/<CustomerPageTitle/g) ?? []).toHaveLength(2);
expect(source).toContain('<CustomerPageShell className="pt-0 pb-0 sm:pt-0">');
expect(source).toContain('<CustomerPageShell className="pt-0 sm:pt-0">');
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npx vitest run app/customer/profile/__tests__/profile-title-alignment.test.ts`

Expected: FAIL because `CustomerPageTitle` does not exist and Profile still declares `ProfilePageTitle`.

- [ ] **Step 3: Add the shared component**

In `components/customer/customer-page-shell.tsx`, extract the current header prop shape and add:

```tsx
type CustomerPageHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

const CUSTOMER_PAGE_TITLE_CLASS =
  "mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10";

export function CustomerPageTitle(props: CustomerPageHeaderProps) {
  return (
    <div className={CUSTOMER_PAGE_TITLE_CLASS}>
      <CustomerPageHeader {...props} />
    </div>
  );
}
```

Change `CustomerPageHeader` to consume `CustomerPageHeaderProps` without altering its markup.

- [ ] **Step 4: Replace Profile's local wrapper**

Import `CustomerPageTitle`, delete the local `ProfilePageTitle`, and replace the done-state call with:

```tsx
<CustomerPageTitle
  eyebrow={tCustomer("accountGroups.account")}
  title={tCustomer("ui.profileWizard.title")}
  description={tCustomer("ui.profileWizard.description")}
/>
```

Replace the incomplete-state call with:

```tsx
<CustomerPageTitle
  eyebrow={tCustomer("accountGroups.account")}
  title={tCustomer("ui.profileWizard.completeTitle")}
  description={tCustomer("ui.profileWizard.completeDescription")}
/>
```

Keep both existing body shells and their `pt-0` classes unchanged.

- [ ] **Step 5: Run the focused test**

Run: `npx vitest run app/customer/profile/__tests__/profile-title-alignment.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the shared primitive**

```bash
git add components/customer/customer-page-shell.tsx app/customer/profile/page.tsx app/customer/profile/__tests__/profile-title-alignment.test.ts
git commit -m "refactor: share customer page title alignment"
```

---

### Task 2: Standard account destinations

**Files:**
- Create: `app/customer/__tests__/account-page-alignment.test.ts`
- Modify: `app/customer/notifications/page.tsx`
- Modify: `app/customer/preferences/page.tsx`
- Modify: `app/customer/wallet/page.tsx`
- Modify: `app/customer/kyc/page.tsx`
- Modify: `app/customer/support/page.tsx`

**Interfaces:**
- Consumes: `CustomerPageTitle` and `CustomerPageShell` from Task 1.
- Produces: successful account-page states with a wide title and narrow body.

- [ ] **Step 1: Add a failing source-contract test**

Create a Vitest file that reads each page and verifies the split:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("customer account page alignment", () => {
  it.each([
    "../notifications/page.tsx",
    "../preferences/page.tsx",
    "../wallet/page.tsx",
    "../kyc/page.tsx",
    "../support/page.tsx",
  ])("splits the wide title from the narrow body in %s", (path) => {
    const source = page(path);
    expect(source).toContain("CustomerPageTitle");
    expect(source).toContain('CustomerPageShell className="pt-0 sm:pt-0"');
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run: `npx vitest run app/customer/__tests__/account-page-alignment.test.ts`

Expected: FAIL because these pages still place `CustomerPageHeader` inside `CustomerPageShell`.

- [ ] **Step 3: Split each successful page state**

For Notifications, Preferences, Wallet, KYC, and Support, import `CustomerPageTitle`, replace the outer `CustomerPageShell` with a fragment, change the header tag from `CustomerPageHeader` to `CustomerPageTitle`, then open `CustomerPageShell className="pt-0 sm:pt-0"` immediately after the title. For example, Notifications becomes:

```tsx
<>
  <CustomerPageTitle
    eyebrow={tCustomer("accountGroups.account", { defaultValue: "Account" })}
    title={tCommon("notifications.title", { defaultValue: "Notifications" })}
    description={tCustomer("ui.notifications.description", { defaultValue: "Updates about your bookings, wallet and account." })}
  />
  <CustomerPageShell className="pt-0 sm:pt-0">
    <NotificationCenter scope="customer" categories={translatedFilters} pageSize={15} />
  </CustomerPageShell>
</>
```

Use the already-present title props unchanged in the other four files. Keep loading, guest, and error branches unchanged and keep all siblings after the former header byte-for-byte inside the new body shell.

- [ ] **Step 4: Run the source-contract test**

Run: `npx vitest run app/customer/__tests__/account-page-alignment.test.ts`

Expected: PASS for all five page cases.

- [ ] **Step 5: Commit the standard account pages**

```bash
git add app/customer/__tests__/account-page-alignment.test.ts app/customer/notifications/page.tsx app/customer/preferences/page.tsx app/customer/wallet/page.tsx app/customer/kyc/page.tsx app/customer/support/page.tsx
git commit -m "fix: align customer account page titles"
```

---

### Task 3: Branch-specific account destinations

**Files:**
- Modify: `app/customer/__tests__/account-page-alignment.test.ts`
- Modify: `app/customer/affiliate/page.tsx`
- Modify: `app/customer/profile/register-vendor/page.tsx`
- Modify: `app/customer/recommendations/page.tsx`

**Interfaces:**
- Consumes: `CustomerPageTitle` and `CustomerPageShell`.
- Produces: wide titles for all successful branches while keeping cards/forms in the narrow body.

- [ ] **Step 1: Extend the failing test**

```ts
it.each([
  "../affiliate/page.tsx",
  "../profile/register-vendor/page.tsx",
  "../recommendations/page.tsx",
])("uses the shared title grid in %s", (path) => {
  const source = page(path);
  expect(source).toContain("CustomerPageTitle");
  expect(source).toContain('CustomerPageShell className="pt-0 sm:pt-0"');
});
```

For Register Vendor, add `expect(source.match(/<CustomerPageTitle/g) ?? []).toHaveLength(2);` so both application branches are covered.

- [ ] **Step 2: Run the test and confirm the new cases fail**

Run: `npx vitest run app/customer/__tests__/account-page-alignment.test.ts`

Expected: FAIL for Affiliate, Register Vendor, and Recommendations.

- [ ] **Step 3: Migrate Affiliate**

In the ineligible teaser branch, render this title before a narrow shell containing the current teaser:

```tsx
<CustomerPageTitle
  eyebrow="Community"
  title="Earn & Share"
  description="Share activities you love and earn commission when someone books through your link."
  icon={<Gift size={14} />}
/>
```

In the dashboard branch use the same structure with its current description, `Share local experiences you love and track the rewards generated through your referral link.`. In both branches wrap every sibling that previously followed the header in `CustomerPageShell className="pt-0 sm:pt-0"`. Leave loading, sign-in-required, and error-only branches unchanged.

- [ ] **Step 4: Migrate both Register Vendor branches**

For the existing-application branch, put this title before the narrow body:

```tsx
<CustomerPageTitle
  eyebrow={t("ui.profile.vendorApplication", { defaultValue: "Vendor application" })}
  title={vendor.name}
  description={t(`ui.profile.vendorStatus.${vendor.status}`, { defaultValue: status.description })}
  icon={<Store size={14} />}
/>
```

For the new-application branch use:

```tsx
<CustomerPageTitle
  eyebrow={t("ui.profile.vendorApplication", { defaultValue: "Vendor application" })}
  title={t("accountItems.becomeVendor.label")}
  description={t("ui.profile.vendorApplicationDescription", { defaultValue: "Apply to list your tours, food, stays, or local experiences. Admin approval is required before anything is visible to travellers." })}
  icon={<Store size={14} />}
  className="mb-6"
/>
```

Keep the back link, status panel, process panel, and form inside `CustomerPageShell className="pt-0 sm:pt-0"`; remove only the old headers from those bodies.

- [ ] **Step 5: Migrate Recommendations**

Move the current Recommendations header, including the existing Recommend button action, into `CustomerPageTitle`. Open `CustomerPageShell className="pt-0 sm:pt-0"` immediately after the title and keep the form, tabs, empty/list states, and modal triggers inside it. The title props remain exactly:

```tsx
<CustomerPageTitle
  eyebrow={tCustomer("ui.recommendations.community", { defaultValue: "Community" })}
  title={tCustomer("ui.recommendations.title", { defaultValue: "Recommend a Vendor" })}
  description={tCustomer("ui.recommendations.description", { defaultValue: "Know a great local experience that deserves to be on MyWisata? Nominate them here. Admin reviews it first, then the vendor can join or be linked before going live. You earn commission if they join through your recommendation." })}
  icon={<Star size={14} className="text-accent" />}
  actions={<Button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-2"><Plus size={15} aria-hidden="true" /> {tCustomer("ui.recommendations.recommend", { defaultValue: "Recommend" })}</Button>}
/>
```

- [ ] **Step 6: Run the focused test**

Run: `npx vitest run app/customer/__tests__/account-page-alignment.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the branch-specific pages**

```bash
git add app/customer/__tests__/account-page-alignment.test.ts app/customer/affiliate/page.tsx app/customer/profile/register-vendor/page.tsx app/customer/recommendations/page.tsx
git commit -m "fix: align secondary customer account pages"
```

---

### Task 4: Activity itinerary and orders

**Files:**
- Modify: `app/customer/__tests__/account-page-alignment.test.ts`
- Modify: `app/customer/calendar/page.tsx`
- Modify: `app/customer/orders/page.tsx`

**Interfaces:**
- Consumes: `CustomerPageTitle` and `CustomerPageShell`.
- Produces: identical title/body anchors for both Activity tabs.

- [ ] **Step 1: Add failing Activity and exclusion tests**

```ts
it.each(["../calendar/page.tsx", "../orders/page.tsx"])(
  "uses the shared two-anchor layout in %s",
  (path) => {
    const source = page(path);
    expect(source).toContain("CustomerPageTitle");
    expect(source).toContain('CustomerPageShell className="pt-0 sm:pt-0"');
  },
);

it("keeps My Vouchers outside the shared account title layout", () => {
  const source = page("../vouchers/voucher-hub-client.tsx");
  expect(source).not.toContain("CustomerPageTitle");
});
```

- [ ] **Step 2: Run the test and confirm the Activity cases fail**

Run: `npx vitest run app/customer/__tests__/account-page-alignment.test.ts`

Expected: FAIL for Calendar and Orders; the voucher exclusion passes.

- [ ] **Step 3: Split the Calendar title and body**

Replace the custom wide wrapper/header with:

```tsx
<CustomerPageTitle
  eyebrow={localizedViewCopy.eyebrow}
  title={localizedViewCopy.title}
  description={localizedViewCopy.description}
  icon={<CalendarDays size={14} />}
  className="mb-6"
/>
<CustomerPageShell className="pt-0 sm:pt-0">
  <section aria-label={tCustomer("ui.booking.calendar", { defaultValue: "Booking calendar" })} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
    {/* Keep the current calendar toolbar, filters, desktop grid, and mobile list unchanged here. */}
  </section>
</CustomerPageShell>
```

Keep the day drawer outside the body shell. Leave loading and guest branches unchanged.

- [ ] **Step 4: Split the Orders title and body**

Move the existing title, description, icon, and actions into:

```tsx
<CustomerPageTitle
  eyebrow={tCustomer("ui.labels.history")}
  title={tCustomer("ui.orders.title", { defaultValue: "Orders, all in one place." })}
  description={tCustomer("ui.orders.description", { defaultValue: "Receipts for every booking, meal and Malaysian experience you have collected." })}
  icon={<ReceiptText size={14} />}
  actions={<><Link href={activityHref("itinerary")}><Button variant="outline" className="rounded-full border-primary/20 text-primary hover:bg-secondary">{tCustomer("ui.calendar.viewItinerary")}</Button></Link><Link href="/customer"><Button className="rounded-full bg-primary px-5 hover:bg-primary/90">{tCustomer("ui.actions.continueExploring")}</Button></Link></>}
  className="mb-0"
/>
```

Wrap the summary, filters, errors, results, and pagination in `CustomerPageShell className="pt-0 sm:pt-0"` so the existing `mt-5` summary gap is preserved.

- [ ] **Step 5: Run both focused alignment tests**

Run: `npx vitest run app/customer/__tests__/account-page-alignment.test.ts app/customer/profile/__tests__/profile-title-alignment.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Activity alignment**

```bash
git add app/customer/__tests__/account-page-alignment.test.ts app/customer/calendar/page.tsx app/customer/orders/page.tsx
git commit -m "fix: align customer activity content"
```

---

### Task 5: Verification and visual comparison

**Files:**
- Verify only: all files changed in Tasks 1–4
- Do not modify: `app/customer/vouchers/**`

**Interfaces:**
- Consumes: the completed shared layout.
- Produces: test and visual evidence for handoff.

- [ ] **Step 1: Run affected tests**

Run: `npx vitest run app/customer/__tests__/account-page-alignment.test.ts app/customer/profile/__tests__/profile-title-alignment.test.ts`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 3: Run TypeScript**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 4: Re-capture the ten audited desktop states**

Use the already authenticated local browser session for Activity itinerary, Profile, Notifications, Preferences, Wallet, Verification, Support, Earn & Share, Become a Vendor, and Recommend a Vendor. Confirm:

```text
title.x == MyWisata.x (within 2px)
body inner content.x == Home.x (within 4px)
```

Also open My Vouchers and confirm its source and rendered layout were not migrated.

- [ ] **Step 5: Focused re-review**

Review only confirmed requirement violations: missing target route, title/body anchor mismatch, changed My Vouchers layout, or broken page rendering. Record polish-only observations as follow-up instead of starting another repair cycle.
