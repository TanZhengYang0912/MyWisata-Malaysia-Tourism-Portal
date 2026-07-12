# MyWisata — Malaysia Tourism Portal

A marketplace connecting Malaysian tourism vendors with travellers. Users hold platform wallets, book experiences, and receive payouts via Stripe.

## Language

### Identity & verification

**User**:
Any authenticated identity in the system, regardless of role (customer, vendor_owner, admin, etc.).
_Avoid_: account, member.

**Verification tier**:
The app-level trust level of a User. Progresses `guest → registered → phone_verified → profile_complete → kyc_submitted → kyc_verified`. Stored in `users.kyc_status`.
_Avoid_: trust level, verification status (too vague).

**App KYC**:
This project's KYC flow — IC/passport upload reviewed by an admin. Success moves the User to `verification_tier = kyc_verified`.
_Avoid_: KYC (unqualified — collides with Stripe KYC).

**Stripe KYC**:
Stripe Connect Express onboarding — identity + bank verification handled on Stripe's domain. Success sets `users.stripe_payouts_enabled = true`.
_Avoid_: KYC (unqualified), Connect verification.

**User verified**:
Shorthand for `verification_tier = kyc_verified`. An app-level attribute.
_Avoid_: verified (unqualified).

**Payouts enabled**:
Shorthand for `users.stripe_payouts_enabled = true`. A Stripe-level attribute.
_Avoid_: Stripe verified.

### Wallet & money

**Wallet**:
Per-User account holding two buckets. One-to-one with User.
_Avoid_: account, balance (as a noun).

**Top-up balance**:
The `topup_sen` bucket. Credited by Stripe Checkout top-ups. Spendable at checkout but not withdrawable.
_Avoid_: prepaid balance, deposit.

**Earnings balance**:
The `earnings_sen` bucket. Credited by sales revenue / commissions. Spendable at checkout AND withdrawable.
_Avoid_: revenue, commission balance.

**Wallet balance**:
Sum of Top-up balance + Earnings balance. Used for headline display only.
_Avoid_: total balance.

**Spendable amount**:
Amount usable for checkout payment. Equals Wallet balance (both buckets are spendable).
_Avoid_: available balance (ambiguous with Withdrawable amount).

**Withdrawable amount**:
`earnings_sen − Σ(pending / approved / processing Withdrawal request amounts)`.
_Avoid_: available balance (ambiguous), available to withdraw.

**Pending amount**:
`Σ(pending + approved + processing Withdrawal request amounts)` for a User.
_Avoid_: reserved, held.

**Wallet transaction**:
An append-only row in `wallet_transactions` recording one credit or debit to one bucket. Every Wallet mutation writes a Wallet transaction. Idempotent via `stripe_event_id UNIQUE`.
_Avoid_: ledger entry (fine as informal synonym), wallet event.

### Payment flows

**Top-up**:
User-initiated credit to the Top-up balance via Stripe Checkout (card payment).
_Avoid_: deposit, recharge, top up (spacing inconsistent — always hyphenated).

**Withdrawal request**:
User-initiated debit application against the Earnings balance. A row in `withdrawal_requests`. Requires admin approval before triggering a Stripe Payout.
_Avoid_: withdraw, cashout.

**Payout**:
The Stripe-side action that moves money from the User's Stripe Connect account to their bank. Triggered by `payouts.create` API; confirmed by `payout.paid` webhook.
_Avoid_: transfer (means something else in Stripe — see below), disbursement.

**Transfer**:
The Stripe-side action moving money from the platform's Stripe balance into a connected account's Stripe balance (`transfers.create`). Runs before a Payout.
_Avoid_: payout (see above).

**Connect account**:
The User's Stripe Connect Express account (`accounts.create({ type: 'express' })`). Stored as `users.stripe_connect_account_id`. Distinct from Stripe Customer.
_Avoid_: Stripe account (ambiguous with Stripe Customer).

**Stripe Customer**:
The User's Stripe Customer object, auto-created on first Checkout. Stored as `users.stripe_customer_id`. Used for Top-up only.
_Avoid_: Stripe account.

## Relationships

- A **User** has exactly one **Wallet**.
- A **Wallet** has two buckets: one **Top-up balance** and one **Earnings balance**.
- Every mutation of either bucket writes exactly one **Wallet transaction** (append-only, idempotent).
- A **User** may have one **Stripe Customer** (for Top-ups) and one **Connect account** (for Payouts). These are independent Stripe entities.
- A **Withdrawal request** belongs to one **User**; admin approval triggers one **Transfer** followed by one **Payout**.
- A **User** can submit a **Withdrawal request** only if User verified **AND** Payouts enabled.
- **App KYC** runs before **Stripe KYC** (serial). App KYC data (IC/passport) is pre-filled into Stripe KYC onboarding.

## Example dialogue

> **Dev**: "When the Customer tops up RM 100, does the Earnings balance go up?"
> **Domain expert**: "No — Top-up credits the Top-up balance only. Earnings balance is credited from sales revenue or commissions."
>
> **Dev**: "So at checkout, the Customer can pay with either bucket?"
> **Domain expert**: "Yes — the Spendable amount is the sum of both. But Top-up drains first: we prefer to preserve Earnings, since Earnings is the Withdrawable amount."
>
> **Dev**: "What if the Customer completes App KYC but hasn't done Stripe KYC — can they withdraw?"
> **Domain expert**: "No. User verified gets you the Withdraw button; clicking it triggers Stripe KYC. Only Payouts enabled unlocks actual submission."
>
> **Dev**: "Approving a Withdrawal request — does the money leave immediately?"
> **Domain expert**: "The admin's Approve click triggers a Transfer synchronously. The subsequent Payout is async — status stays `processing` until the `payout.paid` webhook lands."

## Flagged ambiguities

- **"balance"** was used to mean Wallet balance, Spendable amount, or Withdrawable amount depending on context — resolved into three distinct terms.
- **"available balance"** in the vendor wallet UI meant Withdrawable amount specifically — rename to `withdrawableAmount` in code.
- **"KYC"** was used for both App KYC and Stripe KYC — always qualify with App/Stripe prefix.
- **"verified"** could mean User verified (app) or Payouts enabled (Stripe) — always qualify.
- **"payout" vs "transfer"** are distinct Stripe primitives; do not use interchangeably.
- **"account"** collides with User, Stripe Customer, and Connect account — never use the bare word.
