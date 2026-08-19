# Customer account page alignment design

## Context

Customer pages currently use two different horizontal anchors. The customer navigation establishes a wide `max-w-7xl` grid: the page title should align with the MyWisata brand, while the primary content should use the narrower `max-w-5xl` account shell so its padded content aligns visually with the Home navigation item. Profile already demonstrates this relationship. Other account destinations either keep both title and content in the narrow shell, or, in the Activity calendar, keep both in the wide shell.

## Scope

Apply the two-anchor layout to:

- My Activity itinerary and orders views
- Profile
- Notifications
- Preferences
- Wallet
- Verification
- Support
- Earn & Share
- Become a Vendor
- Recommend a Vendor

`/customer/vouchers` is explicitly excluded and must remain unchanged.

Detail pages, checkout flows, catalogue pages, vendor pages, and other routes that are not direct destinations in the referenced account menu are out of scope.

## Design decision

Add one shared wide-title primitive beside `CustomerPageShell`:

- The title wrapper uses the navigation grid: `mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10`.
- It renders the existing `CustomerPageHeader`, preserving current typography, eyebrow, icon, description, actions, and spacing.
- Primary page content remains inside `CustomerPageShell` (`max-w-5xl`) with its top padding removed after the separate title.

This makes the layout contract explicit:

1. The title group's left edge aligns with MyWisata.
2. The padded content inside the narrow body aligns visually with Home.
3. Switching between Activity itinerary and orders does not change the horizontal anchors.

## Page behavior

- Profile replaces its local title wrapper with the shared primitive; the visual result stays the same.
- Notifications, Preferences, Wallet, Verification, Support, Earn & Share, and Recommend a Vendor move only their `CustomerPageHeader` out of the narrow body shell.
- Become a Vendor moves its header to the wide title area in both the new-application and existing-application states. Back navigation, status panels, and forms remain in the narrow body.
- Activity itinerary keeps its title in the wide grid and moves the calendar into the narrow body.
- Activity orders keeps its title and title actions in the wide grid and moves summary, filters, and order results into the narrow body.
- Loading, guest, empty, and error behavior remains functionally unchanged. Where a loaded page exposes the standard title, its successful state follows the two-anchor layout.

## Scope boundaries

- No business logic, data loading, translations, permissions, or routing changes.
- No visual token, typography, color, border, radius, or responsive-breakpoint changes.
- No new dependency or database change.
- No changes to My Vouchers.
- No unrelated refactors.

## Verification

- Add focused source-level tests for the shared title primitive and each migrated route.
- Update the existing Profile alignment test to assert use of the shared primitive.
- Run the affected Vitest files, ESLint, and TypeScript.
- Capture the same desktop pages after implementation and compare the title/body anchors against the current audit:
  - title aligned with MyWisata
  - narrow body content aligned visually with Home
  - My Vouchers unchanged

## Risks

- Splitting the title and body can accidentally double the vertical gap; body shells must use `pt-0 sm:pt-0`.
- Become a Vendor has two render branches and requires both to follow the same title/body split.
- Activity itinerary and orders use custom page markup; both must be migrated together to avoid tab-to-tab layout shift.
