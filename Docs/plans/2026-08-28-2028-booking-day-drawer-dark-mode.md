# Booking Day Drawer Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the customer Day Itinerary dialog follow the active light or dark theme without changing its layout or behavior.

**Architecture:** Keep `BookingDayDrawer` as the single dialog component and replace its light-only Tailwind colors with the application's existing semantic theme tokens. Lock the behavior with the existing source contract test so future changes cannot reintroduce light-only dialog surfaces.

**Tech Stack:** Next.js 16, React, TypeScript, TailwindCSS, Vitest

## Global Constraints

- Modify only the Day Itinerary component and its focused test.
- Preserve the overlay, dialog dimensions, responsive behavior, focus trap, Escape handling, booking links, content, and translations.
- Do not modify `My Activity` or `My Orders` navigation.
- Do not change order, checkout, booking, or calendar data behavior.
- Add no dependencies and make no database or Supabase changes.

## File map

- Modify `components/customer/booking-day-drawer.tsx`: replace light-only surface, border, text, hover, and status colors with semantic tokens.
- Modify `components/customer/__tests__/booking-day-drawer.test.ts`: add the dark-theme regression contract while retaining accessibility and booking-link coverage.
- Files not touched: `lib/customer/header-navigation.ts`, `app/customer/activity/page.tsx`, `app/customer/orders/**`, `app/customer/calendar/page.tsx`, checkout code, migrations, and locale files.

---

### Task 1: Make the Day Itinerary dialog theme-aware

**Files:**
- Modify: `components/customer/booking-day-drawer.tsx:10-106`
- Test: `components/customer/__tests__/booking-day-drawer.test.ts`

**Interfaces:**
- Consumes: existing semantic Tailwind tokens `bg-card`, `bg-secondary`, `text-foreground`, `text-muted-foreground`, `border-border`, and `text-destructive`.
- Produces: the unchanged `BookingDayDrawer` component API with theme-aware visual classes.

- [ ] **Step 1: Write the failing regression test**

Add this test to `components/customer/__tests__/booking-day-drawer.test.ts`:

```ts
it("uses semantic theme tokens instead of light-only dialog colors", () => {
  expect(drawerSource).toContain("bg-card");
  expect(drawerSource).toContain("text-foreground");
  expect(drawerSource).toContain("text-muted-foreground");
  expect(drawerSource).toContain("border-border");
  for (const lightOnlyClass of [
    "bg-white",
    "bg-slate-50/70",
    "text-slate-900",
    "text-slate-800",
    "text-slate-500",
    "text-slate-400",
    "border-slate-100",
    "border-slate-200",
    "bg-red-50",
    "bg-[#FFF4CC]",
    "text-[#7A5A00]",
  ]) {
    expect(drawerSource).not.toContain(lightOnlyClass);
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run components/customer/__tests__/booking-day-drawer.test.ts
```

Expected: FAIL because `BookingDayDrawer` still contains `bg-white`, `text-slate-*`, `border-slate-*`, and light-only status colors.

- [ ] **Step 3: Replace only the dialog's visual color classes**

Update `components/customer/booking-day-drawer.tsx` with these exact semantic mappings:

```ts
function statusClass(status: BookingItineraryGroup["status"]) {
  if (status === "mixed" || status === "cancelled" || status === "no_show") {
    return "bg-destructive/10 text-destructive";
  }
  if (status === "checked_in") {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
  }
  return "bg-secondary text-primary";
}
```

Use these component mappings without altering markup structure:

```text
Dialog surface:       bg-white                 -> bg-card
Header divider:       border-slate-100         -> border-border
Secondary text:       text-slate-500/400       -> text-muted-foreground
Itinerary card:       border-slate-200         -> border-border
Itinerary card fill:  bg-slate-50/70           -> bg-secondary/50
Card hover fill:      hover:bg-white            -> hover:bg-secondary
Primary card text:    text-slate-900/800       -> text-foreground
Booking link:         border-slate-200 bg-white -> border-border bg-card
Internal divider:     border-slate-200         -> border-border
```

Keep the overlay `bg-slate-950/35` because it is a theme-independent backdrop, not a dialog surface.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run components/customer/__tests__/booking-day-drawer.test.ts
```

Expected: all Booking Day Drawer tests PASS.

- [ ] **Step 5: Run final verification**

Run:

```bash
npx tsc --noEmit
npx eslint components/customer/booking-day-drawer.tsx components/customer/__tests__/booking-day-drawer.test.ts
npx vitest run
git diff --check
```

Expected: TypeScript and ESLint complete with zero errors, the full Vitest suite passes, and `git diff --check` reports no whitespace errors.

- [ ] **Step 6: Commit the implementation**

```bash
git add components/customer/booking-day-drawer.tsx components/customer/__tests__/booking-day-drawer.test.ts
git commit -m "fix: theme booking day drawer"
```

## Risks

- Semantic status colors must remain distinguishable in both themes.
- The backdrop must remain dark and translucent; it should not be converted to a card token.
- A broad replacement outside `BookingDayDrawer` would exceed the approved scope.
