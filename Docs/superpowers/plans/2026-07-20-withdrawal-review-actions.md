# Withdrawal Review Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve action button hierarchy and title-case status labels in the withdrawal review drawer.

**Architecture:** Keep the existing `Button` component and action handlers. Add explicit visual classes at the call site and a small formatter for display-only status text.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind utility classes, Vitest.

## Global Constraints

- Modify only the withdrawal review UI and its focused test.
- Do not change API, RPC, validation, permissions, or database behavior.

### Task 1: Update review drawer presentation

**Files:**
- Modify: `app/admin/withdrawals/page.tsx`
- Test: `app/admin/withdrawals/__tests__/page.contract.test.ts`

- [ ] Add a display-only title-case helper and explicit classes for Hold and Reject.
- [ ] Render App KYC and Risk values through the helper.
- [ ] Run the focused contract test, then the full test suite and TypeScript check.
