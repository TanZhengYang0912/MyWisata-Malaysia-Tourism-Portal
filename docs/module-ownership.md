# Module Ownership

> **Rule**: Each table has exactly ONE owner. Only the owner writes migrations for that table.
> Cross-domain reads are fine; cross-domain writes must go through an agreed service/API.

## Member 1 (P1) — Platform, Identity & Communication

### Sub-modules
| Sub-module | Deliverable | Integration dependency |
|------------|-------------|----------------------|
| A1 App shell + Auth/RBAC | Login, register, demo switcher, route guard, role seed | Must ship Day 2 — all others depend on it |
| A2 Profile + Mock Verification | Profile edit, email/phone status, KYC upload placeholder, admin review | Depends on A1 |
| A3 Customer↔Vendor Chat | Thread, text messages, unread/read, vendor inbox, polling fallback | Needs outlet IDs from P2; integrates Day 8 |
| A4 FAQ Bot + Support/Admin Shell | Rule-based FAQ, ticket creation, notification centre, audit helper | Integrates with D4 (withdrawal) and C4 (affiliate) |

### Tables owned
**Core:** users, roles, user_roles, chat_threads, chat_messages, support_tickets, notifications, audit_logs  
**Mock:** email_verifications, phone_verifications, kyc_submissions, chat_message_reads, chatbot_sessions, chatbot_messages, chatbot_kb_documents, platform_settings  
**Later:** chatbot_message_kb_refs

---

## Member 2 (P2) — Vendor, Outlet & Catalogue

### Sub-modules
| Sub-module | Deliverable | Integration dependency |
|------------|-------------|----------------------|
| B1 Vendor onboarding | Vendor register, admin approve/reject, role assignment | Depends on A1 for user/role; admin approval in A4 |
| B2 Outlet & Product catalogue | Outlet CRUD, product/variant/inventory, media URLs | Catalogue read contract frozen Day 4 |
| B3 Booking slots + Vouchers | Slot capacity management, voucher CRUD, validation contract | D1 cart depends on slot/voucher contract |
| B4 Vendor dashboard | Order view per outlet, fulfil/check-in status, simple stats | Depends on D2 order; chat inbox from A3 |

### Tables owned
**Core:** vendors, outlets, outlet_managers, categories, products, product_variants, inventory, booking_slots, vouchers  
**Mock:** outlet_pages, price_rules, media_assets

---

## Member 3 (P3) — Discovery, Recommendation & Growth

### Sub-modules
| Sub-module | Deliverable | Integration dependency |
|------------|-------------|----------------------|
| C1 Discovery + Map | Home feed, search/filter, listing detail, Leaflet map pins, Near Me, Google Maps URL | Needs B2 catalogue (Day 5 — drop fixtures) |
| C2 Preferences + Rule Recommendation | Onboarding survey, weighted score, reason tags, snapshot | Needs A1 user, A2 profile completion |
| C3 Reviews + Share + Interaction | Completed-order gate, review form, save/share signals, Web Share API | Needs D2 completed ORDER_ITEMS |
| C4 Vendor Recommendation + Affiliate | Community recommendation form, admin review, affiliate link/click, mock commission | Commission credits via D3 wallet helper |

### Tables owned
**Core:** user_preferences, vendor_recommendations, affiliate_links, reviews, share_events, user_interactions  
**Mock:** recommendation_conversions, recommendation_commissions, commission_rules, affiliate_clicks, affiliate_attributions, recommendation_snapshots  
**Later:** geocode_cache

### Recommendation scoring (rule-v1 — no LLM/vectors)
```
score = interest_match(0.35) + recency(0.15) + rating(0.20) + proximity(0.20) + trending(0.10)
```
Record `model_version = 'rule-v1'` in recommendation_snapshots.

---

## Member 4 (P4) — Cart, Order, Booking & Wallet

### Sub-modules
| Sub-module | Deliverable | Integration dependency |
|------------|-------------|----------------------|
| D1 Cart + Voucher + Mock Checkout | Cart CRUD, amount calculation, voucher redeem, Mock Pay success/fail | Needs B2 variant/slot/stock/price contract (Day 4–5) |
| D2 Order + Booking | Order snapshot, booking QR, history, cancel/refund mock, vendor fulfil contract | Drives B4 vendor dashboard; C3 review gate |
| D3 Wallet + Ledger | Pending/available balance, wallet payment, reward credit helper | C4 commission calls credit helper only |
| D4 Withdrawal Approval | Destination placeholder, request, approve/reject, ledger reserve/release | Calls A4 audit/notification; dual approval for >RM500 |

### Tables owned
**Core:** voucher_redemptions, carts, cart_items, orders, order_items, bookings, wallets, wallet_ledger, withdrawal_requests, withdrawal_approvals  
**Mock:** payments, refunds, payout_destinations  
**Later:** payout_transactions

### Wallet credit helper (D3 → called by C4, not a direct table write)
```ts
// Only P4 writes to wallet_ledger — never write directly from C4
await creditWallet(userId, amount, 'reward_pending', referenceId, note);
```

---

## Integration Schedule

| Day | Gate | Who merges what |
|-----|------|----------------|
| 2   | G1 Auth | P1: A1 → develop |
| 4   | G2 Supply | P2: B2+B3 → develop; C1+D1 consume real data |
| 5   | E2E #1 | discover → cart → mock pay must pass |
| 6   | G3 Transaction | P4: D2 → develop; P2: B4 reads orders |
| 8   | G4 Growth | P3: C4 → P4: D3 ledger; P4: D4 → P1: A4 audit |
| 9   | E2E #2 + Chat | A3 chat flow integrated |
| 10  | Feature freeze | Polish only — no new features |
