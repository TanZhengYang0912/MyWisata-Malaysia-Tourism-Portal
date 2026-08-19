# Shared Customer and Guest Experience Design

Status: Approved, implementation pending

## Context

MyWisata currently implements Guest Mode as a separate `/guest/*` catalogue with a minimal header, while signed-in customers use the richer `/customer/*` experience. The two paths have diverged: Guest pages do not share the Customer homepage, navigation, image fallback, map, vendor presentation, or interaction patterns.

The product decision is that Guest is not a separate experience. An anonymous visitor should see the same Customer interface and may open the entire Customer route space. Identity only changes what data is shown and which actions are permitted.

## Product Decisions

1. `/customer` becomes the canonical experience for anonymous visitors and registered customers.
2. Guest visitors may open Customer navigation destinations, including account-oriented pages. Pages that require identity render explicit safe empty states instead of redirecting at the layout boundary.
3. Guest visitors never receive a fabricated user, wallet, order, cart, or chat identity. Empty UI is presentation only; no private data request is made without a real authenticated user.
4. Public browsing and private mutations are separate capabilities. Vendor, listing, outlet, destination, search, Explore, and Map content remain publicly readable. Booking, purchase, recommendation, affiliate, and withdrawal actions are tier-gated.
5. Existing API authentication, Supabase RLS, and database tier guards remain authoritative and must not be weakened to support Guest UI.
6. Legacy `/guest/*` URLs redirect to their canonical `/customer/*` equivalents, preserving safe return targets.

## Verification Tiers and Capabilities

| Viewer level | Allowed capabilities | Blocked capabilities and next step |
|---|---|---|
| Guest | Browse Vendor, Listing, Outlet, destination, Explore, Map, and public search | Booking, purchase, account mutations, recommendation, affiliate, and withdrawal require Sign in or Register |
| Email Verified | Sign in, browse, view owned account data, build a cart and prepare checkout | Completing checkout requires Phone Verification; recommendation, affiliate, and withdrawal remain blocked |
| Phone Verified | Browse, booking, purchase, checkout, and basic AI recommendation | Recommendation submission and affiliate features require Profile Completion; withdrawal requires KYC |
| Profile Complete | Submit Recommendation and generate a Limited Affiliate Link | Full affiliate earning tier and withdrawal require KYC |
| KYC Verified | Full affiliate tier, earn commission, and request withdrawal | Withdrawal still requires Admin Approval and payout-provider eligibility |

`lib/constants.ts`, `REQUIRED_TIER`, and `meetsMinTier()` remain the tier vocabulary. A capability layer maps user-facing actions to these existing minimum tiers instead of duplicating string comparisons throughout components.

## Route and Layout Architecture

### Canonical routes

Publicly renderable Customer routes include:

- `/customer`
- `/customer/search`
- `/customer/explore`
- `/customer/map`
- `/customer/vendor/[vendorId]`
- `/customer/outlet/[outletId]`
- `/customer/activity/[id]`

Account-oriented Customer routes remain addressable by Guest visitors but render anonymous empty states until authentication:

- Cart, Saved, Chat, Notifications, My Activity, Calendar, Orders, Wallet, Profile, Preferences, Support, Affiliate, Recommendations, and KYC.

This does not make their data public. Server and client code must resolve authentication before performing any user-owned query.

### Legacy Guest routes

- `/guest/explore` redirects to `/customer`.
- `/guest/activity/[id]` redirects to `/customer/activity/[id]` while retaining safe query context.
- `/guest/vendor/[vendorId]` redirects to `/customer/vendor/[vendorId]`.
- The login-page Guest Mode action signs the current session out and sends the visitor to `/customer`.

### Shared Customer shell

The Customer shell no longer uses `useRequireRole(["customer"])` as a whole-layout gate. It uses optional authentication and has two header states:

- Authenticated Customer: existing notification, cart counts, avatar, name, and account menu.
- Guest: identical navigation and spacing, zero badges, a `Guest` identity indicator, and `Sign in` / `Register` actions.

Polling, realtime subscriptions, cart hydration, wishlist hydration, and trip persistence only start when a real authenticated user exists.

## Anonymous Empty States

Guest visitors may navigate to account pages without an immediate redirect. Each page uses a consistent anonymous empty-state component with the page's normal visual structure, zero or empty values, and a clear explanation that signing in reveals real account data.

Examples:

- Wallet: `RM 0.00`, no transactions, Top Up and Withdraw actions gated by authentication.
- Orders and My Activity: zero count and empty history.
- Chat and Notifications: empty inbox/feed.
- Saved and Cart: empty collection.
- Profile, Preferences, Support, Affiliate, Recommendations, and KYC: an empty introductory state with the appropriate Sign in or Register call to action.

No anonymous page calls a user-owned API and interprets `401` as empty data. The page chooses the empty state before the request boundary.

## Action-Gate Design

A central capability resolver accepts:

- current viewer or `null`;
- requested capability;
- current path, including a safe query string;
- optional continuation context such as product, outlet, variant, or booking slot.

It returns one of:

- `allowed`;
- `sign_in_required`;
- `phone_verification_required`;
- `profile_completion_required`;
- `kyc_required`.

UI buttons use one shared gate presentation so the wording and return behavior remain consistent. Route handlers and database RPCs continue to enforce the same capability independently.

### Continuation behavior

- Guest selecting Book, Buy, Add to Cart, Save, Chat, or another mutation is sent to login/registration with a validated relative `next` destination.
- After authentication, MyWisata returns to the original product or target page.
- An Email Verified user may prepare the cart, but the final checkout action routes to Phone Verification and then returns to checkout.
- Profile and KYC upgrade flows preserve the same continuation contract.
- Unsafe absolute, protocol-relative, or backslash-containing return paths remain rejected by `postLoginPath()`.

## Public Content and Images

The shared experience reuses Customer cards and image-error behavior. Missing or broken `cover_url` values render the established `Image unavailable` or contextual visual fallback; Guest pages must not render blank media rectangles.

This UI work does not invent or bulk-populate product photography. Repairing missing development catalogue media is a separate content-data task. Broken URLs must still fail gracefully in the shared interface.

## Data and Security Boundaries

1. Guest has no row in `public.users`, wallets, carts, orders, withdrawals, or chat tables.
2. Public catalogue queries use only publicly permitted Vendor, Outlet, Listing, review-summary, and destination fields.
3. User-owned APIs continue returning `401` for Guest callers.
4. Tier-gated APIs retain route-layer checks and database/RPC enforcement as described by ADR-028.
5. The UI never treats a missing identity as a zero UUID, demo user, or shared anonymous account.
6. Notification, unread-chat, wallet, order, wishlist, saved-destination, and cart requests do not execute until an authenticated user is known.
7. Guest empty states contain no cached account data left from a previous signed-in session.

## Error Handling

- Public catalogue failure shows the existing public retry/error presentation, not a login prompt.
- Authentication-required mutations show a login/registration prompt and retain the continuation target.
- Insufficient verification shows the exact next verification step rather than a generic authorization error.
- An unexpected authenticated API `401/403` is not converted into a Guest empty state; it surfaces as an account/session error.
- Broken images use the shared visual fallback without hiding the Listing or Vendor card.

## Testing Strategy

### Browser flows

1. Anonymous `/customer` renders the same homepage and navigation structure as an authenticated Customer.
2. Guest opens Explore, Map, Vendor, Outlet, and Listing without redirecting.
3. Guest opens Wallet, Orders, Chat, Saved, Cart, and Notifications and sees deterministic empty states.
4. These Guest account pages issue no user-owned network requests.
5. Guest mutation redirects to login with a safe `next`; login returns to the originating page.
6. Email Verified checkout is stopped at Phone Verification and resumes afterward.
7. Phone Verified booking/purchase succeeds but recommendation and affiliate remain gated.
8. Profile Complete recommendation and limited affiliate work; withdrawal remains gated.
9. KYC Verified withdrawal request reaches the existing Admin Approval flow.
10. Missing and 404 Listing images render a visible fallback rather than a blank media block.
11. Legacy `/guest/*` links land on the equivalent Customer route.

### Security and contract tests

- Capability-to-tier mapping tests cover every matrix row.
- Guest cannot invoke private/tier-gated APIs.
- RLS and RPC guards remain unchanged or become stricter.
- Return-path validation rejects open redirects.
- Signed-out providers do not hydrate previously signed-in account state.

## Scope Boundaries

Included:

- Customer layout guest support.
- Shared public Customer browsing pages.
- Consistent anonymous empty states.
- Central UI capability gate aligned with existing server/database gates.
- Legacy Guest-route redirects.
- Image fallback parity and browser/security coverage.

Excluded:

- Weakening API authentication or Supabase RLS.
- Creating persistent anonymous carts, wallets, orders, or profiles.
- Bulk sourcing or generating catalogue photography.
- Changing commission rates, Admin Approval, Stripe payout behavior, KYC document storage, or verification-provider integrations.
- Redesigning Vendor or Admin portals.

## Risks and Mitigations

- Existing Customer providers assume a user exists. Mitigation: make hydration explicitly conditional and clear account state on sign-out.
- Private pages may currently show perpetual loading when `currentUser` is null. Mitigation: require an explicit anonymous branch before effects and data loading.
- A UI-only gate could be bypassed. Mitigation: preserve the existing API and database enforcement layers.
- Two route families can keep diverging. Mitigation: canonicalize `/customer/*` and reduce `/guest/*` to redirects.
- Showing zero may be mistaken for a real account balance. Mitigation: pair zero/empty values with visible `Guest` and `Sign in to view your account` context.
