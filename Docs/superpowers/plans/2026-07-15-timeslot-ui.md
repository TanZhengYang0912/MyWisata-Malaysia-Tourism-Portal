# Timeslot Booking UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Replace the crowded booking-slot pills with a date-first, time-grid selector that is easier to scan on mobile and desktop.

**Architecture:** Extract pure date grouping, preview selection, and label formatting into a small customer booking helper so the UI behavior is deterministic and testable. Keep selection state in `ActivityDetailClient`, using up to three date buttons plus a native calendar picker and a two-column time grid for the currently selected date.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest.

## Global Constraints

- Preserve existing cart and slot-selection behavior.
- Do not change Supabase schema or booking APIs.
- Keep full slots visible but disabled, labelled `Fully booked`.
- Move the validation message directly below the time selector.
- Do not modify unrelated pre-existing working-tree changes.

---

### Task 1: Add testable slot presentation helpers

**Files:**
- Create: `lib/customer/booking-slot-presenter.ts`
- Create: `lib/customer/__tests__/booking-slot-presenter.test.ts`

**Interfaces:**
- `groupBookingSlotsByDate(slots: BookingSlot[]): Array<{ key: string; label: string; slots: BookingSlot[] }>` groups slots by local calendar date in input order.
- `getBookingDatePreview(groups, activeKey, limit = 3)` returns the first three date groups, replacing the last preview slot with a calendar-selected date when necessary.
- `formatBookingSlotTime(startsAt: string): string` returns a compact localized time such as `10:00 am`.
- `formatBookingSlotDate(startsAt: string): string` returns a date-rail label such as `Thu, 10 Jul`.

- [ ] **Step 1: Write failing tests** for date grouping, stable ordering, date labels, and time labels.
- [ ] **Step 2: Run `npx vitest run lib/customer/__tests__/booking-slot-presenter.test.ts` and confirm it fails because the helper does not exist.**
- [ ] **Step 3: Implement the helper with `Intl.DateTimeFormat("en-MY", ...)` and preserve the original slot order inside each date group.**
- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 2: Replace the timeslot selector layout

**Files:**
- Modify: `app/customer/activity/[id]/activity-detail-client.tsx`

**Interfaces:**
- Consume `groupBookingSlotsByDate`, `formatBookingSlotDate`, and `formatBookingSlotTime` from the presenter helper.
- Maintain `slotId` as the selected booking slot ID and reset it when the selected date changes.

- [ ] **Step 1: Add selected-date state derived from the first available date group.**
- [ ] **Step 2: Render at most three date buttons and a `Calendar` picker when more dates are available; keep a calendar-selected date visible in the preview.**
- [ ] **Step 3: Render the selected date's slots in a fixed two-column grid; show time on the first line and availability on the second line.**
- [ ] **Step 4: Add `aria-pressed`, explicit button types, selected styling, and a disabled `Fully booked` state.**
- [ ] **Step 5: Move `Select a time slot to continue.` immediately below the selector and change the label to `Choose a date and time`.**
- [ ] **Step 6: Run the focused presenter test and TypeScript check.**

### Task 3: Verify the complete change

**Files:**
- No additional files.

- [ ] **Step 1: Run `npm test`.**
- [ ] **Step 2: Run `npx tsc --noEmit`.**
- [ ] **Step 3: Run `npm run build`.**
- [ ] **Step 4: Run `git diff --check` and inspect the working-tree diff to confirm unrelated changes were preserved.**
