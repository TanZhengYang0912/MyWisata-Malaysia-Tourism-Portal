# Outlet manager invitation design

## Goal

Allow a vendor owner to assign one primary manager to each outlet without requiring the manager to be the vendor owner or an already-seeded demo account.

## Approved scope

- Keep the existing one-manager-per-outlet and one-outlet-per-manager rules.
- Vendor owner creates an invitation using the manager's email.
- Existing users can open the invitation and accept it.
- New users can register from the invitation page, then accept it.
- The invitation is one-time, expires after seven days, and stores only a token hash.
- The outlet manager receives access only after acceptance.
- Vendor owner remains the only role allowed to create outlets, assign/revoke managers, and manage the vendor-wide catalogue.

## Data flow

1. Owner submits an email and outlet ID.
2. Server verifies the owner owns the approved vendor and the outlet belongs to that vendor.
3. Server revokes any previous pending invite for that outlet, stores a hashed token, and returns a shareable invitation URL.
4. Invitee opens the URL, signs in or registers, and submits acceptance.
5. Server verifies the token, expiry, invite email, outlet availability, and one-outlet-per-manager constraint.
6. Server creates the `outlet_managers` assignment and scoped `outlet_manager` role, then marks the invite accepted.

## Security decisions

- Raw invitation tokens are never stored.
- Acceptance requires an authenticated Supabase user whose email matches the invitation email.
- The invitation route does not expose outlet data until the token is validated.
- Server-side authorization continues to use `authorizeVendor` and existing outlet scope checks.
- No multi-outlet manager or co-manager support is added in this iteration.

## Product behavior

- The outlet panel gets an email field and `Invite manager` action.
- After creation, the owner can copy the invitation link for the manager.
- The panel shows pending invitation state and the assigned manager after acceptance.
- Email delivery is intentionally not coupled to this implementation; the returned link supports the current demo and can be passed to an email provider later.
