# Guest Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unauthenticated Guest Mode that can browse the public catalogue but cannot access account-owned actions.

**Architecture:** The login page clears the current Supabase browser session then navigates to a separate `/guest/*` route group. Guest pages use the existing server client and current public-read RLS policies. Guest-only components avoid the protected customer layout, cart, wishlist, chat, and wallet state.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript, Supabase SSR/RLS, Tailwind CSS, Vitest, Playwright.

## Global Constraints

- Work directly on `main`, as requested; do not create or merge a worktree.
- Do not change existing `/customer/*`, admin, checkout, wallet, recommendation, affiliate, or Supabase migration modules.
- Guest Mode is not a Supabase user, demo-user API result, database row, cart, wallet, or role.
- Guest pages display only data already permitted by public-read RLS policies.
- Booking and purchase CTAs go to `/login` with an encoded local return path and never call a protected mutation API.
- Preserve the existing untracked plan documents in `Docs/superpowers/plans/`.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/auth/guest-mode.ts` | Guest routes and safe sign-in return links. |
| `lib/auth/__tests__/guest-mode.test.ts` | Unit contracts for Guest Mode navigation. |
| `app/login/page.tsx` | Guest Mode quick entry that clears the browser session. |
| `app/guest/layout.tsx` | Guest Mode header with a Sign in link. |
| `app/guest/explore/page.tsx` | Server-side public catalogue fetch. |
| `components/guest/guest-catalogue.tsx` | Read-only cards, empty, and error states. |
| `app/guest/activity/[id]/page.tsx` | Public listing detail with sign-in-only CTA. |
| `app/guest/vendor/[vendorId]/page.tsx` | Approved vendor browse page. |
| `tests/e2e/guest-mode.spec.ts` | Browser proof of session exit, public browsing, and sign-in enforcement. |

### Task 1: Define Guest Mode navigation contracts

**Files:**
- Create: `lib/auth/guest-mode.ts`
- Test: `lib/auth/__tests__/guest-mode.test.ts`

**Interfaces produced:** `GUEST_EXPLORE_PATH: "/guest/explore"`, `guestLoginHref(returnPath: string): string`, `guestVendorHref(vendorId: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { GUEST_EXPLORE_PATH, guestLoginHref, guestVendorHref } from "@/lib/auth/guest-mode";

describe("Guest Mode navigation", () => {
  it("uses a dedicated public explore route", () => {
    expect(GUEST_EXPLORE_PATH).toBe("/guest/explore");
  });
  it("encodes a local listing return path", () => {
    expect(guestLoginHref("/guest/activity/a/b?slot=1")).toBe("/login?next=%2Fguest%2Factivity%2Fa%2Fb%3Fslot%3D1");
  });
  it("rejects an external return path", () => {
    expect(guestLoginHref("https://untrusted.example")).toBe("/login?next=%2Fguest%2Fexplore");
  });
  it("keeps vendor links in the guest route group", () => {
    expect(guestVendorHref("vendor/a")).toBe("/guest/vendor/vendor%2Fa");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run lib/auth/__tests__/guest-mode.test.ts`

Expected: FAIL with module-not-found for `@/lib/auth/guest-mode`.

- [ ] **Step 3: Write minimum implementation**

```ts
export const GUEST_EXPLORE_PATH = "/guest/explore";

export function guestLoginHref(returnPath: string): string {
  const safeReturnPath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : GUEST_EXPLORE_PATH;
  return `/login?next=${encodeURIComponent(safeReturnPath)}`;
}

export function guestVendorHref(vendorId: string): string {
  return `/guest/vendor/${encodeURIComponent(vendorId)}`;
}
```

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run lib/auth/__tests__/guest-mode.test.ts`

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

Run: `git add lib/auth/guest-mode.ts lib/auth/__tests__/guest-mode.test.ts && git commit -m "feat: add guest mode navigation contract"`

### Task 2: Add a session-clearing Guest Mode entry

**Files:**
- Modify: `app/login/page.tsx`
- Create: `tests/e2e/guest-mode.spec.ts`

**Consumes:** `GUEST_EXPLORE_PATH` and the existing browser `supabase` client.

**Produces:** A `Guest Mode` button that calls `signOut({ scope: "local" })` before routing.

- [ ] **Step 1: Write the failing browser test before the login entry or guest pages exist**

```ts
import { expect, test } from "@playwright/test";

test("Guest Mode signs out and booking requires sign-in", async ({ page }) => {
await page.goto("/login");
await page.getByRole("button", { name: /guest mode/i }).click();
await expect(page).toHaveURL(/\/guest\/explore$/);
await expect(page.getByText("Guest Mode")).toBeVisible();
const listing = page.getByRole("link", { name: /view listing/i }).first();
await expect(listing).toBeVisible();
await listing.click();
await page.getByRole("link", { name: /sign in to (book|purchase)/i }).click();
await expect(page).toHaveURL(/\/login\?next=%2Fguest%2Factivity%2F/);
});
```

- [ ] **Step 2: Run RED**

Run: `npx playwright test tests/e2e/guest-mode.spec.ts`

Expected: FAIL because the button and Guest Mode routes are absent.

- [ ] **Step 3: Add the handler and card**

Import `GUEST_EXPLORE_PATH`. In `LoginPage`, add:

```tsx
async function enterGuestMode() {
  resetFeedback();
  setBusy(true);
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  setBusy(false);
  if (signOutError) {
    setError("Unable to start Guest Mode. Please try again.");
    return;
  }
  router.replace(GUEST_EXPLORE_PATH);
  router.refresh();
}
```

Immediately before `Seeded demo accounts`, render a full-width button labelled `Guest Mode`, description `Browse vendors and listings without signing in`, and a `Guest` badge. Its `onClick` is `enterGuestMode` and `disabled` is `busy`.

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 5: Commit**

Run: `git add app/login/page.tsx tests/e2e/guest-mode.spec.ts && git commit -m "test: define guest mode browser flow"`

### Task 3: Build public catalogue and listing detail

**Files:**
- Create: `app/guest/layout.tsx`
- Create: `app/guest/explore/page.tsx`
- Create: `components/guest/guest-catalogue.tsx`
- Create: `app/guest/activity/[id]/page.tsx`
- Modify: `lib/auth/__tests__/guest-mode.test.ts`

**Consumes:** `searchActivities`, `getComputedActivity`, `getBookingSlots`, and `getProductReviews` from `backend/domains/catalogue`; `guestLoginHref`; `createClient` with public RLS.

**Produces:** Guest pages that do not import `useRequireRole`, cart, wishlist, chat, or wallet providers.

- [ ] **Step 1: Confirm the existing test suite remains GREEN before page implementation**

Run: `npx vitest run lib/auth/__tests__/guest-mode.test.ts`

Expected: 4 passing tests from Task 1, including the local sign-in return path contract consumed by the guest CTA.

- [ ] **Step 2: Implement layout and catalogue**

`app/guest/layout.tsx` renders only MyWisata branding, `Guest Mode`, and a `Sign in` link to `/login`. It imports no protected customer layout or provider.

`app/guest/explore/page.tsx` uses:

```tsx
const db = await createClient();
const activities = await searchActivities({ state: "All Malaysia", category: null }, db);
return <GuestCatalogue activities={activities} />;
```

Catch a catalogue read failure in the page and pass a non-sensitive error string to `GuestCatalogue`. The component renders `View listing` links to `/guest/activity/${activity.id}` and `View vendor` links using `guestVendorHref(activity.outlet.vendorId)`, no save/cart/purchase UI, a retry link to `/guest/explore`, and an empty state for no activities.

- [ ] **Step 3: Implement listing detail**

Use `getComputedActivity(id, undefined, db)` and `notFound()` for a missing listing. Render public activity facts, slots, and reviews. Its only action is:

```tsx
const label = activity.requiresBooking ? "Sign in to book" : "Sign in to purchase";
<Link href={guestLoginHref(`/guest/activity/${activity.id}`)}>{label}</Link>
```

Do not add a slot selector, cart mutation, checkout request, wishlist mutation, or protected API call.

- [ ] **Step 4: Verify focused checks**

Run: `npx vitest run lib/auth/__tests__/guest-mode.test.ts; npx tsc --noEmit; npm run lint -- app/guest components/guest app/login/page.tsx lib/auth/guest-mode.ts`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

Run: `git add app/guest components/guest lib/auth/__tests__/guest-mode.test.ts && git commit -m "feat: add public guest catalogue"`

### Task 4: Build approved vendor browse page

**Files:**
- Create: `app/guest/vendor/[vendorId]/page.tsx`
- Modify: `tests/e2e/guest-mode.spec.ts`

**Consumes:** `guestVendorHref` and existing public `vendors` / `outlets` policies.

**Produces:** A public approved-vendor page that does not use the customer layout.

- [ ] **Step 1: Extend the browser test with a failing approved-vendor browse scenario**

```ts
test("Guest Mode can open an approved vendor", async ({ page }) => {
  await page.goto("/guest/explore");
  const vendor = page.getByRole("link", { name: /view vendor/i }).first();
  await expect(vendor).toBeVisible();
  await vendor.click();
  await expect(page).toHaveURL(/\/guest\/vendor\//);
  await expect(page.getByRole("link", { name: /browse listings/i })).toBeVisible();
});
```

- [ ] **Step 2: Run RED**

Run: `npx playwright test tests/e2e/guest-mode.spec.ts`

Expected: the new vendor scenario FAILS because the guest vendor page is absent.

- [ ] **Step 3: Implement the page**

Using `createClient`, fetch `.eq("id", vendorId).eq("status", "approved")`, then its `.eq("vendor_id", vendorId).eq("status", "active")` outlets. Call `notFound()` if the vendor is missing or unapproved. Render vendor information, active outlet names, and a `Browse listings` link to `/guest/explore`. No management, booking, or purchase control is allowed.

- [ ] **Step 4: Verify focused checks**

Run: `npx vitest run lib/auth/__tests__/guest-mode.test.ts; npx tsc --noEmit; npm run lint -- app/guest/vendor/[vendorId]/page.tsx lib/auth/guest-mode.ts; npx playwright test tests/e2e/guest-mode.spec.ts`

Expected: every command exits 0.

- [ ] **Step 5: Commit**

Run: `git add app/guest/vendor/[vendorId]/page.tsx tests/e2e/guest-mode.spec.ts && git commit -m "feat: expose approved vendors in guest mode"`

### Task 5: Verify Guest Mode end-to-end

**Files:**
- Modify: `tests/e2e/guest-mode.spec.ts`

**Consumes:** The login entry and routes from Tasks 2–4.

**Produces:** Browser regression coverage for sign-out, public browse, and sign-in enforcement.

- [ ] **Step 1: Run the browser test that was intentionally RED in Task 2**

Run: `npx playwright test tests/e2e/guest-mode.spec.ts`

Expected: PASS after Tasks 2–4 provide the entry, public catalogue, listing detail, and login-only CTA.

- [ ] **Step 2: Make only required accessibility adjustments if the browser test identifies a missing accessible name**

Keep exact accessible text: `Guest Mode`, `View listing`, `Sign in to book`, and `Sign in to purchase`. Do not add test-only endpoints or bypass RLS.

- [ ] **Step 3: Re-run focused E2E GREEN**

Run: `npx playwright test tests/e2e/guest-mode.spec.ts`

Expected: 1 passing test against the local dev server and seeded catalogue.

- [ ] **Step 4: Run full verification**

Run: `npm test -- --run; npx tsc --noEmit; npm run lint; npx playwright test tests/e2e/guest-mode.spec.ts`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

Run: `git add tests/e2e/guest-mode.spec.ts && git commit -m "test: cover guest mode browsing"`

## Self-review

- Session clearing: Task 2 and E2E proof in Task 5.
- No guest identity: Task 2 only signs out and routes.
- Published Vendor and Listing browse: Tasks 3 and 4 reuse the existing public read layer.
- Protected actions: Task 3 has login-only CTA; Task 5 proves it in a browser.
- Customer, admin, wallet, checkout, recommendation, affiliate, and schema modules are explicitly excluded.
- Helper names and contracts are introduced before later tasks consume them; no placeholders remain.
