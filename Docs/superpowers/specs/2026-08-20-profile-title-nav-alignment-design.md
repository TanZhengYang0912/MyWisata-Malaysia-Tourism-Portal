# Profile Title Navigation Alignment Design

Status: Approved design, awaiting implementation

## Context

The customer navigation bar centers its content in a `max-w-7xl` container with `px-4 sm:px-6`. The customer profile page centers its title and content together in the shared `max-w-5xl` page shell. On desktop and wide screens, the profile title group therefore begins farther right than the `MyWisata` brand.

The requested change applies only to the three-line title group:

- `ACCOUNT`
- `Your profile`
- `Manage your personal information, verification and preferences.`

The profile-completion status, progress card, profile sections, and account menu must keep their current positions and widths.

## Chosen Design

Render the profile title group in a dedicated profile-only wrapper that uses the same horizontal container contract as the customer navigation:

- `mx-auto w-full max-w-7xl`
- `px-4 sm:px-6`
- the existing profile page top spacing

Render the remaining profile content in the existing `CustomerPageShell`, preserving its `max-w-5xl` width and current responsive padding.

Apply the same title wrapper to both profile states:

1. Completed-profile view using the `Your profile` title.
2. Incomplete onboarding/wizard view using the profile-completion title.

The shared `CustomerPageHeader` typography, translations, spacing within the title group, and accessibility semantics remain unchanged.

## Alternatives Rejected

### Negative margin or translation

Moving only the header with a hard-coded negative margin would be a smaller textual change, but the offset would depend on viewport width and the difference between two centered max-width containers. It would be brittle across breakpoints.

### Widen the whole profile page

Changing `CustomerPageShell` or the full profile page to `max-w-7xl` would align the title, but it would also move and stretch the progress and profile cards. That conflicts with the approved scope and could affect other customer pages if the shared shell changed.

## Files and Boundaries

Expected implementation files:

- `app/customer/profile/page.tsx`: separate the title group from the existing narrow content shell in both profile states.
- `app/customer/profile/__tests__/profile-title-alignment.test.ts`: lock down the navigation-aligned title wrapper and narrow body shell contract.

Files not to modify:

- `app/customer/layout.tsx`
- `components/customer/customer-page-shell.tsx`
- Profile translations and copy
- Profile cards and section components
- Other customer pages

New dependencies: none.

Database changes: none.

## Responsive Behavior

- Mobile: the title remains at the existing `px-4` edge, matching the mobile navigation.
- Small and larger screens: the title uses `px-6`, matching the navigation brand.
- Wide screens: the title aligns to the left edge of the centered `max-w-7xl` navigation container.
- The body remains centered at `max-w-5xl` at every breakpoint.

## Verification

1. Add a source-level regression test that fails while the profile title remains inside the narrow body shell.
2. Move only the title group into the navigation-aligned wrapper and confirm the focused test passes.
3. Run the existing profile tests.
4. Run TypeScript, lint, and `git diff --check`.
5. Verify the final diff changes no shared navigation or customer-shell code.
