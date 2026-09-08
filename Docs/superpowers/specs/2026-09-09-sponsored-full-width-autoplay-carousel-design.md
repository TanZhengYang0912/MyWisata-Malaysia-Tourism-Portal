# Sponsored Full-Width Autoplay Carousel Design

## Context

The Partners page currently renders approved Sponsored placements as a horizontally scrollable row of multiple name-card-sized items. The customer must manually scroll or use the navigation buttons, and the browser scrollbar remains visible. The desired experience is a promotional banner: one advertisement fills the available page content width, advances automatically, loops forever, and still allows direct previous/next navigation.

## Decisions

- Show exactly one Sponsored placement at a time in a full-width banner inside the existing Partners page content boundary.
- Advance to the next eligible advertisement every three seconds.
- Loop in both directions: next from the final advertisement opens the first; previous from the first opens the final.
- Keep visible previous and next buttons over the banner edges. Manual navigation resets the three-second interval.
- Pause autoplay while the pointer is over the carousel, while keyboard focus is inside it, or while the document is hidden. Resume after those conditions clear.
- Disable autoplay when the customer requests reduced motion through the operating-system/browser preference. Manual controls remain available.
- Use a restrained slide-and-fade transition implemented with existing React and Tailwind capabilities; add no carousel dependency.
- Render the existing Sponsored label, image, category, name, description, vendor, location, price, and detail link.
- On desktop, use a landscape split layout with the image and content sharing the full banner width. On narrow screens, stack image above content.
- Remove the horizontal scrollbar and multi-card viewport from this component.
- Keep the existing behavior that hides the entire section when no eligible advertisements exist.
- Keep the current filtering, safe Sponsored placement RPC, event endpoint, and database model unchanged.

## Component Architecture

`SponsoredPartnerRail` remains the public component name to avoid unnecessary caller changes, but its internal presentation becomes a single-slide carousel.

It owns:

- `activeIndex`, initialized to zero and normalized when the advertisement list changes;
- pause state for pointer and focus interaction;
- a three-second timer active only when multiple advertisements exist and autoplay is allowed;
- circular `showPrevious` and `showNext` actions;
- the current placement's rendering and analytics.

Only the active advertisement is rendered as an article. This keeps keyboard navigation, screen-reader content, and impression tracking aligned with what the customer can actually see. The existing event payload remains `{ eventType, productId }` and contains no new metadata.

## Interaction and Accessibility

- Previous and next controls are always enabled when two or more advertisements exist and are hidden when there is only one.
- Buttons receive the existing translated accessible names.
- Pointer entry pauses autoplay; pointer exit resumes it.
- Focus entering any carousel control or link pauses autoplay; focus leaving the carousel resumes it.
- `document.visibilityState !== "visible"` pauses autoplay.
- `prefers-reduced-motion: reduce` prevents timer creation and removes nonessential animated movement.
- Manual navigation works even when autoplay is paused or disabled.
- A manual previous/next action starts a fresh three-second interval after the user is no longer interacting with the carousel.

## Data and Error Handling

- The component continues receiving the already filtered `DiscoveryResult[]` from `SearchClient`.
- Empty arrays render nothing.
- If the active placement disappears after filtering, the index returns to the first available advertisement.
- Analytics errors remain non-blocking and never interrupt navigation.
- No database migration, API shape, storage rule, role permission, or Sponsored campaign workflow changes are part of this work.

## Testing

Update the focused component tests to prove:

- empty-state hiding remains intact;
- one active full-width banner is rendered without a horizontal scrollbar;
- the timer moves forward after three seconds and loops from last to first;
- previous and next buttons loop in both directions;
- pointer hover, keyboard focus, document hiding, and reduced-motion preference pause or disable autoplay;
- manual navigation remains available while autoplay is paused;
- only the active placement records one impression per placement per component mount;
- clicks retain the exact existing event payload and activity route.

Run the focused Sponsored carousel, partner-directory, page contract, event API, TypeScript, lint, and diff checks. Finally, verify the live Partners page visually and observe at least one automatic transition plus both manual directions.

## Scope Boundaries

Files expected to change:

- `components/customer/sponsored-partner-rail.tsx`
- `components/customer/__tests__/sponsored-partner-rail.test.tsx`
- the existing implementation plan and design QA evidence if required

Files explicitly not changed:

- Partners data loading and filtering
- Sponsored placement migrations, seed data, RPC, and event API
- vendor cards, featured sorting, pagination, activity detail, checkout, or payment flows
- translations, unless an implementation detail requires a new customer-facing string

New dependencies: none.

Primary risks are timer flakiness, inaccessible motion, duplicate impressions, and a hidden-but-focusable inactive slide. Rendering only the active slide, using fake timers in tests, respecting reduced motion, and retaining the impression de-duplication set address those risks.
