# Action Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every user-facing create, update, delete, submit, approval, and fulfilment action show an explicit success or failure result instead of relying on refreshes or modal closure.

**Architecture:** Add a small client-side `ActionFeedbackProvider` at the root layout with an accessible toast stack and a `useActionFeedback` hook. Mutation handlers will check the API response, call `showFeedback` with an action-specific message, and only then refresh or close their current panel. Existing inline form errors and batch messages remain supported during migration.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- Do not change Supabase schema or delete existing Supabase data.
- Do not replace refreshes; refreshes remain after feedback and successful mutation handling.
- Failed API responses and network exceptions must become visible to the user.
- Toasts must expose `role="status"` for success/info and `role="alert"` for errors.
- Preserve existing dirty worktree changes and do not commit unless explicitly requested.

---

### Task 1: Shared feedback state and accessible toast UI

**Files:**
- Create: `lib/feedback/action-feedback.ts`
- Test: `lib/feedback/__tests__/action-feedback.test.ts`
- Create: `components/providers/action-feedback.tsx`
- Modify: `app/layout.tsx`

- [ ] Write reducer tests for adding and removing notices.
- [ ] Run the focused Vitest test and verify it fails because the reducer does not exist.
- [ ] Implement the notice types, reducer, ID generation, provider, hook, and fixed toast stack.
- [ ] Run the focused test and verify it passes.
- [ ] Wrap the existing AuthProvider and CartProvider with ActionFeedbackProvider.

### Task 2: Vendor CRUD and inventory actions

**Files:**
- Modify: `app/vendor/products/page.tsx`
- Modify: `components/vendor/product-form.tsx`
- Modify: `app/vendor/outlets/page.tsx`
- Modify: `components/vendor/outlet-form.tsx`
- Modify: `app/vendor/vouchers/page.tsx`
- Modify: `components/vendor/voucher-form.tsx`
- Modify: `app/vendor/bookings/page.tsx`
- Modify: `components/vendor/slot-form.tsx`
- Modify: `app/vendor/orders/page.tsx`
- Modify: `components/vendor/order-quick-action.tsx`
- Modify: `components/vendor/variant-manager.tsx`
- Modify: `components/vendor/price-rule-manager.tsx`
- Modify: `components/vendor/register-vendor-form.tsx`
- Modify: `app/vendor/inbox/page.tsx`

- [ ] Add explicit success messages for create/edit/submit/archive/restore/close/toggle/check-in/fulfil actions.
- [ ] Add response and network failure handling where currently absent.
- [ ] Keep existing batch, profile, page-builder, and outlet-manager feedback behavior intact.

### Task 3: Customer and admin actions

**Files:**
- Modify: `app/customer/affiliate/page.tsx`
- Modify: `app/customer/recommendations/page.tsx`
- Modify: `app/customer/support/[id]/page.tsx`
- Modify: `app/admin/catalogue/page.tsx`
- Modify: `app/admin/recommendations/page.tsx`
- Modify: `app/admin/kyc/page.tsx`
- Modify: `app/admin/support/page.tsx`
- Modify: `app/admin/chatbot/page.tsx`
- Modify: `app/admin/affiliate/page.tsx`
- Modify: `app/admin/withdrawals/page.tsx`

- [ ] Add success feedback to submit, review, approve, reject, reopen, reply, save, activate, and withdrawal actions.
- [ ] Convert silent or ignored mutation failures into visible feedback.
- [ ] Preserve existing result panels for fraud sweep, clearing, and KYC status.

### Task 4: Verification

- [ ] Run all Vitest tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Re-scan mutation handlers to confirm no targeted action only refreshes without feedback.
