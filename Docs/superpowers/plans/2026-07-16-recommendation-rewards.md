# Recommendation Reward Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recommendation rewards end-to-end: an Admin links an approved recommendation to a Vendor, qualifying paid orders automatically create RM50/3% pending rewards, and a seven-day hold clears rewards only for KYC-approved users.

**Architecture:** Keep the existing Admin conversion RPC and commission-rule data. Add a server-only recommendation reward attribution function, call it from the server-side paid-order hook alongside affiliate attribution, and use one scheduled/admin clearing route to transition pending recommendation commissions to withdrawable wallet earnings. Events create notifications and email-outbox rows without allowing Admins to enter arbitrary rewards.

**Tech Stack:** Next.js Route Handlers, TypeScript, Supabase service client/RPC, wallet ledger, notification and email outbox, Vitest.

## Global Constraints

- First eligible sale: RM50; later eligible sales during the conversion window: 3%.
- `recommendation_commissions` and wallet transactions must be idempotent per conversion/order.
- Rewards enter Pending for exactly seven days; cancelled/refunded orders are reversed before clearing.
- KYC is required to clear to available earnings, not to record the pending reward.
- No Admin route may choose or overwrite a reward amount.

---

### Task 1: Define the order-to-recommendation reward service

**Files:**
- Create: `lib/recommendations/reward-attribution.ts`
- Create: `lib/recommendations/__tests__/reward-attribution.test.ts`
- Modify: `backend/core/types.ts` only if a reward DTO is required by a page.

**Interfaces:**
- Produces `attributeRecommendationReward(service, orderId): Promise<RewardAttributionResult>`.
- Result is `created | skipped | reversed` and never exposes wallet internals to callers.

- [ ] **Step 1: Write failing service tests**

```ts
it('creates one RM50 pending bonus for the converted vendor first paid order', async () => {
  seedConvertedVendorAndPaidOrder();
  await expect(attributeRecommendationReward(service, orderId)).resolves.toMatchObject({ kind: 'created', commissionType: 'bonus', amountSen: 5000 });
});
it('does not duplicate the same order reward', async () => {
  await attributeRecommendationReward(service, orderId);
  await expect(attributeRecommendationReward(service, orderId)).resolves.toMatchObject({ kind: 'skipped', reason: 'already_attributed' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run lib/recommendations/__tests__/reward-attribution.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the service**

Read the paid order's vendor IDs through its order items, find the matching active `recommendation_conversions`, read the existing `Recommendation Standard` rule, and call existing `credit_pending_recommendation` through the service client. Use bonus only when `first_sale_awarded_at` is null; otherwise calculate `round(orderTotalSen * 0.03)`. Treat unique-index conflict as `already_attributed`, never as a second wallet credit.

- [ ] **Step 4: Verify**

Run: `npm test -- --run lib/recommendations/__tests__/reward-attribution.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/recommendations/reward-attribution.ts lib/recommendations/__tests__/reward-attribution.test.ts backend/core/types.ts
git commit -m "feat: attribute pending recommendation rewards"
```

### Task 2: Wire the service into the paid-order path and notify the recommender

**Files:**
- Modify: `app/api/checkout/attribute/route.ts`
- Modify: `lib/email/events.ts`
- Modify: `lib/email/templates.ts`
- Test: `app/api/checkout/attribute/__tests__/route.test.ts`, `lib/email/__tests__/recommendation-reward.test.ts`

- [ ] **Step 1: Write failing integration tests**

```ts
it('attributes affiliate and recommendation rewards after verifying order ownership', async () => {
  const response = await POST(ownedPaidOrderRequest());
  expect(response.status).toBe(200);
  expect(mockRecommendationReward).toHaveBeenCalledWith(expect.anything(), orderId);
});
it('renders a pending reward email without exposing buyer data', () => {
  expect(renderRecommendationPendingEmail({ amountRm: 50, vendorName: 'Sample Vendor' })).toContain('RM50.00');
  expect(renderRecommendationPendingEmail({ amountRm: 50, vendorName: 'Sample Vendor' })).not.toContain('buyer@example.com');
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run app/api/checkout/attribute/__tests__/route.test.ts lib/email/__tests__/recommendation-reward.test.ts`

Expected: FAIL because the hook only calls affiliate attribution.

- [ ] **Step 3: Implement non-blocking wiring**

After `onOrderPaid(orderId)`, call `attributeRecommendationReward(service, orderId)`. Attribute failures must log but must not turn a successful payment into a failed checkout. For `created`, insert the existing-style in-app notification and email outbox event with title `Your recommendation earned a pending reward`; no buyer name, email, or order details go into the message.

- [ ] **Step 4: Verify**

Run: `npm test -- --run app/api/checkout/attribute/__tests__/route.test.ts lib/email/__tests__/recommendation-reward.test.ts && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/checkout/attribute/route.ts lib/email/events.ts lib/email/templates.ts app/api/checkout/attribute/__tests__/route.test.ts lib/email/__tests__/recommendation-reward.test.ts
git commit -m "feat: notify users of pending recommendation rewards"
```

### Task 3: Clear or reverse pending rewards safely

**Files:**
- Create: `lib/recommendations/reward-clearing.ts`
- Create: `app/api/admin/recommendations/run-clearing/route.ts`
- Modify: `app/admin/recommendations/page.tsx`
- Test: `lib/recommendations/__tests__/reward-clearing.test.ts`, `app/api/admin/recommendations/run-clearing/__tests__/route.test.ts`

- [ ] **Step 1: Write failing clearing tests**

```ts
it('clears a seven-day pending commission only when recommender KYC is approved', async () => {
  seedPendingCommission({ createdAt: eightDaysAgo, recommenderTier: 'kyc_verified', kycStatus: 'approved' });
  await expect(clearMaturedRecommendationRewards(service)).resolves.toMatchObject({ cleared: [{ amountSen: 5000 }] });
});
it('keeps the reward pending when KYC is not approved', async () => {
  seedPendingCommission({ createdAt: eightDaysAgo, recommenderTier: 'profile_complete', kycStatus: 'unverified' });
  await expect(clearMaturedRecommendationRewards(service)).resolves.toMatchObject({ skipped: 1 });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run lib/recommendations/__tests__/reward-clearing.test.ts app/api/admin/recommendations/run-clearing/__tests__/route.test.ts`

Expected: FAIL because no recommendation clearing function exists.

- [ ] **Step 3: Implement the atomic clearing policy**

For each due commission, atomically claim only `status='pending'`; if source order is cancelled/refunded, set `status='reversed'` without wallet credit. If the recommender is not KYC approved, leave it pending. Otherwise transfer the exact pending amount to `earnings_sen`, write one wallet transaction, set `status='cleared'`, send in-app/email `Your reward is now available`, and never clear twice.

The route must require Admin / Super Admin, use the service client only after role verification, and return aggregate counts. Add a clear `Run reward clearing` action to the existing Admin Recommendations page; it cannot accept an amount or user ID.

- [ ] **Step 4: Verify**

Run: `npm test -- --run lib/recommendations/__tests__/reward-clearing.test.ts app/api/admin/recommendations/run-clearing/__tests__/route.test.ts && npx eslint app/admin/recommendations/page.tsx app/api/admin/recommendations/run-clearing/route.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/recommendations/reward-clearing.ts app/api/admin/recommendations/run-clearing/route.ts app/admin/recommendations/page.tsx lib/recommendations/__tests__/reward-clearing.test.ts app/api/admin/recommendations/run-clearing/__tests__/route.test.ts
git commit -m "feat: clear recommendation rewards after hold period"
```

### Task 4: Present pending versus available recommendation earnings

**Files:**
- Modify: `app/customer/wallet/page.tsx`
- Modify: the wallet summary route or domain reader currently used by that page
- Test: `app/customer/wallet/__tests__/recommendation-rewards.test.tsx`

- [ ] **Step 1: Write a failing wallet display test**

```tsx
it('separates pending rewards from available earnings', async () => {
  render(<WalletPage summary={{ pendingEarningsSen: 5000, earningsSen: 12000 }} />);
  expect(screen.getByText('Pending rewards')).toBeVisible();
  expect(screen.getByText('RM50.00')).toBeVisible();
  expect(screen.getByText('Available earnings')).toBeVisible();
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -- --run app/customer/wallet/__tests__/recommendation-rewards.test.tsx`

Expected: FAIL because the wallet does not label the two states distinctly.

- [ ] **Step 3: Implement presentation only**

Use existing `pending_earnings_sen` and `earnings_sen`; show `Pending rewards — available after the 7-day hold and KYC approval` separately from `Available earnings — eligible for withdrawal`. Do not change withdrawal calculation: it must remain based on available `earnings_sen` only.

- [ ] **Step 4: Run full verification**

Run: `npm test -- --run && npx tsc --noEmit`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/customer/wallet/page.tsx app/customer/wallet/__tests__/recommendation-rewards.test.tsx
git commit -m "feat: distinguish pending and available recommendation rewards"
```
