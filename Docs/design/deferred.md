# Deferred / Post-MVP — Wallet + Stripe module

Records design branches that were **rejected only because of FYP scope constraints** (2-week timeline, 4 people, competing modules), not because the chosen option was superior. Revisit this list before production, or when the module gets serious development time.

Each item captures: what problem it addresses, what we shipped instead in MVP, what the "true-north" version looks like, rough effort estimate, and the source of the decision (grill Q# or ADR).

---

## 1. Reservation bucket for pending Withdrawal requests

**Concern**: concurrent Withdrawal requests can bypass balance checks unless the system reserves the funds at submission time. Currently the check is derived (`earnings_sen − Σ pending`), which works but requires a subquery on every read and is harder to reason about at scale.

**MVP position**: `SELECT FOR UPDATE` on the wallet row + `CHECK constraint (earnings_sen >= 0)` (ADR pattern, grill Q12 B+D). Correct for the demo — no race, no negative balance possible — but not the textbook design.

**Post-MVP work**: add `reserved_sen` column to `wallets`. On Withdrawal request submission, atomically move `amount_sen` from `earnings_sen` to `reserved_sen`. On approval, drain `reserved_sen`. On rejection or webhook `payout.failed`, move `reserved_sen` back to `earnings_sen`. Withdrawable amount becomes `earnings_sen` (no subquery needed).

**Effort**: ~1 engineer-day. Schema migration + 4 RPCs need updating + UI displays are unchanged.

**Source**: grill Q12 (option C, deferred).

---

## 2. Refund flow

**Concern**: an order that has been paid (via wallet or via Stripe Checkout in the future) can be cancelled or disputed, requiring the money to be returned. The `orders.status = 'refunded'` value exists in code as a filter option but no path writes it.

**MVP position**: no refund action anywhere in the codebase; `refunded` is cosmetic-only (grill Q11 A). Demo script avoids scenarios that would require refunds.

**Post-MVP work**: three parts.
1. **Wallet-paid orders**: admin-triggered `refundOrder(orderId)` RPC that inserts reverse `wallet_transactions` rows mirroring the original drain (per Q4 rule: refund the earnings portion first, then top-up).
2. **Card-paid orders** (once Stripe Checkout is the payment method, not just Top-up): call `stripe.refunds.create` on the original Payment Intent, listen for `charge.refunded` webhook, mark order refunded.
3. **Partial refunds**: percentage-based; requires per-line-item pricing model.

**Effort**: ~2 engineer-days for wallet path alone; +2 days for Stripe refund path; +2 days for partial refunds. Total 5-6 days for full coverage.

**Source**: grill Q11 (options B/C/D, all rejected on scope).

---

## 3. Daily aggregate Top-up cap

**Concern**: three-tier per-session limits (Q13 C) prevent one large Top-up but don't prevent a User at `registered` tier from making 100 × RM 100 Top-ups in one day. Real AML controls need aggregate caps.

**MVP position**: per-session limit only (`TOP_UP_LIMITS: registered → RM 100 / profile_complete → RM 500 / kyc_verified → RM 1M`). Grill Q13 D deferred.

**Post-MVP work**: `credit_topup` RPC additionally queries the last 24 hours of `wallet_transactions` where `reason = 'stripe_topup'` and `user_id = $1`, sums, checks against a daily cap. UI must show "Today: RM X used / RM Y remaining" so the User can understand rejections.

**Effort**: ~1 engineer-day. Query is trivial (`SUM` with `created_at > now() - '24 hours'`), most work is on the UI.

**Source**: grill Q13 (option D, deferred).

---

## 4. Real Earnings wiring (order → vendor credit; referral → customer commission)

**Concern**: the demo runs on seeded `earnings_sen` values. Vendors don't actually earn from sales; customers don't actually earn from recommendations. If a demo run executes more than the pre-seeded number of transactions, the numbers diverge from what the User just did on screen.

**MVP position**: seed data only (grill Q14 A). Demo script controls the narrative to avoid the disconnect.

**Post-MVP work**: two independent wires.
1. **Vendor earnings**: when `orders.status` transitions to `paid`, call `credit_earnings(vendor_id, order_total * 0.85)` and record the platform's 15% cut to a `platform_revenue` table (grill Q14 C, not chosen at MVP). Wire lives inside the order lifecycle handler.
2. **Customer recommendation commission**: requires a referral tracking system first — orders need a `referrer_id` FK, populated at booking time via referral cookie / promo link. Then `orders.status = paid` also fires `credit_earnings(referrer_id, order_total * 0.05)`. This is a whole feature, not just a wire.

**Effort**: vendor earnings ~0.5 engineer-day; customer referral system ~3 engineer-days (tracking + attribution UI + share links).

**Source**: grill Q14 (options B/C/D, all deferred). Also relates to Q2 A (symmetric): the symmetric wallet story only becomes fully honest once customer earnings are wired.

---

## 5. Non-Stripe payout rails (GrabPay, Touch 'n Go, Boost, direct bank)

**Concern**: the old UI listed Malaysian e-wallets as destinations. Real users may prefer these over a bank transfer. Stripe Connect Express in Malaysia does not support them.

**MVP position**: dropped entirely (ADR-0004). Withdraw form is bank-only.

**Post-MVP work**: separate integrations per rail — no unified Malaysian payout aggregator exists as of writing.
- **GrabPay**: no public payout API for platforms; would require Grab Merchant partnership or manual reconciliation.
- **Touch 'n Go eWallet**: limited developer API, mostly for merchant acceptance not payouts. Unclear feasibility.
- **Boost**: similar to TnG, business API is inbound-focused.
- **Direct bank transfer (no Stripe)**: doable via local payment gateway (iPay88, senangPay, Billplz), but reintroduces payment rail management the platform must build.

**Effort**: minimum 1 engineer-week per rail. Realistic path is to defer entirely until a specific rail becomes commercially necessary.

**Source**: grill Q7 (options B/C/D, all rejected on scope and Stripe support).

---

## 6. Pre-fill Stripe Connect onboarding from App KYC data

**Concern**: users completing App KYC give us their IC number, name, and address. Stripe Connect Express asks for the same information. Not pre-filling makes users type it twice and is a friction cliff at the KYC boundary.

**MVP position**: Stripe onboarding starts from empty state; user re-enters all fields (ADR-0002 mentions the pre-fill as a design intent but not necessarily implemented in MVP if time runs short).

**Post-MVP work**: on `accounts.create`, pass `individual.first_name`, `individual.last_name`, `individual.id_number` (from `kyc_submissions.ic_number`), `individual.dob` (need to add DOB to `kyc_submissions`), `individual.address.line1` (need address collection). This requires collecting a few more fields in App KYC that we currently don't ask for.

**Effort**: ~1 engineer-day, once the missing App KYC fields (DOB, address) are collected. Adding those fields to the App KYC form is another ~0.5 day.

**Source**: grill Q5 (mentioned as design intent, deferred as MVP polish).

---

## 7. Fee pass-through and display

**Concern**: real Stripe fees (3.4% + RM 1 for Checkout in Malaysia) get absorbed silently. In production this ~3.5% margin loss on every Top-up needs to either be absorbed knowingly (baked into vendor commission) or shown to the User.

**MVP position**: platform absorbs all fees, UI shows nothing (grill Q10 A). In test mode, no real fees are charged so it doesn't matter.

**Post-MVP work**: three parts.
1. Add `fee_sen` column to `wallet_transactions` — record the Stripe fee for each Top-up (from `stripe.balanceTransactions.retrieve` after Checkout completes).
2. Reconcile `platform_revenue` = Σ (vendor commission) − Σ (fee_sen) — the real platform margin after fees.
3. UI decision: do we show fees to users, absorb them, or add them (grill Q10 B/C)? Product decision required.

**Effort**: ~1 engineer-day for tracking; the UX decision then determines further work.

**Source**: grill Q10 (options B/C/D, deferred).

---

## 8. Dual-approval enforcement for high-value Withdrawals

**Concern**: the `withdrawal_requests.requires_dual_approval` flag exists (auto-set for amounts ≥ RM 500) and vendors see a "Dual Approval Required" badge, but the admin approval flow only requires ONE admin click. The flag is cosmetic today.

**MVP position**: single admin approval regardless of amount (grill Q6 A). The dual flag is displayed but does not gate anything.

**Post-MVP work**: change `withdrawal_requests` state machine so that `requires_dual_approval` rows need two distinct approvers before Stripe API is called. Add `approver_ids uuid[]` column, require length ≥ 2 when flag is true and status transitions to `processing`. Admin UI shows "1 of 2 approved" state, prevents same admin from approving twice.

**Effort**: ~2 engineer-days. State machine + UI + policy on who counts as second approver (super_admin vs any admin).

**Source**: grill Q6 (option D, rejected as over-engineering for FYP).

---

## 9. Payout state resilience — chargebacks and disputes

**Concern**: Stripe raises `charge.dispute.created` when a cardholder disputes a Top-up. Currently no handler; the disputed Top-up sits in `topup_sen` and could be spent while under dispute.

**MVP position**: no dispute handling. Test mode does not naturally trigger disputes.

**Post-MVP work**: webhook handler for `charge.dispute.created` → freeze the disputed amount (move to a `disputed_sen` bucket or set a flag), block checkout using disputed funds, notify admin via `/admin/withdrawals`-style page. When `charge.dispute.closed` arrives, unfreeze or reverse depending on outcome.

**Effort**: ~2 engineer-days. Includes admin dispute-review UI.

**Source**: not raised in grill (out of scope). Documented here for completeness.

---

## 10. Tier value authoritativeness during mid-Top-up state changes

**Concern**: if a User's `verification_tier` changes while a Checkout Session is open (e.g. admin approves their App KYC while the Stripe page is loading), whose tier value controls the limit check — the tier at Session creation or the tier at webhook time?

**MVP position**: default implementation enforces limit at Session creation and honours any completed Session Stripe reports paid (documented as an open question in ADR-0005).

**Post-MVP work**: pin down the semantics with a written policy, add a regression test that exercises both directions (tier up during Session, tier down during Session), and decide whether the webhook can retroactively reject a paid Session (probably no — Stripe already took the money).

**Effort**: ~0.5 engineer-day for the policy + test. Real complexity is the product decision, not the code.

**Source**: ADR-0005 open question.

---

## Reading this list later

When picking up this module for continued development, don't attack items linearly. Rank by **user-facing risk** first:

- **Blocks a real user's real money**: Item 2 (refund), Item 9 (dispute), Item 4 (earnings wire). These are correctness bugs waiting for a real user.
- **Compliance / AML**: Item 3 (daily cap), Item 8 (dual approval), Item 6 (pre-fill KYC). These matter when the platform stops being test-mode.
- **Scale / architectural cleanup**: Item 1 (reservation bucket), Item 7 (fee accounting), Item 10 (tier authoritativeness). These become important with volume.
- **Product breadth**: Item 5 (non-Stripe rails). Only relevant once product-market fit demands it.
