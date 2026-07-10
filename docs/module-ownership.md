# Module Ownership — 4 Members

> **Rule**: Each table has exactly ONE owner. Only the owner writes migrations
> for that table. Cross-domain reads are fine; cross-domain writes go through
> agreed API routes or the shared helpers (`money.ts`, `auditAndNotify()`,
> `creditWallet()`).

---

## Member 1 — Vendor & Marketplace Management

### Scope
- User login / role access
- Vendor registration
- Vendor outlet management
- Product / activity / package management
- Pricing and inventory
- Voucher / promotion management
- Admin approve vendor and listing

### Tables owned (17)
**Auth foundation:**
- `users`, `roles`, `user_roles`, `email_verifications`, `phone_verifications`

**Vendor & outlet:**
- `vendors`, `outlets`, `outlet_pages`, `outlet_managers`

**Catalogue:**
- `categories`, `products`, `product_variants`, `price_rules`, `inventory`, `booking_slots`

**Promotions:**
- `vouchers`, `media_assets`

### Key routes
- `/login`, `/register`
- `/vendor/dashboard`, `/vendor/products`, `/vendor/bookings`, `/vendor/vouchers`
- `/admin/vendors`

### Provides to others
- `AuthContext` via `useAuth()` hook — all members depend on this
- Vendor / outlet / product read APIs — Member 2 (discovery), Member 3 (recommendation)
- `is_admin(uid)`, `is_approver(uid)`, `get_my_roles()` RPCs

### Deadline
- **Day 2 — Gate 1**: Auth + `useAuth()` live, all demo accounts login-able
- **Day 4 — Gate 2**: Catalogue read contract frozen, Member 2 stops using fixtures

---

## Member 2 — Customer Booking, Map & AI Discovery

### Scope
- Customer browse / search tourism activities
- Cart
- Booking
- Checkout
- Order / booking history
- Interactive map (Leaflet + OSM)
- Near Me / Get Directions
- Customer-to-vendor chat

### Tables owned (16)
**Transaction:**
- `carts`, `cart_items`
- `orders`, `order_items`, `voucher_redemptions`
- `bookings`
- `payments`, `refunds`

**Discovery & personalization:**
- `user_preferences`, `recommendation_snapshots`, `user_interactions`
- `reviews`

**Map:**
- `geocode_cache`

**Chat:**
- `chat_threads`, `chat_messages`, `chat_message_reads`

### Key routes
- `/discovery`, `/search`, `/vendors/[slug]`
- `/cart`, `/orders`, `/orders/[id]`
- `/vendor/inbox` (chat receive side)
- `/profile/preferences`

### Provides to others
- `order.paid` domain event → Member 3 (commission trigger)
- Order → review gate → Member 3 (via completed order_items only)

### Deadline
- **Day 5 — Gate 2 → E2E #1**: discover → cart → mock pay must run end-to-end
- **Day 6 — Gate 3**: `orders` completes so Member 3 can hang reward/withdrawal off it

---

## Member 3 — Verification, Reward & Wallet Governance (YOU)

### Scope
- Verified user profile
- KYC / document upload
- Admin verification approval
- Community recommendation submission
- Hidden gem / vendor recommendation approval
- Reward calculation
- Wallet balance
- Withdrawal request
- Admin withdrawal approval

### Tables owned (11)
**Verification:**
- `kyc_submissions`

**Recommendation → Reward:**
- `vendor_recommendations`, `recommendation_conversions`
- `commission_rules`, `recommendation_commissions`

**Wallet:**
- `wallets`, `wallet_ledger`

**Withdrawal:**
- `payout_destinations`
- `withdrawal_requests`, `withdrawal_approvals`
- `payout_transactions` (mock in demo)

### Key routes
- `/profile` (KYC upload UI)
- `/wallet` (balance + withdrawal request)
- `/recommend` (submit vendor recommendation)
- `/admin/kyc`, `/admin/recommendations`, `/admin/withdrawals`

### Provides to others
- `creditWallet(userId, amount, type, refId)` — Member 4 affiliate calls this to credit commissions
- `submit_withdrawal`, `approve_withdrawal`, `review_kyc`, `convert_recommendation` RPCs

### Detailed 14-day plan
See **`docs/member-plans/member-3-trust-money-flow.md`** — includes state machines,
transaction boundaries, 4 governance RPCs, quality-scoring functions (KYC + recommendation),
and DoD per sub-module.

### Deadline
- **Day 6 — Gate 3**: Wallet + Withdrawal single-approval flow live
- **Day 8 — Gate 4**: Recommendation convert → wallet credit chain complete
- **Day 8 — Gate 5**: All approvals write to `audit_logs` + `notifications` via RPC

---

## Member 4 — Affiliate, Social Sharing & AI Support

### Scope
- Affiliate link generation
- Affiliate click tracking
- Conversion tracking
- Commission calculation
- Social sharing link
- Share tracking
- Admin support portal
- AI chatbot / FAQ chatbot
- Support ticket escalation

### Tables owned (9)
**Affiliate:**
- `affiliate_links`, `affiliate_clicks`, `affiliate_attributions`

**Social:**
- `share_events`

**Support & Chatbot:**
- `chatbot_sessions`, `chatbot_messages`
- `chatbot_kb_documents`, `chatbot_message_kb_refs`
- `support_tickets`

### Key routes
- `/wallet` (affiliate link section, shared UI with Member 3)
- `/admin/support`
- Chatbot widget (embed on all pages)

### Depends on
- Member 3's `creditWallet()` helper for commission payout
- Member 1's `vendors`, `products` (link targets)
- Member 2's `orders` (conversion attribution)

### Deadline
- **Day 7**: Affiliate link generation + basic click tracking
- **Day 8 — Gate 4**: Commission → `creditWallet()` chain complete

---

## Shared Infrastructure (no single owner)

Any member reads freely, writes only via helpers.

| Table | Written via | Read by |
|-------|-------------|---------|
| `notifications` | `send_notification` RPC / `auditAndNotify()` | Own user's inbox |
| `audit_logs` | `record_audit_and_notify` RPC | Admin audit trail |
| `platform_settings` | Super Admin only | Everyone (config) |
| `idempotency_keys` | `withIdempotency()` middleware | Auto-managed |

---

## Integration Gate Timeline

| Day | Gate | Blocker |
|-----|------|---------|
| 2 | **G1 — Identity** | Member 1 ships `useAuth()` + demo accounts |
| 4 | **G2 — Supply** | Member 1 catalogue read contract frozen; Member 2 drops fixtures |
| 5 | **E2E #1** | discover → cart → mock pay passes |
| 6 | **G3 — Transaction** | Member 2 order + Member 3 wallet ships |
| 7-8 | **G4 — Growth** | Member 3 commission → wallet; Member 4 affiliate → wallet (via `creditWallet`) |
| 8 | **G5 — Governance** | All approve/reject write via `auditAndNotify` RPC |
| 9 | **E2E #2 + Chat** | Chat flow integrated |
| 10 | **Feature freeze** | Polish only, no new features |

---

## Cross-cutting Contracts (do not break)

1. **Money** — `src/lib/money.ts` — sen-integer precision; every price/commission goes through this
2. **Auth** — `useAuth()` hook + `get_my_roles()` RPC — never query `user_roles` directly with a join
3. **Wallet writes** — `creditWallet()` helper — no direct `wallets`/`wallet_ledger` writes outside Member 3's domain
4. **Approval helpers** — `auditAndNotify()` + `record_audit_and_notify` RPC — every approve/reject calls this
5. **Idempotency** — `withIdempotency()` helper — every POST that writes money uses `Idempotency-Key` header
6. **Domain events** — `src/lib/domain-events.ts` — `onOrderPaid`, `onWithdrawalReviewed`, `onRecommendationConverted`, `onOrderCompleted`
