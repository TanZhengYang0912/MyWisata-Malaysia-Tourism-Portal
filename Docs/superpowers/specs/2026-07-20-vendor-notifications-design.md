# Vendor Notification Center — Design Specification

## Goal

Add a role-aware Vendor Notification Center with a bell in the Vendor Portal header. Vendor Owners receive business, wallet, and account notifications. Outlet Managers receive only operational notifications for their assigned outlets. The feature reuses the existing customer notification infrastructure and preserves existing Customer, Guest, and Admin behavior.

## User experience

- A notification bell appears in the top-right area of the Vendor Portal header.
- The bell shows an unread badge and opens a panel containing the newest 15 notifications.
- The panel supports `All`, `Unread`, `Orders`, `Bookings`, `Products`, `Wallet`, and `Account` filters.
- Users can mark one notification as read, mark all as read, and open `View all notifications`.
- Notifications are loaded with server-side pagination and filtering; the browser never loads the entire history.
- A failed notification refresh is non-blocking: the Vendor Portal remains usable and keeps the last known unread count.

## Role and data isolation

The existing `notifications.user_id` model remains the source of truth. No Vendor-specific notification table is introduced.

### Vendor Owner

Vendor Owners can receive all Vendor business notifications, all notifications for their owned Vendor and outlets, wallet settlement/payout/account notifications, and role or Outlet Manager permission changes.

### Outlet Manager

Outlet Managers can receive only orders, bookings, cancellations, refunds, check-ins, product/listing operational updates, and customer messages for assigned outlets. They must not receive or query Vendor Owner wallet, payout, revenue, or account-level notifications.

Every notification-producing server path must resolve the recipient through the authenticated Vendor scope (`vendor_id` / assigned `outlet_id`). RLS and server queries must prevent cross-vendor and cross-outlet reads, even if a user modifies URL parameters.

## Event matrix

| Category | Vendor Owner | Outlet Manager | Email |
| --- | --- | --- | --- |
| New order | Yes | Assigned outlet only | Yes |
| Order cancelled / refunded | Yes | Assigned outlet only | Yes |
| New booking | Yes | Assigned outlet only | Optional |
| Booking cancelled / check-in | Yes | Assigned outlet only | Optional |
| Product/listing approved | Yes | No | Yes |
| Product/listing rejected | Yes | No | Yes |
| Customer message | Yes | Assigned conversations only | No; Inbox badge remains the primary signal |
| Wallet settlement | Yes | No | Yes |
| Payout status | Yes | No | Yes |
| Vendor approved / suspended | Yes | No | Yes |
| Outlet Manager permission changed | Yes | Yes, for their own role | Yes |

Email uses the existing App Email/Outbox system and includes only sanitized business details. It must not contain full customer personal data, full Stripe IDs, bank information, or identity-document data. Email failures never roll back the underlying business or wallet mutation; they remain retryable in the outbox.

## Architecture and data flow

```text
Order / Booking / Listing / Wallet / Account event
        -> resolve Vendor Owner or assigned Outlet Manager recipients
        -> insert deduplicated notification rows
        -> enqueue Email only for high-priority events
        -> shared NotificationBell polls unread count and latest 15 rows
```

- Reuse the existing `/api/notifications` endpoint, read-one endpoint, read-all endpoint, event-key idempotency, category normalization, and pagination contract.
- Make `NotificationBell` reusable between Customer and Vendor layouts, with role-specific category labels and links supplied by the caller.
- Add Vendor notification links to the relevant Vendor pages (`orders`, `bookings`, `products`, `wallet`, `profile`, and `inbox`).
- Keep chat unread counts separate from system notification counts; a message must not generate duplicate noise in the system panel.

## Error handling and security

- Unauthenticated users receive `401` from personal notification APIs.
- A Vendor user requesting another Vendor's or Outlet's notification receives no data and cannot infer its existence.
- Invalid category or page parameters return a safe validation error.
- Duplicate event keys produce one in-app notification and one email outbox event.
- Outbox delivery uses the existing retry/backoff behavior.
- Notification metadata exposed to the browser is sanitized and contains no raw identity or payment secrets.

## Testing strategy

### Unit and route tests

- Vendor Owner receives all permitted categories.
- Outlet Manager receives only assigned-outlet operational categories.
- Wallet and account notifications are hidden from Outlet Managers.
- Default latest-15 ordering, server-side filters, pagination, unread count, mark-one, and mark-all.
- `401` for Guest/unauthenticated notification access.
- Duplicate event/webhook processing is idempotent.
- High-priority events enqueue one email; ordinary messages do not enqueue duplicate email.
- Existing Customer Notification Center tests remain green.

### Playwright tests

- Vendor Owner sees the Bell and unread badge in the Vendor Portal.
- Outlet Manager sees the Bell but not Owner-only Wallet notifications.
- The panel shows newest 15 rows, filters, mark-read, mark-all, and View all.
- An order, booking, product, and wallet event render the correct Vendor link.
- A high-priority event creates an email outbox entry.
- Guest and Customer notification behavior does not regress.

## Scope boundaries

This feature does not redesign the Vendor Inbox, add push notifications, add SMS, or change the Customer notification taxonomy. It only adds role-aware Vendor system notifications and associated high-priority email delivery.
