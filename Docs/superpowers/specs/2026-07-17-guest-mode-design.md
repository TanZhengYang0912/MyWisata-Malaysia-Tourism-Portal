# Guest Mode design

## Goal

Let an unauthenticated visitor demonstrate the platform's public catalogue
without creating or selecting a Supabase user. The visitor can browse approved
vendors, active outlets, and active listings, but cannot perform any action
that creates an account-owned record or moves money.

## Entry and session behaviour

The login page will add a `Guest mode` card beside the seeded demo accounts.
Selecting it signs out any existing Supabase session and navigates to
`/guest/explore`. It is not returned by the seeded-demo-users API and does not
create a database row, local role, cart, or wallet.

## Public routes

`/guest/explore` will be a standalone public catalogue page. It will use the
existing read model and only display records already exposed by the catalogue
public-read RLS policies: approved vendors, active outlets, and active
products.

Selecting an item opens a standalone public details route under `/guest`.
The customer layout is deliberately not reused because it requires a customer
role and includes account-owned UI such as cart and wallet state.

## Protected actions

Guest Mode must not expose a working action that creates a booking, order,
recommendation, affiliate link, or withdrawal. Where a public details view
offers a call to action, it will direct the visitor to `/login` with a return
path. The existing server-side authorization and tier checks remain the
security boundary; Guest Mode merely makes the intended UI clear.

## Scope and compatibility

This adds a login entry and new `/guest/*` pages only. Existing `/customer/*`
pages, customer navigation, admin modules, database schema, and RLS policies
are not changed. Existing public read policies are reused rather than broadened.

## Error handling

If public catalogue loading fails, the guest page shows a retryable, plain
error state. Empty catalogue data shows an empty state. A protected-action
attempt always routes to sign-in rather than pretending the operation succeeded.

## Verification

Tests will establish that the login Guest Mode action signs out before routing,
that the public route can render catalogue data without a user, and that
protected APIs continue to return unauthenticated responses with no session.
Manual testing will include switching from a customer to Guest Mode and
attempting every protected action.
