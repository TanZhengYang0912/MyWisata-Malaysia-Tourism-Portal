# Activity Booking Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make the activity-detail booking flow visible earlier on desktop by pairing a shorter hero image with an upper-aligned sticky booking card, while preserving the mobile bottom CTA.

**Architecture:** Keep the existing activity-detail component and booking state unchanged. Recompose only its desktop presentation: place the hero media and activity information in the left column, place the booking card in the right column starting at the same top edge, and keep the existing mobile fixed CTA for small screens.

**Tech Stack:** Next.js, React, Tailwind CSS utility classes, Vitest.

## Global Constraints

- Do not change cart, booking, slot-selection, quantity, or authentication behavior.
- Keep the desktop booking sequence as package → time slot → quantity → Add to Cart.
- Keep the mobile fixed bottom CTA and its existing disabled-state behavior.
- Do not add dependencies or expose environment values.

### Task 1: Recompose the activity-detail desktop layout

**Files:**
- Modify: `app/customer/activity/[id]/activity-detail-client.tsx`

**Interfaces:**
- Consumes: Existing `activity`, `slots`, `price`, `handleAddToCart`, and booking state.
- Produces: A desktop two-column layout with the hero/content on the left and the sticky booking card on the right.

- [ ] **Step 1: Move the hero into the left content column.**

  Wrap the hero image and existing detail/map section in the left side of the desktop grid. Keep the image `object-cover`, reduce its desktop height, and preserve the verified-vendor badge.

- [ ] **Step 2: Place the booking card at the top of the right column.**

  Keep the existing booking-card controls and handlers, but render the card alongside the hero instead of after the full-width hero. Use a fixed-width desktop column around 360–390px and `lg:sticky lg:top-24`.

- [ ] **Step 3: Preserve responsive behavior.**

  Use a single-column mobile layout. Hide the desktop booking card on small screens only if necessary to avoid duplicating the CTA, and preserve the current fixed bottom mobile button and its booking-slot disabled state.

### Task 2: Verify the visual and functional contract

**Files:**
- Test: Existing Vitest suite.
- Inspect: `app/customer/activity/[id]/activity-detail-client.tsx`

**Interfaces:**
- Consumes: The updated JSX and existing test configuration.
- Produces: A clean test run and a diff limited to the layout change.

- [ ] **Step 1: Run the full test suite.**

  Run `npm test`. Expected: all existing tests pass with no new failures.

- [ ] **Step 2: Run the whitespace check.**

  Run `git diff --check`. Expected: no whitespace errors in the layout change.

- [ ] **Step 3: Review the final diff.**

  Run `git diff -- app/customer/activity/[id]/activity-detail-client.tsx`. Confirm that booking handlers, slot selection, quantity logic, and mobile CTA behavior are unchanged.
