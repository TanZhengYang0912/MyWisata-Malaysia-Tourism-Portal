# Shared Customer and Guest Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/customer` the canonical interface for Guest and registered users, render safe anonymous empty states for account pages, and gate mutations with the approved five-level verification model.

**Architecture:** Replace the whole-layout login redirect with an optional Customer viewer, centralize capability decisions in a pure policy module, and keep all private API/RLS/database guards intact. Public pages remain fully functional; account pages choose a Guest empty state before any private request; gated actions preserve a validated `next` path through login or verification.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase Auth/RLS, Vitest, Playwright, TailwindCSS.

## Global Constraints

- `/customer` is the canonical Guest and Customer route family; `/guest/*` becomes redirect-only compatibility.
- Guest has no fabricated user, wallet, cart, order, withdrawal, notification, or chat row.
- Guest account pages render zero/empty presentation before any user-owned request.
- Guest cannot Booking, Purchase, Submit Recommendation, Generate Affiliate Link, or Withdraw Money.
- Email Verified can browse and build a cart but cannot complete Checkout.
- Phone Verified can Booking, Purchase, Checkout, and use basic AI Recommendation.
- Profile Complete can Submit Recommendation and Generate Limited Affiliate Link.
- KYC Verified can use the full Affiliate tier, earn commission, and Request Withdrawal; Admin Approval remains required.
- API authentication, Supabase RLS, checkout phone gates, recommendation/profile gates, affiliate gates, and withdrawal/KYC gates must not be weakened.
- Missing or failed Listing images render a visible fallback, never an empty media rectangle.
- No new runtime dependencies.
- No database migration or seed-data rewrite in this plan.

## Implementation Map

### New focused units

- `lib/auth/customer-capabilities.ts`: pure capability-to-tier policy and safe continuation destinations.
- `components/customer/use-customer-capability-gate.ts`: client navigation hook that applies the pure policy to the current viewer.
- `components/customer/guest-account-empty-state.tsx`: consistent Customer-shaped Guest empty state with Sign in/Create account actions.
- `components/shared/resilient-image.tsx`: client-side image failure fallback shared by public detail/vendor surfaces.

### Existing units changed

- Customer shell and identity: `app/customer/layout.tsx`, `app/login/page.tsx`, `lib/auth/guest-mode.ts`.
- Anonymous-safe providers: Cart, Wishlist, Saved Destinations, Trip, Notification Bell/Center.
- Public actions: homepage save, activity save/cart/chat, outlet chat, vendor/detail images.
- Account pages: Cart, Saved, Orders, Activity/Calendar, Chat, Notifications, Support, Wallet, Profile, Preferences, KYC, Recommendations, Affiliate, Checkout, and direct private detail routes.
- Compatibility routes: all current files under `app/guest/`.
- Browser coverage: `tests/e2e/guest-mode.spec.ts` plus a tier-focused flow.

### Files explicitly not touched

- Vendor and Admin layouts/pages.
- Stripe webhook, Connect onboarding, payout execution, and Admin withdrawal approval.
- Supabase migrations, RLS policies, KYC storage, wallet accounting, and commission rates.
- Public catalogue seed media; missing real photography remains a separate content task.

---

### Task 1: Define the Customer Capability Policy

**Files:**
- Create: `lib/auth/customer-capabilities.ts`
- Create: `lib/auth/__tests__/customer-capabilities.test.ts`
- Modify: `lib/constants.ts`
- Modify: `lib/auth/guest-mode.ts`
- Modify: `lib/auth/__tests__/guest-mode.test.ts`

**Interfaces:**
- Consumes: `Tier`, `REQUIRED_TIER`, `meetsMinTier()`, `postLoginPath()`, and `guestLoginHref()`.
- Produces:
  - `CUSTOMER_CAPABILITY`
  - `CustomerCapability`
  - `CustomerAccessDecision`
  - `resolveCustomerAccess(viewer, capability)`
  - `customerAccessHref(decision, nextPath)`

- [ ] **Step 1: Write the failing capability matrix test**

```ts
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CAPABILITY,
  customerAccessHref,
  resolveCustomerAccess,
} from "@/lib/auth/customer-capabilities";

const viewer = (verificationTier: string) => ({ verificationTier });

describe("customer capability policy", () => {
  it.each([
    [null, CUSTOMER_CAPABILITY.BROWSE, "allowed"],
    [null, CUSTOMER_CAPABILITY.ACCOUNT_MUTATION, "sign_in_required"],
    [viewer("email_verified"), CUSTOMER_CAPABILITY.CART_MUTATION, "allowed"],
    [viewer("email_verified"), CUSTOMER_CAPABILITY.CHECKOUT, "phone_verification_required"],
    [viewer("phone_verified"), CUSTOMER_CAPABILITY.CHECKOUT, "allowed"],
    [viewer("phone_verified"), CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT, "profile_completion_required"],
    [viewer("profile_complete"), CUSTOMER_CAPABILITY.AFFILIATE_LIMITED, "allowed"],
    [viewer("profile_complete"), CUSTOMER_CAPABILITY.WITHDRAWAL, "kyc_required"],
    [viewer("kyc_verified"), CUSTOMER_CAPABILITY.WITHDRAWAL, "allowed"],
  ])("resolves %o / %s", (currentViewer, capability, expected) => {
    expect(resolveCustomerAccess(currentViewer, capability)).toBe(expected);
  });

  it("preserves only a safe local continuation", () => {
    expect(customerAccessHref("sign_in_required", "/customer/activity/p1?slot=s1"))
      .toBe("/login?next=%2Fcustomer%2Factivity%2Fp1%3Fslot%3Ds1");
    expect(customerAccessHref("phone_verification_required", "https://evil.example"))
      .toBe("/customer/profile?next=%2Fcustomer");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run lib/auth/__tests__/customer-capabilities.test.ts`

Expected: FAIL because `@/lib/auth/customer-capabilities` does not exist.

- [ ] **Step 3: Add exact capability constants and policy**

Add `BASIC_AI: 'phone_verified'` to `REQUIRED_TIER`, then create:

```ts
import { meetsMinTier, REQUIRED_TIER } from "@/lib/constants";
import { guestLoginHref, postLoginPath } from "@/lib/auth/guest-mode";

export const CUSTOMER_CAPABILITY = {
  BROWSE: "browse",
  ACCOUNT_MUTATION: "account_mutation",
  CART_MUTATION: "cart_mutation",
  CHECKOUT: "checkout",
  BASIC_AI: "basic_ai",
  RECOMMENDATION_SUBMIT: "recommendation_submit",
  AFFILIATE_LIMITED: "affiliate_limited",
  AFFILIATE_FULL: "affiliate_full",
  WITHDRAWAL: "withdrawal",
} as const;

export type CustomerCapability = typeof CUSTOMER_CAPABILITY[keyof typeof CUSTOMER_CAPABILITY];
export type CustomerAccessDecision =
  | "allowed"
  | "sign_in_required"
  | "phone_verification_required"
  | "profile_completion_required"
  | "kyc_required";

type Viewer = { verificationTier: string } | null;

export function resolveCustomerAccess(viewer: Viewer, capability: CustomerCapability): CustomerAccessDecision {
  if (capability === CUSTOMER_CAPABILITY.BROWSE) return "allowed";
  if (!viewer) return "sign_in_required";
  if (capability === CUSTOMER_CAPABILITY.ACCOUNT_MUTATION || capability === CUSTOMER_CAPABILITY.CART_MUTATION) return "allowed";
  if (capability === CUSTOMER_CAPABILITY.CHECKOUT || capability === CUSTOMER_CAPABILITY.BASIC_AI) {
    const required = capability === CUSTOMER_CAPABILITY.BASIC_AI ? REQUIRED_TIER.BASIC_AI : REQUIRED_TIER.CHECKOUT;
    return meetsMinTier(viewer.verificationTier, required) ? "allowed" : "phone_verification_required";
  }
  if (capability === CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT || capability === CUSTOMER_CAPABILITY.AFFILIATE_LIMITED) {
    return meetsMinTier(viewer.verificationTier, REQUIRED_TIER.RECOMMENDATION) ? "allowed" : "profile_completion_required";
  }
  const required = capability === CUSTOMER_CAPABILITY.AFFILIATE_FULL
    ? REQUIRED_TIER.AFFILIATE_FULL
    : REQUIRED_TIER.WITHDRAWAL;
  return meetsMinTier(viewer.verificationTier, required) ? "allowed" : "kyc_required";
}

export function customerAccessHref(decision: Exclude<CustomerAccessDecision, "allowed">, nextPath: string): string {
  const safeNext = postLoginPath(nextPath) ?? "/customer";
  if (decision === "sign_in_required") return guestLoginHref(safeNext);
  if (decision === "kyc_required") return `/customer/kyc?next=${encodeURIComponent(safeNext)}`;
  return `/customer/profile?next=${encodeURIComponent(safeNext)}`;
}
```

Change `GUEST_EXPLORE_PATH` to `/customer`; keep unsafe return paths falling back there.
Change `guestVendorHref(vendorId)` to return the canonical
`/customer/vendor/${encodeURIComponent(vendorId)}` path. This also makes
affiliate redirects land directly on the shared Customer experience instead
of taking an avoidable `/guest/*` redirect hop. Update the existing Guest-mode
tests for both constants.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run lib/auth/__tests__/customer-capabilities.test.ts lib/auth/__tests__/guest-mode.test.ts`

Expected: both files pass; unsafe URLs resolve to `/customer`.

- [ ] **Step 5: Commit only Task 1**

```bash
git add lib/constants.ts lib/auth/customer-capabilities.ts lib/auth/guest-mode.ts lib/auth/__tests__/customer-capabilities.test.ts lib/auth/__tests__/guest-mode.test.ts
git commit -m "feat: define customer capability gates"
```

---

### Task 2: Add the Shared Gate Hook and Guest Empty State

**Files:**
- Create: `components/customer/use-customer-capability-gate.ts`
- Create: `components/customer/guest-account-empty-state.tsx`
- Create: `components/customer/__tests__/guest-access-components.test.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: Task 1 policy and existing `useAuth()`.
- Produces:
  - `useCustomerCapabilityGate(): (capability, nextPath?) => boolean`
  - `GuestAccountEmptyState({ title, description, nextPath, value? })`

- [ ] **Step 1: Write failing component contract tests**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("guest access components", () => {
  const gate = readFileSync(new URL("../use-customer-capability-gate.ts", import.meta.url), "utf8");
  const empty = readFileSync(new URL("../guest-account-empty-state.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../../../app/login/page.tsx", import.meta.url), "utf8");

  it("routes blocked actions through the central policy", () => {
    expect(gate).toContain("resolveCustomerAccess");
    expect(gate).toContain("customerAccessHref");
    expect(gate).toContain("return false");
  });

  it("offers both sign in and registration with a continuation", () => {
    expect(empty).toContain("Sign in");
    expect(empty).toContain("Create account");
    expect(empty).toContain("mode=signup");
    expect(login).toContain('searchParams.get("mode") === "signup"');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run components/customer/__tests__/guest-access-components.test.tsx`

Expected: FAIL because the two component files do not exist.

- [ ] **Step 3: Implement the navigation hook**

```ts
"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import {
  customerAccessHref,
  resolveCustomerAccess,
  type CustomerCapability,
} from "@/lib/auth/customer-capabilities";

export function useCustomerCapabilityGate() {
  const { currentUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return useCallback((capability: CustomerCapability, nextPath?: string) => {
    const decision = resolveCustomerAccess(currentUser, capability);
    if (decision === "allowed") return true;
    const currentPath = `${pathname}${typeof window === "undefined" ? "" : window.location.search}`;
    router.push(customerAccessHref(decision, nextPath ?? currentPath));
    return false;
  }, [currentUser, pathname, router]);
}
```

- [ ] **Step 4: Implement the shared Guest empty state and login mode**

`GuestAccountEmptyState` must render through the existing `EmptyState`, show optional zero text, and create:

```tsx
const signInHref = guestLoginHref(nextPath);
const createHref = `${signInHref}&mode=signup`;
```

The login page reads `mode=signup` inside its initial query-string effect and calls `setMode("signup")`. It must retain the existing `next` parsing for sign-in, sign-up, email verification, demo accounts, and Google OAuth.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run components/customer/__tests__/guest-access-components.test.tsx lib/auth/__tests__/guest-mode.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit only Task 2**

```bash
git add components/customer/use-customer-capability-gate.ts components/customer/guest-account-empty-state.tsx components/customer/__tests__/guest-access-components.test.tsx app/login/page.tsx
git commit -m "feat: add guest capability navigation"
```

---

### Task 3: Make the Customer Shell and Providers Anonymous-Safe

**Files:**
- Modify: `app/customer/layout.tsx`
- Modify: `components/providers/cart.tsx`
- Modify: `components/providers/wishlist.tsx`
- Modify: `components/providers/saved-destinations.tsx`
- Modify: `components/providers/trip.tsx`
- Modify: `components/shared/notification-bell.tsx`
- Modify: `components/shared/notification-center.tsx`
- Create: `app/customer/__tests__/guest-layout.contract.test.ts`
- Create: `components/providers/__tests__/anonymous-customer-providers.test.ts`

**Interfaces:**
- Consumes: `useAuth()`, `guestLoginHref()`, and Task 2 Guest UI.
- Produces: one Customer shell with authenticated and Guest identity states; provider state that is empty and request-free after sign-out.

- [ ] **Step 1: Write failing source-contract tests**

The layout test must assert:

```ts
expect(layout).toContain("useAuth");
expect(layout).not.toContain('useRequireRole(["customer"])');
expect(layout).toContain("Guest");
expect(layout).toContain("Create account");
expect(layout).toContain("enabled={Boolean(currentUser)}");
```

The provider test must assert that Wishlist and Saved Destinations both depend on `currentUser?.id`, clear their sets when signed out, and do not call their APIs before that guard. It must also assert that Trip storage hydration is conditional on `currentUser` and Cart clears `items` plus `selectedKeys` when signed out.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npx vitest run app/customer/__tests__/guest-layout.contract.test.ts components/providers/__tests__/anonymous-customer-providers.test.ts`

Expected: FAIL because layout still uses `useRequireRole` and providers hydrate anonymous APIs/storage.

- [ ] **Step 3: Replace the whole-layout redirect with optional viewer logic**

Use `useAuth()` in `CustomerLayoutInner`. While `loading`, keep the current loading screen. When `currentUser` is null, render the same navigation and children with:

```tsx
<NotificationBell enabled={Boolean(currentUser)} />
```

and a Guest identity dropdown in the same header position as the authenticated
account menu. The dropdown must render every `ACCOUNT_MENU_GROUPS` link so
Wallet, My Activity/Orders, Profile, Preferences, Support, Affiliate,
Recommendations, and KYC remain discoverable as zero/empty Guest pages. Its
identity header reads `Guest`, and its footer contains:

```tsx
<Link href={guestLoginHref(currentPath)}>Sign in</Link>
<Link href={`${guestLoginHref(currentPath)}&mode=signup`}>Create account</Link>
```

Keep unread polling/realtime effects behind `if (!currentUser) return`. If an authenticated viewer has a non-customer active role, preserve the existing role boundary by redirecting that signed-in viewer to `/login?next=...`; Guest alone is allowed.

- [ ] **Step 4: Make providers clear and skip private hydration when anonymous**

- Wishlist/Saved Destinations: add `useAuth()`, set empty collections and `loading=false` when `currentUser` is null, and only fetch/mutate for a real ID.
- Cart: on sign-out set `items=[]`, `selectedKeys=new Set()`, and `mounted=true`; retain public catalogue reads used for totals.
- Trip: allow in-memory Guest planning but do not read/write `localStorage`; clear in-memory stops when moving from authenticated to Guest.
- Notification Bell/Center: add `enabled?: boolean`; when false, show zero/empty presentation and skip fetch, intervals, mark-read, and mark-all calls.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run app/customer/__tests__/guest-layout.contract.test.ts components/providers/__tests__/anonymous-customer-providers.test.ts`

Expected: both files pass.

- [ ] **Step 6: Commit only Task 3**

```bash
git add app/customer/layout.tsx components/providers/cart.tsx components/providers/wishlist.tsx components/providers/saved-destinations.tsx components/providers/trip.tsx components/shared/notification-bell.tsx components/shared/notification-center.tsx app/customer/__tests__/guest-layout.contract.test.ts components/providers/__tests__/anonymous-customer-providers.test.ts
git commit -m "feat: allow guests in the customer shell"
```

---

### Task 4: Canonicalize Legacy Guest URLs

**Files:**
- Modify: `app/guest/layout.tsx`
- Modify: `app/guest/explore/page.tsx`
- Modify: `app/guest/activity/[id]/page.tsx`
- Modify: `app/guest/vendor/[vendorId]/page.tsx`
- Modify: `app/guest/vendor/[vendorId]/__tests__/page.contract.test.ts`
- Modify: `tests/e2e/guest-mode.spec.ts`

**Interfaces:**
- Consumes: canonical `/customer/*` route decisions from the spec.
- Produces: redirect-only compatibility without duplicate Guest UI/data fetching.

- [ ] **Step 1: Rewrite contract expectations before implementation**

```ts
expect(explore).toContain('redirect("/customer")');
expect(activity).toContain("encodeURIComponent(id)");
expect(activity).toContain('redirect(`/customer/activity/${safeId}`)');
expect(vendor).toContain("encodeURIComponent(vendorId)");
expect(vendor).toContain('redirect(`/customer/vendor/${safeVendorId}`)');
expect(activity).not.toContain("getComputedActivity");
expect(vendor).not.toContain("getGuestVendor");
```

Update Playwright’s first expectation from `/guest/explore` to `/customer`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run 'app/guest/vendor/[vendorId]/__tests__/page.contract.test.ts'`

Expected: FAIL because Guest files still render duplicate pages.

- [ ] **Step 3: Replace each Guest page with a server redirect**

Use exact route handlers:

```tsx
import { redirect } from "next/navigation";

export default function GuestExplorePage() {
  redirect("/customer");
}
```

Dynamic pages await params, call `encodeURIComponent()` on the ID, and redirect to the matching Customer detail. `app/guest/layout.tsx` becomes a transparent `{children}` wrapper so no duplicate header can flash.

- [ ] **Step 4: Run contract and redirect browser checks**

Run: `npx vitest run 'app/guest/vendor/[vendorId]/__tests__/page.contract.test.ts'`

Run: `npx playwright test tests/e2e/guest-mode.spec.ts --project=chromium --grep "legacy guest"`

Expected: contracts pass and all three legacy URLs land on `/customer/*`.

- [ ] **Step 5: Commit only Task 4**

```bash
git add app/guest tests/e2e/guest-mode.spec.ts
git commit -m "refactor: redirect guest routes to customer"
```

---

### Task 5: Gate Public-Surface Mutations and Add Image Fallbacks

**Files:**
- Create: `components/shared/resilient-image.tsx`
- Create: `components/shared/__tests__/resilient-image.contract.test.ts`
- Modify: `components/customer/activity-card.tsx`
- Modify: `components/customer/saved-destination-card.tsx`
- Modify: `components/customer/outlet-chat-button.tsx`
- Modify: `components/outlet/outlet-menu.tsx`
- Modify: `app/customer/design-demo/design-demo-client.tsx`
- Modify: `app/customer/activity/[id]/activity-detail-client.tsx`
- Modify: `app/customer/vendor/[vendorId]/page.tsx`
- Modify: `app/customer/activity/[id]/__tests__/activity-detail-contract.test.ts`
- Modify: `app/customer/vendor/[vendorId]/__tests__/page.contract.test.ts`

**Interfaces:**
- Consumes: `useCustomerCapabilityGate()` and `CUSTOMER_CAPABILITY`.
- Produces: Guest-visible public detail pages whose mutations redirect safely and whose images never render blank.

- [ ] **Step 1: Write failing contracts for every public mutation seam**

Assert the following source contracts:

```ts
expect(activityCard).toContain("CUSTOMER_CAPABILITY.ACCOUNT_MUTATION");
expect(home).toContain("CUSTOMER_CAPABILITY.ACCOUNT_MUTATION");
expect(outletChat).toContain("CUSTOMER_CAPABILITY.ACCOUNT_MUTATION");
expect(outletMenu).toContain("CUSTOMER_CAPABILITY.CART_MUTATION");
expect(detail).toContain("CUSTOMER_CAPABILITY.CART_MUTATION");
expect(detail).toContain("CUSTOMER_CAPABILITY.ACCOUNT_MUTATION");
expect(detail).toContain("ResilientImage");
expect(vendor).toContain("ResilientImage");
```

- [ ] **Step 2: Run focused contracts and verify RED**

Run: `npx vitest run 'app/customer/activity/[id]/__tests__/activity-detail-contract.test.ts' 'app/customer/vendor/[vendorId]/__tests__/page.contract.test.ts' components/shared/__tests__/resilient-image.contract.test.ts`

Expected: FAIL because the gate and resilient image are not used.

- [ ] **Step 3: Implement `ResilientImage`**

The client component owns `failed` state, resets when `src` changes, renders the image only for a non-empty source, and renders this fallback otherwise:

```tsx
<div role="img" aria-label={`${alt} image unavailable`} className={fallbackClassName}>
  <ImageOff aria-hidden="true" />
  <span>Image unavailable</span>
</div>
```

Replace raw public product/detail images that currently leave an empty block. Do not change destination-library images that are known local assets.

- [ ] **Step 4: Apply capability gates before mutations**

Each handler follows this exact shape:

```ts
const guard = useCustomerCapabilityGate();

if (!guard(CUSTOMER_CAPABILITY.CART_MUTATION)) return;
await addItem(...);
```

- Activity and destination Save use `ACCOUNT_MUTATION`.
- Add to Cart uses `CART_MUTATION`.
- Outlet menu Add/Buy uses `CART_MUTATION` before any optimistic state or cart mutation.
- Chat creation/send uses `ACCOUNT_MUTATION`.
- The guard runs before optimistic UI, `getOrCreateThread`, `sendMessage`, or provider mutation.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npx vitest run 'app/customer/activity/[id]/__tests__/activity-detail-contract.test.ts' 'app/customer/vendor/[vendorId]/__tests__/page.contract.test.ts' components/shared/__tests__/resilient-image.contract.test.ts`

Expected: all files pass.

- [ ] **Step 6: Commit only Task 5**

```bash
git add components/shared/resilient-image.tsx components/shared/__tests__/resilient-image.contract.test.ts components/customer/activity-card.tsx components/customer/saved-destination-card.tsx components/customer/outlet-chat-button.tsx components/outlet/outlet-menu.tsx app/customer/design-demo/design-demo-client.tsx 'app/customer/activity/[id]/activity-detail-client.tsx' 'app/customer/activity/[id]/__tests__/activity-detail-contract.test.ts' 'app/customer/vendor/[vendorId]/page.tsx' 'app/customer/vendor/[vendorId]/__tests__/page.contract.test.ts'
git commit -m "feat: gate guest mutations on public pages"
```

---

### Task 6: Render Safe Guest States on Account History Pages

**Files:**
- Modify: `app/customer/cart/page.tsx`
- Modify: `app/customer/wishlist/page.tsx`
- Modify: `app/customer/orders/page.tsx`
- Modify: `app/customer/orders/[id]/page.tsx`
- Modify: `app/customer/activity/page.tsx`
- Modify: `app/customer/calendar/page.tsx`
- Modify: `app/customer/bookings/[id]/page.tsx`
- Modify: `app/customer/chat/page.tsx`
- Modify: `app/customer/chat/[threadId]/page.tsx`
- Modify: `app/customer/notifications/page.tsx`
- Modify: `app/customer/support/page.tsx`
- Modify: `app/customer/support/[id]/page.tsx`
- Create: `app/customer/__tests__/guest-account-pages.contract.test.ts`

**Interfaces:**
- Consumes: `GuestAccountEmptyState` and `useAuth()`.
- Produces: deterministic Guest pages that show empty/zero content without user-owned requests.

- [ ] **Step 1: Write one table-driven failing source test**

Read every account/detail file above except the composition-only `app/customer/activity/page.tsx`. Assert that each imports `GuestAccountEmptyState` and checks `!currentUser` or server `!user` before its private loader/fetch/subscription. Assert separately that `app/customer/activity/page.tsx` only composes the already-guarded Orders and Calendar pages. Include specific negative assertions:

```ts
expect(orders.indexOf("if (!currentUser)"))
  .toBeLessThan(orders.indexOf("getOrdersForUser"));
expect(support.indexOf("if (!currentUser)"))
  .toBeLessThan(support.indexOf('fetch("/api/support/tickets")'));
expect(notifications).toContain("enabled={false}");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run app/customer/__tests__/guest-account-pages.contract.test.ts`

Expected: FAIL on pages that currently stay on “Loading…” or call a private API anonymously.

- [ ] **Step 3: Add explicit Guest branches before data loading**

For client pages, use:

```tsx
const { currentUser, loading } = useAuth();
if (loading) return <ExistingLoadingState />;
if (!currentUser) return (
  <GuestAccountEmptyState
    title="No orders yet"
    description="Sign in to view and manage your real MyWisata orders."
    nextPath="/customer/orders"
    value="0 orders"
  />
);
```

Effects retain `if (!currentUser) return` and must not be mounted through child components that fetch private data. Server pages use `db.auth.getUser()` before user-owned queries.

Use page-appropriate zero copy:

- Cart/Saved: empty collection.
- Orders/Activity/Calendar: zero bookings/orders.
- Chat/Notifications/Support: empty inbox/feed/tickets.
- Direct order, booking, chat-thread, and support-detail URLs: “Sign in to view this item,” not “not found” and not perpetual loading.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run: `npx vitest run app/customer/__tests__/guest-account-pages.contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Run existing affected customer tests**

Run: `npx vitest run lib/customer/__tests__/booking-view.test.ts lib/customer/__tests__/itinerary-calendar.test.ts lib/customer/__tests__/chat-view.test.ts app/customer/__tests__/customer-flow-contract.test.ts`

Expected: all existing signed-in display contracts pass.

- [ ] **Step 6: Commit only Task 6**

```bash
git add app/customer/cart/page.tsx app/customer/wishlist/page.tsx app/customer/orders app/customer/activity/page.tsx app/customer/calendar/page.tsx app/customer/bookings app/customer/chat app/customer/notifications/page.tsx app/customer/support app/customer/__tests__/guest-account-pages.contract.test.ts
git commit -m "feat: show guest account empty states"
```

---

### Task 7: Apply Tier Gates to Wallet, Checkout, Profile, AI, Recommendation, and Affiliate

**Files:**
- Modify: `app/customer/wallet/page.tsx`
- Modify: `app/customer/wallet/withdrawals/[id]/page.tsx`
- Modify: `app/customer/checkout/page.tsx`
- Modify: `app/customer/profile/page.tsx`
- Modify: `app/customer/preferences/page.tsx`
- Modify: `app/customer/kyc/page.tsx`
- Modify: `app/customer/recommendations/page.tsx`
- Modify: `app/customer/affiliate/page.tsx`
- Modify: `app/customer/for-you/page.tsx`
- Modify: `app/customer/for-you/for-you-client.tsx`
- Modify: `app/customer/profile/register-vendor/page.tsx`
- Modify: `app/customer/wallet/__tests__/stripe-jit.test.ts`
- Create: `app/customer/__tests__/verification-page-gates.contract.test.ts`
- Create: `app/api/affiliate/link/__tests__/route.contract.test.ts`

**Interfaces:**
- Consumes: Task 1 capability policy, Task 2 gate and Guest state, existing server/API tier guards.
- Produces: UI gates that match the approved five-level matrix without weakening the existing server enforcement.

- [ ] **Step 1: Write failing tier-page contracts**

The test must assert:

```ts
expect(wallet).toContain("CUSTOMER_CAPABILITY.CHECKOUT");
expect(wallet).toContain("CUSTOMER_CAPABILITY.WITHDRAWAL");
expect(checkout).toContain("CUSTOMER_CAPABILITY.CHECKOUT");
expect(forYou).toContain("CUSTOMER_CAPABILITY.BASIC_AI");
expect(recommendations).toContain("CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT");
expect(affiliate).toContain("CUSTOMER_CAPABILITY.AFFILIATE_LIMITED");
expect(profile).toContain('searchParams.get("next")');
expect(kyc).toContain('searchParams.get("next")');
```

Also assert each Guest branch precedes its first user-owned API fetch.

The affiliate route contract reads `app/api/affiliate/link/route.ts` and asserts that both GET and POST require an authenticated user, `AFFILIATE_BASIC` is checked before link creation, and `mode: full` is restricted to `kyc_verified` plus approved KYC:

```ts
const source = readFileSync(resolve(process.cwd(), "app/api/affiliate/link/route.ts"), "utf8");
expect((source.match(/if \(!user\) return apiFail\('UNAUTHORIZED'/g) ?? []).length).toBe(2);
expect(source).toContain("REQUIRED_TIER.AFFILIATE_BASIC");
expect(source.indexOf("REQUIRED_TIER.AFFILIATE_BASIC"))
  .toBeLessThan(source.indexOf("getOrCreateAffiliateLink"));
expect(source).toContain("profile.tier === 'kyc_verified' && profile.kyc_status === 'approved'");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run app/customer/__tests__/verification-page-gates.contract.test.ts app/customer/wallet/__tests__/stripe-jit.test.ts`

Expected: FAIL because the central capabilities are not yet used.

- [ ] **Step 3: Implement exact Guest and tier behavior**

- Wallet Guest: initialize/render RM0 and empty history; Top Up checks `CHECKOUT`; Withdraw checks `WITHDRAWAL`; no wallet, destination, Stripe status, or withdrawal request is made anonymously.
- Checkout: before loading selected cart/payment state, Guest routes to sign-in and Email Verified routes to Profile phone verification with `next=/customer/checkout`.
- Profile: Guest sees the shared empty state. Signed-in phone/profile steps retain `next`; after successful phone verification or profile completion, navigate to the validated continuation when the required tier is reached.
- Preferences: Guest empty state; Email/Phone users can open profile completion UI according to existing rules.
- KYC: Guest empty state; lower tiers link to Profile; verified users with `next` see a “Continue” link; pending Admin review does not pretend to grant access.
- Recommendations: Guest and lower tiers see the correct Sign in/Profile Complete requirement before upload or POST.
- Affiliate: reuse current eligible/ineligible branches but use the central limited/full decisions and keep withdrawal KYC-only.
- For You: `app/customer/for-you/page.tsx` loads public popular activities with `searchActivities({ category: null, sort: "recommended" }, db)` and passes `initialPopular={activities.slice(0, 6)}`. `ForYouClient` accepts `initialPopular: ComputedActivity[]`; Guest/Email viewers render those cards without calling `/api/personalized-recommendations`. The personalized request and “Use my location” action require `BASIC_AI`, and blocked viewers see the Phone Verification CTA.
- Register Vendor: preserve server redirect but include a safe `/login?next=/customer/profile/register-vendor` continuation.

- [ ] **Step 4: Verify API enforcement has not drifted**

Run:

```bash
npx vitest run \
  app/api/checkout/__tests__/phone-verification.test.ts \
  app/api/stripe/create-order-checkout/__tests__/route.test.ts \
  app/api/recommendations/__tests__/route.test.ts \
  app/api/affiliate/link/__tests__/route.contract.test.ts \
  app/api/wallet/withdrawals/__tests__/route.test.ts
```

Expected: Guest remains 401; insufficient tiers remain 403 or the endpoint’s established null response; eligible tiers pass.

- [ ] **Step 5: Run focused UI contracts and verify GREEN**

Run: `npx vitest run app/customer/__tests__/verification-page-gates.contract.test.ts app/customer/wallet/__tests__/stripe-jit.test.ts`

Expected: both pass.

- [ ] **Step 6: Commit only Task 7**

```bash
git add app/customer/wallet app/customer/checkout/page.tsx app/customer/profile app/customer/preferences/page.tsx app/customer/kyc/page.tsx app/customer/recommendations/page.tsx app/customer/affiliate/page.tsx app/customer/for-you app/customer/__tests__/verification-page-gates.contract.test.ts app/api/affiliate/link/__tests__/route.contract.test.ts
git commit -m "feat: align customer actions with verification tiers"
```

---

### Task 8: End-to-End Guest, Continuation, and Regression Verification

**Files:**
- Modify: `tests/e2e/guest-mode.spec.ts`
- Create: `tests/e2e/customer-capability-tiers.spec.ts`
- Modify: `Docs/superpowers/specs/2026-08-17-shared-customer-guest-experience-design.md` only to change status to Implemented after every verification passes.

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: browser proof for the approved experience and a final implementation status.

- [ ] **Step 1: Add the complete Guest browser flow before final adjustments**

The Guest spec must prove:

```ts
await page.goto("/customer");
await expect(page.getByText("Guest", { exact: true })).toBeVisible();
await expect(page.getByRole("link", { name: "Explore" })).toBeVisible();
await page.goto("/customer/wallet");
await expect(page.getByText("RM 0.00").first()).toBeVisible();
await expect(page.getByText(/sign in to view your wallet/i)).toBeVisible();
```

Capture requests and assert zero calls to `/api/wallet/summary`, `/api/stripe/connect-status`, `/api/support/tickets`, `/api/notifications`, `/api/wishlist`, and `/api/saved-destinations` across the corresponding Guest pages.

Open a Listing, click Add to Cart, assert `/login?next=...`; complete demo sign-in and assert return to that Listing. Add a route-mocked product whose image returns 404 and assert an `image unavailable` role is visible.

- [ ] **Step 2: Add tier transition browser scenarios**

Use isolated browser contexts per ADR-015. Install a Playwright
`page.route("**/rest/v1/users*")` helper **before** signing in through
`/api/auth/demo-signin` as `customer1@demo.local`; this ensures the subsequent
`loadSupabaseUser()` request receives the exact UI tier fixture without
mutating the shared team database:

```ts
async function mockViewerTier(page: Page, tier: "email_verified" | "phone_verified" | "profile_complete" | "kyc_verified") {
  await page.route("**/rest/v1/users*", async (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get("select");
    if (!url.pathname.endsWith("/rest/v1/users") || !select?.startsWith("id,email,full_name")) {
      return route.continue();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.pgrst.object+json",
      body: JSON.stringify({
        id: "aaaaaaaa-0000-0000-0000-000000000005",
        email: "customer1@demo.local",
        full_name: "Customer Alice",
        city: "Kuala Lumpur",
        country: "Malaysia",
        phone: "+60123456789",
        status: "active",
        tier,
        user_roles: [{ vendor_id: null, outlet_id: null, roles: { name: "customer" }, outlets: null }],
      }),
    });
  });
}
```

Use those UI fixtures to prove:

- Email Verified checkout routes to Profile/Phone with safe `next`.
- Phone Verified checkout is not UI-blocked.
- Phone Verified recommendation routes to Profile Completion.
- Profile Complete recommendation and limited affiliate are available.
- Profile Complete withdrawal routes to KYC.
- KYC Verified withdrawal reaches the existing JIT/Admin Approval request flow.

The mocked lower-tier scenarios stop at the UI routing boundary and do not
submit a mutation against `customer1`'s real server-side KYC state. The focused
API tests in Task 7 remain the authoritative proof of backend tier rejection.

- [ ] **Step 3: Run the new browser flows once**

Run:

```bash
npx playwright test tests/e2e/guest-mode.spec.ts tests/e2e/customer-capability-tiers.spec.ts --project=chromium
```

Expected: all new Guest and tier scenarios pass with no private Guest requests.

- [ ] **Step 4: Run final static and affected-test verification**

Run:

```bash
npx tsc --noEmit
npx eslint app/customer app/guest components/customer components/providers components/shared lib/auth tests/e2e/guest-mode.spec.ts tests/e2e/customer-capability-tiers.spec.ts
npx vitest run lib/auth components/customer app/customer app/guest
git diff --check
```

Expected: TypeScript and `git diff --check` exit 0; ESLint has 0 errors; affected Vitest suite has 0 failures. Existing unrelated warnings are reported without broad refactoring.

- [ ] **Step 5: Perform one bounded `luna_worker` final review**

Delegate a read-only review limited to:

- Guest private-request suppression;
- stale account state after sign-out;
- capability/UI versus API/RLS boundary consistency;
- open-redirect safety;
- image/storage URL exposure.

Classify only confirmed authorization, privacy, data exposure, broken core flow, or requirement violations as must-fix. Apply at most one focused repair/re-review cycle under `AGENTS.md`; record all other observations as follow-up.

- [ ] **Step 6: Mark the design implemented and commit final verification changes**

Change the spec status only after Step 3–5 pass, then commit the exact final files:

```bash
git add tests/e2e/guest-mode.spec.ts tests/e2e/customer-capability-tiers.spec.ts Docs/superpowers/specs/2026-08-17-shared-customer-guest-experience-design.md
git commit -m "test: verify shared customer guest experience"
```

## Final Acceptance Checklist

- [ ] Guest and Customer use the same Customer shell, homepage, public browsing components, and navigation.
- [ ] Guest can open every Customer navigation page without a layout redirect.
- [ ] Guest account pages show intentional zero/empty state with identity context.
- [ ] Guest pages do not call user-owned APIs or retain previous-user state.
- [ ] Guest Add to Cart/Save/Chat/Book/Buy routes to login with a safe continuation.
- [ ] Email, Phone, Profile, and KYC tier behavior matches the approved table.
- [ ] Public images fail visibly and accessibly instead of producing blank rectangles.
- [ ] Legacy Guest URLs redirect to canonical Customer URLs.
- [ ] Existing API, RLS, payout, KYC, and Admin Approval behavior remains intact.
- [ ] No dependencies or database changes were introduced.
