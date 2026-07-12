# ADR-014: Withdrawal destination hardcoded as 'Stripe bank on file'

**Status:** Accepted

## Decision

`debit_withdrawal` hardcodes `destination_label = 'Stripe bank on file'`. The earlier `request_withdrawal` RPC accepted a free-text `p_destination` parameter driven by a UI dropdown of Malaysian bank names.

## Rationale

The dropdown of static bank/e-wallet names (Maybank, CIMB, GrabPay, etc.) was decorative — no routing information was actually sent to a payment processor, and the label had no effect on where money went. Once Stripe Connect was introduced, the real payout destination is the bank account registered in the vendor's Connect account, not a label chosen from a dropdown. Keeping the dropdown would be misleading: a vendor could select "Maybank **** 1234" while their Connect account routes to a different bank. Removing the parameter entirely eliminates the false impression and keeps the data model honest. The `destination_label` column is retained in the schema for future use if multi-destination payouts are added.
