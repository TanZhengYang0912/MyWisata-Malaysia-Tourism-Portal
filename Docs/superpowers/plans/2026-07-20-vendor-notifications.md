# Vendor Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a role-aware Vendor Portal notification bell and notification center, with owner/Outlet Manager isolation and email delivery for high-priority vendor events, without regressing Customer notifications.

**Architecture:** Keep `public.notifications` as the personal feed, adding nullable vendor/outlet scope columns and recipient-specific idempotency keys. A server-side vendor notification service resolves owners and assigned managers, inserts one row per recipient, and enqueues high-priority emails through the existing outbox. The existing NotificationBell becomes scope-aware and is rendered by a new Vendor header; all vendor reads are authorized through `authorizeVendor` before any service-role query.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/Postgres migrations and RLS, existing email outbox/Resend-or-SMTP sender, Vitest, Playwright.

## Global Constraints

- Vendor Owner receives business, wallet, and account notifications for owned vendors and outlets.
- Outlet Manager receives only operational notifications for assigned outlets and never owner wallet, payout, revenue, or account notifications.
- The bell panel and full page show the newest 15 records by default; filters and pagination are server-side.
- Ordinary customer/vendor messages remain App-only; high-priority order, listing, wallet, approval, and permission events are App + Email.
- Every event is idempotent per recipient; email failure never rolls back the business mutation.
- Personal notification APIs return `401` when unauthenticated and never reveal another vendor/outlet scope.
- Do not add a second notification table, push notification provider, SMS channel, or a redesign of Vendor Inbox.

---

## File Map

**Create**

- `supabase/migrations/080_vendor_notifications.sql` — vendor/outlet scope columns, indexes, and notification category constraints.
- `lib/vendor-notifications/scope.ts` — resolve owner and assigned-manager recipients from a vendor/outlet scope.
- `lib/vendor-notifications/emit.ts` — insert idempotent in-app rows and enqueue high-priority email events.
- `components/layout/vendor-header.tsx` — Vendor Portal header with role-aware notification bell.
- `app/vendor/notifications/page.tsx` — paginated Vendor notification center.
- `lib/vendor-notifications/__tests__/scope.test.ts` — recipient isolation tests.
- `lib/vendor-notifications/__tests__/emit.test.ts` — idempotency/email policy tests.
- `app/vendor/notifications/__tests__/page.spec.tsx` — component behavior tests if the repository test setup supports page rendering.
- `tests/e2e/vendor-notifications.spec.ts` — Vendor Owner and Outlet Manager browser flows.

**Modify**

- `app/api/notifications/route.ts` — validate `scope`, `vendorId`, vendor categories, and authorized scoped query.
- `components/shared/notification-bell.tsx` — add `scope`, `vendorId`, `allHref`, and filter props while preserving Customer defaults.
- `app/customer/notifications/page.tsx` — consume the shared notification center with `scope="customer"` and existing customer labels.
- `app/vendor/layout.tsx` — render `VendorHeader` above page content.
- `components/layout/vendor-sidebar.tsx` — keep Inbox chat badge unchanged; expose the authenticated vendor context needed by the header.
- `lib/email/templates.ts` — add sanitized vendor-event email types and renderers.
- `lib/email/outbox.ts` — serialize vendor payloads and dispatch `vendor_*` events through the vendor renderer.
- `lib/email/events.ts` — add `enqueueVendorEmail` with recipient lookup and event-key deduplication.
- Vendor event routes: `app/api/vendors/[vendorId]/orders/[orderItemId]/fulfil/route.ts`, `app/api/vendors/[vendorId]/bookings/[bookingId]/checkin/route.ts`, `app/api/bookings/[bookingId]/reschedule/route.ts`, `app/api/orders/[orderId]/refund/route.ts`, `app/api/vendors/[vendorId]/products/[productId]/route.ts`, `app/api/vendors/[vendorId]/products/route.ts`, `app/api/admin/catalogue/reviews/route.ts`, `app/api/admin/vendors/[id]/approve/route.ts`, `app/api/admin/vendors/[id]/suspend/route.ts`, `app/api/vendors/[vendorId]/outlet-managers/route.ts`, `app/api/vendors/[vendorId]/outlet-managers/[outletId]/route.ts`, `app/api/stripe/connect-webhook/route.ts`, and the wallet settlement/withdrawal event writers.

---

### Task 1: Add vendor notification scope to the existing table

**Files:**
- Create: `supabase/migrations/080_vendor_notifications.sql`
- Create: `supabase/migrations/__tests__/080_vendor_notifications.test.ts`

**Interfaces:**
- Produces nullable `notifications.vendor_id UUID`, `notifications.outlet_id UUID`, and `notifications.audience_role TEXT` (`vendor_owner` or `outlet_manager`).
- Produces indexes for `(user_id, vendor_id, created_at DESC)`, `(user_id, outlet_id, created_at DESC)`, and the existing `event_key` uniqueness remains recipient-specific.

- [ ] **Step 1: Write the migration contract test**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/080_vendor_notifications.sql', 'utf8');

describe('vendor notification migration', () => {
  it('adds scoped columns, constraints, and query indexes', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS vendor_id UUID');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS outlet_id UUID');
    expect(sql).toContain('audience_role');
    expect(sql).toContain('notifications_vendor_scope_idx');
    expect(sql).toContain('notifications_outlet_scope_idx');
  });
});
```

- [ ] **Step 2: Run the contract test and confirm it fails because the migration is absent**

Run: `npx vitest run supabase/migrations/__tests__/080_vendor_notifications.test.ts`

Expected: FAIL with an `ENOENT` message for `080_vendor_notifications.sql`.

- [ ] **Step 3: Write the migration**

```sql
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS audience_role TEXT;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_audience_role_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_audience_role_check
  CHECK (audience_role IS NULL OR audience_role IN ('vendor_owner', 'outlet_manager'));

CREATE INDEX IF NOT EXISTS notifications_vendor_scope_idx
  ON public.notifications(user_id, vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_outlet_scope_idx
  ON public.notifications(user_id, outlet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_vendor_category_idx
  ON public.notifications(user_id, vendor_id, category, created_at DESC);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Run the contract test and SQL formatting check**

Run: `npx vitest run supabase/migrations/__tests__/080_vendor_notifications.test.ts` and `git diff --check`.

Expected: PASS and no whitespace errors.

- [ ] **Step 5: Apply the migration to the configured Supabase project**

Run the contents of `supabase/migrations/080_vendor_notifications.sql` in Supabase SQL Editor, then verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
  AND column_name IN ('vendor_id', 'outlet_id', 'audience_role');
```

Expected: three rows.

- [ ] **Step 6: Commit the migration**

```bash
git add supabase/migrations/080_vendor_notifications.sql supabase/migrations/__tests__/080_vendor_notifications.test.ts
git commit -m "feat: add vendor notification scope"
```

### Task 2: Build recipient resolution and idempotent event emission

**Files:**
- Create: `lib/vendor-notifications/scope.ts`
- Create: `lib/vendor-notifications/emit.ts`
- Create: `lib/vendor-notifications/__tests__/scope.test.ts`
- Create: `lib/vendor-notifications/__tests__/emit.test.ts`

**Interfaces:**

```ts
export type VendorAudience = 'owner' | 'assigned_outlet' | 'owner_and_assigned_outlet';
export type VendorNotificationCategory = 'vendor_orders' | 'vendor_bookings' | 'vendor_products' | 'vendor_wallet' | 'vendor_account';
export type VendorNotificationInput = {
  eventKey: string;
  vendorId: string;
  outletId?: string | null;
  audience: VendorAudience;
  category: VendorNotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string;
  email: boolean;
  reference?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export async function resolveVendorRecipients(input: {
  vendorId: string;
  outletId?: string | null;
  audience: VendorAudience;
  serviceDb: SupabaseClient;
}): Promise<Array<{ userId: string; role: 'vendor_owner' | 'outlet_manager'; outletId: string | null }>>;

export async function emitVendorNotification(input: VendorNotificationInput): Promise<{ notificationIds: string[]; recipientIds: string[] }>;
```

The unit-test fake must expose the same chained methods used by the implementation (`from`, `select`, `eq`, `maybeSingle`, and `then`/resolved query results); seed it with one approved vendor, two outlets, the owner, one assigned manager, and one manager on a different vendor. This keeps the isolation test deterministic and does not require a live Supabase project.

- [ ] **Step 1: Write failing tests for owner/manager isolation**

```ts
it('returns owner plus managers assigned to the event outlet', async () => {
  const recipients = await resolveVendorRecipients({ vendorId: 'vendor-1', outletId: 'outlet-1', audience: 'owner_and_assigned_outlet', serviceDb: fakeDb });
  expect(recipients).toEqual([
    { userId: 'owner-1', role: 'vendor_owner', outletId: null },
    { userId: 'manager-1', role: 'outlet_manager', outletId: 'outlet-1' },
  ]);
});

it('never includes a manager assigned to another outlet or vendor', async () => {
  const recipients = await resolveVendorRecipients({ vendorId: 'vendor-1', outletId: 'outlet-1', audience: 'assigned_outlet', serviceDb: fakeDb });
  expect(recipients.map((row) => row.userId)).toEqual(['manager-1']);
});
```

- [ ] **Step 2: Run the tests and confirm the resolver is missing**

Run: `npx vitest run lib/vendor-notifications/__tests__/scope.test.ts lib/vendor-notifications/__tests__/emit.test.ts`

Expected: FAIL because the new resolver and emitter do not exist.

- [ ] **Step 3: Implement scope resolution using the existing `vendors`, `outlets`, `outlet_managers`, and `users` relationships**

The resolver must first fetch `vendors.owner_id` and verify `vendor.status = 'approved'`; for `assigned_outlet`, fetch the outlet and require `outlets.vendor_id = vendorId`; then fetch only `outlet_managers` for that outlet. Deduplicate by `(userId, role, outletId)` and return no rows for an invalid or cross-vendor outlet.

- [ ] **Step 4: Implement idempotent emission**

For each recipient, use an event key in this exact form:

```ts
const recipientEventKey = `${input.eventKey}:${recipient.userId}`;
```

Insert `user_id`, `vendor_id`, `outlet_id`, `audience_role`, `type`, `title`, `body`, `link`, `category`, and sanitized `metadata` with `event_key = recipientEventKey` using `onConflict: 'event_key'` and `ignoreDuplicates: true`. Only call `enqueueVendorEmail` when `input.email` is true.

- [ ] **Step 5: Run the unit tests**

Run: `npx vitest run lib/vendor-notifications/__tests__/scope.test.ts lib/vendor-notifications/__tests__/emit.test.ts`

Expected: PASS, including duplicate-event tests proving one row and one email enqueue per recipient.

- [ ] **Step 6: Commit the recipient service**

```bash
git add lib/vendor-notifications
git commit -m "feat: add vendor notification recipient service"
```

### Task 3: Extend email templates and outbox for high-priority vendor events

**Files:**
- Modify: `lib/email/templates.ts`
- Modify: `lib/email/outbox.ts`
- Modify: `lib/email/events.ts`
- Create: `lib/email/__tests__/vendor-events.test.ts`

**Interfaces:**

```ts
export type VendorEmailType =
  | 'vendor_order_update'
  | 'vendor_booking_update'
  | 'vendor_listing_review'
  | 'vendor_wallet_update'
  | 'vendor_account_update'
  | 'vendor_permission_update';

export type VendorEmailInput = {
  eventType: VendorEmailType;
  recipientName?: string | null;
  vendorName: string;
  reason: string;
  reference?: string | null;
  occurredAt: string;
};

export function enqueueVendorEmail(input: VendorEmailInput & { userId: string; eventKey: string }): Promise<void>;
export function renderVendorEmail(input: VendorEmailInput): RenderedEmail;
export function sendVendorEmail(input: VendorEmailInput & { to: string }): Promise<void>;
```

- [ ] **Step 1: Write failing rendering and outbox tests**

Assert that the rendered subject/body contains the event title, vendor name, sanitized reason, and reference; assert `<script>` and raw Stripe IDs are escaped/omitted. Assert `enqueueEmail` receives the same `eventKey` on repeated calls and `processEmailOutbox` dispatches `vendor_*` to `sendVendorEmail`.

- [ ] **Step 2: Run the tests and confirm the new type is absent**

Run: `npx vitest run lib/email/__tests__/vendor-events.test.ts`

Expected: FAIL because `VendorEmailType`, renderer, and enqueue helper are not defined.

- [ ] **Step 3: Add the vendor renderer and outbox discriminant**

Use a separate `renderVendorEmail` function and a separate `sendVendorEmail` sender path. Do not overload transaction payloads with a fake amount. Extend the outbox payload type with `vendorName` and `reference`, branch on `event_type.startsWith('vendor_')`, and keep existing account/transaction behavior unchanged.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run lib/email/__tests__/vendor-events.test.ts lib/email/__tests__/outbox.test.ts`

Expected: PASS; ordinary `vendor_customer_message` events never enqueue email.

- [ ] **Step 5: Commit email support**

```bash
git add lib/email/templates.ts lib/email/outbox.ts lib/email/events.ts lib/email/__tests__
git commit -m "feat: add vendor notification email events"
```

### Task 4: Add scoped notification API and shared bell filters

**Files:**
- Modify: `app/api/notifications/route.ts`
- Modify: `components/shared/notification-bell.tsx`
- Modify: `app/customer/notifications/page.tsx`
- Create: `components/shared/notification-center.tsx`
- Create: `app/api/notifications/__tests__/vendor-route.test.ts`

**Interfaces:**

```ts
type NotificationBellProps = {
  scope?: 'customer' | 'vendor';
  vendorId?: string | null;
  allHref?: string;
  categories?: ReadonlyArray<{ value: string; label: string }>;
};

type NotificationCenterProps = Omit<NotificationBellProps, 'allHref'> & {
  pageSize?: 15;
};
```

- [ ] **Step 1: Write API tests for vendor authorization and filters**

Cover: missing auth → `401`; `scope=vendor` without a valid `vendorId` → `400`; owner receives only their `vendor_id`; Outlet Manager receives only their scoped rows; `category=vendor_wallet` is not visible to an Outlet Manager; `pageSize=100` is clamped to 50; unknown category is rejected with `400` instead of silently broadening the query.

- [ ] **Step 2: Run the API tests and confirm current endpoint lacks vendor scope**

Run: `npx vitest run app/api/notifications/__tests__/vendor-route.test.ts`

Expected: FAIL on vendor scope validation/query assertions.

- [ ] **Step 3: Implement server-side vendor scope**

For `scope=vendor`, call `authorizeVendor(vendorId)` before querying. Require `query.eq('user_id', access.userId).eq('vendor_id', access.vendorId)`; for an Outlet Manager also add `.in('outlet_id', access.outletIds)` and exclude `vendor_wallet`/`vendor_account` categories. Keep the existing customer query path byte-for-byte equivalent apart from shared validation.

- [ ] **Step 4: Refactor NotificationBell without changing Customer defaults**

Build query parameters from `scope`, `vendorId`, `read`, and category. Keep default `pageSize=15`, last-known state on fetch failure, mark-one/read-all endpoints, and Customer `allHref='/customer/notifications'`. Add vendor filter chips inside the open panel and use the passed `allHref`.

- [ ] **Step 5: Move full-page list markup into `NotificationCenter`**

Render filter buttons, newest-first rows, page indicator, Previous/Next controls, empty state, and accessible labels. `app/customer/notifications/page.tsx` supplies customer categories; the Vendor page will supply vendor categories.

- [ ] **Step 6: Run focused tests and lint**

Run: `npx vitest run app/api/notifications/__tests__ app/api/notifications/__tests__/vendor-route.test.ts` and `npm run lint`.

Expected: all notification tests pass; lint reports no new errors.

- [ ] **Step 7: Commit the shared notification center**

```bash
git add app/api/notifications components/shared/notification-bell.tsx components/shared/notification-center.tsx app/customer/notifications/page.tsx
git commit -m "feat: add scoped notification center API"
```

### Task 5: Add the Vendor header and notification page

**Files:**
- Create: `components/layout/vendor-header.tsx`
- Modify: `app/vendor/layout.tsx`
- Modify: `components/layout/vendor-sidebar.tsx`
- Create: `app/vendor/notifications/page.tsx`

**Interfaces:**

```tsx
<VendorHeader />
<NotificationCenter scope="vendor" vendorId={user.activeVendorId} pageSize={15} />
```

- [ ] **Step 1: Add the header shell**

Render a top bar to the right of the fixed sidebar with `Vendor Portal`, current role/scope text, and `<NotificationBell scope="vendor" vendorId={activeVendorId} allHref="/vendor/notifications" />`. Keep Inbox’s existing chat count in the sidebar; do not merge chat and system counts.

- [ ] **Step 2: Mount the header in `app/vendor/layout.tsx`**

Keep `VendorAccessGate` and the existing `ml-56` layout. Place `VendorHeader` above the existing content container so all Vendor routes receive the bell without per-page edits.

- [ ] **Step 3: Add the full Vendor notification page**

Use categories `All`, `Unread`, `Orders`, `Bookings`, `Products`, `Wallet`, and `Account`; pass `scope="vendor"`, `vendorId`, and `pageSize={15}`. Display a clear empty state and preserve the latest-first pagination contract.

- [ ] **Step 4: Run TypeScript and route smoke checks**

Run: `npx tsc --noEmit` and `npm run lint`.

Expected: zero TypeScript errors and no new lint errors.

- [ ] **Step 5: Commit Vendor UI**

```bash
git add components/layout/vendor-header.tsx components/layout/vendor-sidebar.tsx app/vendor/layout.tsx app/vendor/notifications/page.tsx
git commit -m "feat: add vendor notification header and page"
```

### Task 6: Wire all required event producers

**Files:**
- Modify the event route files listed in the File Map.
- Create: `lib/vendor-notifications/__tests__/event-matrix.test.ts`

**Interfaces:**

Use `emitVendorNotification({ eventKey, vendorId, outletId, audience, category, type, title, body, link, email, reference, metadata })` after each successful database mutation, never before it.

- [ ] **Step 1: Write the event-matrix tests**

Test the following exact policy:

| Event | Audience | Category | Email |
| --- | --- | --- | --- |
| New order | owner + assigned outlet | `vendor_orders` | yes |
| Order cancelled/refunded | owner + assigned outlet | `vendor_orders` | yes |
| New booking/cancel/check-in | owner + assigned outlet | `vendor_bookings` | no for ordinary booking/check-in; yes for cancellation |
| Listing approved/rejected | owner | `vendor_products` | yes |
| Customer message | owner + assigned conversation | `vendor_orders` | no |
| Wallet settlement/payout | owner | `vendor_wallet` | yes |
| Vendor approved/suspended | owner | `vendor_account` | yes |
| Manager permission changed | owner + affected manager | `vendor_account` | yes |

- [ ] **Step 2: Run the matrix test before wiring and confirm missing calls**

Run: `npx vitest run lib/vendor-notifications/__tests__/event-matrix.test.ts`

Expected: FAIL because the listed producers do not yet call the emitter.

- [ ] **Step 3: Wire order, refund, booking, and check-in mutations**

Use the persisted `order_items.vendor_id/outlet_id`, booking slot outlet, or route vendor scope to build the event. Use entity-specific keys such as `order:paid:<orderId>` and `booking:checkin:<bookingId>`; never use a shared key for multiple recipients.

- [ ] **Step 4: Wire product review and vendor/account events**

Call the emitter after catalogue review approval/rejection, vendor approval/suspension, and outlet-manager grant/revoke. Permission changes notify the affected manager and owner; no customer receives these rows.

- [ ] **Step 5: Wire wallet settlement/payout events**

Add vendor-owner notifications at the existing Stripe Connect webhook and wallet settlement success/failure paths. Include only sanitized status, amount, and a short reference; do not expose bank details, identity documents, or full Stripe IDs.

- [ ] **Step 6: Wire customer-message notification without email duplication**

Use the existing vendor inbox recipient resolution for an App-only `vendor_message` row. Do not add a second chat badge or send email for each message.

- [ ] **Step 7: Run unit tests and inspect duplicate behavior**

Run: `npx vitest run lib/vendor-notifications/__tests__/event-matrix.test.ts lib/vendor-notifications/__tests__/emit.test.ts`.

Expected: PASS; replaying the same webhook or route mutation produces one row and one email event per recipient.

- [ ] **Step 8: Commit event wiring**

```bash
git add app/api lib/vendor-notifications
git commit -m "feat: emit scoped vendor business notifications"
```

### Task 7: Add Playwright coverage for Vendor Owner and Outlet Manager

**Files:**
- Create: `tests/e2e/vendor-notifications.spec.ts`
- Modify: `playwright.config.ts` only if the existing setup needs a stable Vendor demo seed; do not change the Customer webServer settings.

- [ ] **Step 1: Write the browser tests**

Use seeded/demo sessions or route mocks, matching existing `tests/e2e/wallet-governance.spec.ts` conventions. Cover:

```ts
test('Vendor Owner sees bell, newest 15 rows, filters, and mark all', async ({ page }) => {
  await page.goto('/vendor/dashboard');
  await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page.getByText('Notifications')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeVisible();
  await page.getByRole('link', { name: 'View all notifications' }).click();
  await expect(page).toHaveURL(/\/vendor\/notifications/);
});

test('Outlet Manager cannot see owner wallet/account notifications', async ({ page }) => {
  await page.goto('/vendor/notifications');
  await expect(page.getByText('Wallet settlement')).toHaveCount(0);
  await expect(page.getByText('Outlet order')).toBeVisible();
});
```

Add assertions for 15-row rendering, Orders/Wallet filters, mark-one, pagination, and an email outbox request for a high-priority event. Add a cross-vendor URL/API check that returns `403` or an empty scoped feed without exposing notification existence.

- [ ] **Step 2: Run the focused browser suite**

Run: `npx playwright test tests/e2e/vendor-notifications.spec.ts --workers=1`

Expected: all Vendor notification tests pass.

- [ ] **Step 3: Run the regression suites**

Run:

```bash
npx vitest run
npx playwright test --workers=1
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: no new failures; existing Customer notification, Guest, wallet, KYC, and Support tests remain green.

- [ ] **Step 4: Commit E2E coverage**

```bash
git add tests/e2e/vendor-notifications.spec.ts playwright.config.ts
git commit -m "test: cover vendor notification center"
```

### Task 8: Apply, verify, and hand off

- [ ] **Step 1: Apply migration 080 to the same Supabase project used by the app**

Run the SQL Editor migration and then:

```sql
SELECT event_key, vendor_id, outlet_id, audience_role, category
FROM public.notifications
WHERE vendor_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 15;
```

- [ ] **Step 2: Verify role isolation manually**

1. Sign in as Vendor Owner, open the bell, and confirm Wallet/Account events appear.
2. Sign in as Outlet Manager, open the bell, and confirm only assigned-outlet Orders/Bookings/Products appear.
3. Change the URL `vendorId` to another vendor and confirm the API returns `403`.
4. Trigger a high-priority order or payout event and confirm one in-app row plus one email outbox row.
5. Trigger a chat message and confirm it appears in Inbox/chat badge without an email outbox row.

- [ ] **Step 3: Record final verification output before claiming completion**

Save the command results for Vitest, Playwright, TypeScript, lint, and `git diff --check`; do not report the feature as complete if any required command is failing.
