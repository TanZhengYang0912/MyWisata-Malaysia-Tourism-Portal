# Booking Day Drawer Dark Mode Design

## Context

The customer booking calendar follows the selected light or dark theme, but the Day Itinerary dialog remains visually light in dark mode. The dialog component hard-codes `bg-white`, `text-slate-*`, and `border-slate-*` classes instead of using the application's semantic theme tokens.

## Decision

Make the existing Day Itinerary dialog theme-aware without changing its layout or behavior:

- Dialog surfaces use `bg-card`.
- Primary text uses `text-foreground`.
- Secondary text uses `text-muted-foreground`.
- Dividers and outlines use `border-border`.
- Nested itinerary cards use `bg-secondary/50`, with theme-aware hover states.
- Booking links use `bg-card` and the existing semantic hover treatment.

The overlay, dimensions, responsive behavior, keyboard focus trap, Escape handling, booking links, status content, and translations remain unchanged.

## Files to modify

- `components/customer/booking-day-drawer.tsx`
- `components/customer/__tests__/booking-day-drawer.test.ts`

## Scope boundaries

- Do not modify `My Activity` navigation.
- Do not add or modify `My Orders` navigation.
- Do not change order, checkout, booking, or calendar data behavior.
- Do not change other dialogs or pages.
- No new dependencies.
- No database or Supabase changes.

## Verification

- Add a regression assertion that rejects light-only surface, border, and text classes in the Day Itinerary component.
- Run the focused Booking Day Drawer test.
- Run TypeScript, ESLint, and the full Vitest suite.
- Confirm the existing accessibility and booking-link contract remains green.

## Risks

- Replacing every `bg-white` mechanically could affect intentional white foreground elements; changes must be limited to dialog surfaces and cards.
- Status pills need sufficient contrast in both themes and should retain their existing semantic meaning.
