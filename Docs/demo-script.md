# 3-Minute Demo Script — MyWisata Platform (Wallet & Withdrawal)

**Test card:** `4242 4242 4242 4242` · exp `12/26` · CVC `123`
**Prereqs:** dev server running, `stripe listen` forwarding to both webhook endpoints, earnings_sen seeded ≥ 10000.

---

## 0:00 — Open browser, show login page

Navigate to `http://localhost:3000/login`.

> "The platform has three roles — customer, vendor, and admin. Each has a separate wallet view."

Click **Customer** demo card to log in.

---

## 0:20 — Customer wallet dashboard

Navigate to `/customer/wallet`.

> "The wallet has two buckets. **Top-up balance** is loaded via card payment and used for bookings. **Earnings** accumulate from referral commissions and can be withdrawn to a bank account."

Point to the balance cards showing both buckets.

---

## 0:35 — Stripe top-up

Click **Top Up**. Enter `100` in the amount field. Click **Continue to Payment**.

> "Stripe Checkout handles PCI-compliant card processing. No card data touches our server."

On the Stripe-hosted page, enter the test card:
- Number: `4242 4242 4242 4242`
- Expiry: `12 / 26`
- CVC: `123`

Click **Pay RM 100.00**.

---

## 1:05 — Return to wallet — balance updated

Page returns to `/customer/wallet?topup=success`.

> "The Stripe webhook fires within seconds. The server verifies the Stripe signature, then calls `credit_topup` — a SECURITY DEFINER RPC — to credit the wallet atomically. The webhook is idempotent: replaying it produces no double-credit."

Wait 3–5 seconds, refresh. Show **Top-up balance** has increased by RM 100.

---

## 1:20 — Withdraw button — JIT intercept

Click **Withdraw**.

> "Before showing the withdrawal form, the UI checks whether the user has a verified Stripe Connect account. Demo users don't — so we show this gate."

The **Bank account required** modal appears.

> "In production, clicking 'Set Up Bank Account' redirects to Stripe Connect onboarding — KYC, bank details, Stripe identity verification. Once approved, `stripe_payouts_enabled = true` and withdrawals are unlocked."

Dismiss the modal.

---

## 1:35 — Vendor wallet (open new tab)

Open a new browser tab, log in as **Vendor** demo user. Navigate to `/vendor/wallet`.

> "Vendors earn commissions when customers book activities through the platform. Those commissions land in `earnings_sen`. The vendor can request a withdrawal — minimum RM 50."

Click **Request Withdrawal**. Enter `50`. Click **Submit Request**.

> "The `debit_withdrawal` RPC acquires a `SELECT FOR UPDATE` lock on the wallet row before checking the balance. Two concurrent requests can't both succeed."

Show the **In Progress** section — withdrawal appears with status **Pending**.

---

## 2:00 — Admin approval panel

Switch to a third tab, log in as **Admin**. Navigate to `/admin/withdrawals`.

> "Withdrawals go through mandatory admin review before Stripe fires. Amounts ≥ RM 500 require two approvers."

Show the pending withdrawal row (RM 50.00, vendor name).

**Reject flow:**
Click **Reject**. Confirm.

Switch back to the vendor wallet tab and refresh.

> "The `cancel_withdrawal` RPC reversed the debit — earnings are restored immediately, and a ledger entry records the reversal."

Show earnings restored.

**Approve flow:**
Submit a second withdrawal from the vendor wallet (RM 50). Back in admin tab, reload and click **Approve**.

> "Approve calls `record_admin_approval` (sets status = 'approved'), then immediately fires a Stripe Transfer to the vendor's Connect account followed by a Stripe Payout to their bank. If Stripe fails, the status stays 'approved' so the admin can retry — no funds are lost."

Show status badge updating to **Processing** (or **Approved — Retry** if no Connect account in demo).

---

## 2:40 — Webhook → final status

> "In production, Stripe fires a `payout.paid` webhook when the bank transfer settles (typically T+2). Our `connect_payout_completed` RPC then sets status = 'paid' and writes a final ledger entry. The vendor sees 'Paid' in their history."

Show the webhook handler code briefly (optional): `app/api/stripe/connect-webhook/route.ts`.

---

## 2:55 — Ledger consistency

Back in the customer wallet tab. Show the final balance: top-up bucket reflects the RM 100 credit, earnings bucket reflects any withdrawal deductions.

> "Every money movement is recorded in `wallet_transactions` with type, amount, bucket, and direction. The current balance equals the sum of all credits minus all debits. There's no separate 'balance' field to drift out of sync."

---

## 3:00 — Done

> "Key engineering decisions: dual-bucket wallet for spend vs earnings separation, SECURITY DEFINER RPCs for atomic money movements with RLS bypass, Stripe idempotency keys on all payouts, and mandatory admin approval with dual-sign for large transfers."
