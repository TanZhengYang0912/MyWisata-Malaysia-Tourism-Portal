-- ============================================================
-- Migration — Fill chatbot_kb_documents gaps found by comparing real
-- customer-facing features against existing KB coverage: refunds,
-- vouchers, vendor onboarding, booking reschedule/cancel, chat
-- reporting, phone verification.
--
-- Facts below are drawn only from existing code/schema, not invented:
--   - Refunds: app/api/orders/[orderId]/refund/route.ts,
--     app/api/admin/refunds/[refundId]/route.ts. No time-window or
--     turnaround-time rule exists in code, so none is stated here.
--   - Vouchers: app/api/vouchers/validate/route.ts,
--     app/api/vendors/[vendorId]/vouchers/route.ts.
--   - Vendor onboarding: app/api/vendors/route.ts (register_vendor_with_outlet),
--     app/api/admin/vendors/[id]/approve/route.ts,
--     supabase/migrations/047_outlet_manager_invitations.sql. No approval
--     SLA exists in code, so none is stated here.
--   - Reschedule/cancel: app/api/bookings/[bookingId]/reschedule/route.ts
--     (reschedule_booking RPC, confirmed-only, same product/outlet slot).
--     No self-service cancel endpoint exists — a paid booking's only
--     customer-facing path is the refund flow above, so the entry says so
--     rather than implying a "cancel" button exists.
--   - Chat reporting: app/api/chat/[threadId]/report/route.ts,
--     supabase/migrations/043_chat_reports_and_welcome_trigger.sql,
--     044_chat_reports_resolution_and_dedupe.sql. category='general' since
--     it matches none of classify.ts's CATEGORY_KEYWORDS sets.
--   - Phone verification: app/api/phone/send-otp/route.ts,
--     app/api/phone/verify-otp/route.ts,
--     supabase/migrations/026_phone_verification.sql,
--     082_phone_verification_checkout_guards.sql (checkout-gating trigger),
--     025_tier_ladder.sql (phone_verified is a separate tier from
--     kyc_verified). category='general' for the same reason as above.
--   - Contacting support: app/api/support/tickets/route.ts (free-text
--     subject+body, no order link required). No SLA/turnaround exists in
--     code, so none is stated.
--   - Wallet top-up: app/customer/wallet/page.tsx,
--     app/api/stripe/create-checkout/route.ts (RM1 min, tier-based max,
--     phone verification required first, webhook-credited "within a
--     minute" per the UI's own success copy).
--   - Vendor recommendations: app/api/recommendations/route.ts,
--     lib/recommendations/submission.ts (required fields, 1-5 photos),
--     supabase/migrations/092_recommendation_evidence_and_reward_reversals.sql
--     (pending -> changes_requested -> approved/rejected -> converted;
--     reward activates only on 'converted', not 'approved').
--   - Close/restore account: app/api/account/close/route.ts,
--     app/api/account/restore/route.ts,
--     supabase/migrations/050_profile_account_lifecycle.sql (soft close,
--     restore resets KYC/phone/profile-completion tiers, suspended
--     accounts can't self-close).
--   - Suspension appeal: app/account-suspended/page.tsx,
--     app/api/account-suspended/appeal/route.ts (appeal becomes a regular
--     support_tickets row). No stated appeal turnaround exists in code.
--   - Order history/receipts: app/customer/orders/page.tsx,
--     app/customer/orders/[id]/page.tsx (Print Receipt = window.print(),
--     not an in-app PDF download; app/api/orders/receipt/route.ts emails
--     the PDF automatically post-checkout instead).
--   - Wallet balances: app/api/wallet/summary/route.ts (topup_sen,
--     earnings_sen, pending_earnings_sen, reserved_earnings_sen,
--     withdrawn_earnings_sen), app/customer/wallet/page.tsx (UI copy for
--     each bucket, "available to withdraw" is a computed UI value, not a
--     stored column).
--   - Messaging a vendor: app/customer/activity/[id]/activity-detail-client.tsx
--     (Chat with vendor button, vendor-backed listings only),
--     app/api/chat/[threadId]/attachments/route.ts. No response-time SLA
--     exists in code, so none is stated.
--   - Notifications: app/api/notifications/route.ts (category filter:
--     wallet | bookings_purchases | recommendations_affiliate | support |
--     account_security), app/api/notifications/[id]/read,
--     app/api/notifications/read-all.
--   - Reviews: confirmed via full-repo search that no insert-review
--     endpoint exists anywhere in app/api/** — GET
--     /api/products/[productId]/reviews is read-only; reviews are seed
--     data only. States plainly that customers cannot submit one yet,
--     rather than implying a feature that doesn't exist.
--
-- Idempotent by title, same pattern as migration 012_seed_gap_fill.sql.
-- Purely additive — no existing rows are touched.
-- ============================================================

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do refunds work?',
       'You can request a refund on any paid or completed order by providing a reason. Your request is reviewed by an admin — once approved, the refund goes back to your original payment method, or to your wallet if that is how you paid.',
       ARRAY['refund','cancel','money back','return','order'], 'payment'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do refunds work?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do vouchers work?',
       'Enter a voucher code at checkout to apply it. A voucher can give a percentage off, a fixed amount off, or a buy-one-get-one deal, and may have an expiry date, a minimum spend, and limits on total or per-customer use. Vouchers are created by individual vendors.',
       ARRAY['voucher','promo','discount','code','coupon'], 'payment'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do vouchers work?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I become a vendor?',
       'Apply through the app to register your business and first outlet, then upload your business documents for review. An admin reviews and approves your application before your vendor account is activated. To manage a specific outlet for an existing vendor instead, ask the vendor owner to send you an outlet manager invitation by email.',
       ARRAY['vendor','become','apply','business','outlet','merchant'], 'vendor'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I become a vendor?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'Can I reschedule or cancel my booking?',
       'You can reschedule a confirmed booking to a different available time slot for the same activity and outlet, directly in the app. This only works while the booking is still confirmed (not yet checked in or completed). There is no self-service cancel option once a booking is paid; instead, submit a refund request on the order and an admin will review it.',
       ARRAY['reschedule','cancel','change slot','booking','date'], 'booking'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'Can I reschedule or cancel my booking?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I report a problem in a chat?',
       'Open the chat thread and use the Report option, choosing a reason - scam, abuse, spam, or other - with optional details. Your report is sent to the MyWisata team review queue, who check the conversation and resolve or dismiss it.',
       ARRAY['report','chat','problem','scam','abuse','spam'], 'general'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I report a problem in a chat?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'Do I need to verify my phone number?',
       'Yes - phone verification is required before you can check out. You will receive a one-time SMS code valid for 10 minutes. It is separate from KYC identity verification: phone verification just confirms you have a real, unique contact number, while KYC verifies your identity and is required for withdrawals.',
       ARRAY['phone','verify','otp','sms','verification'], 'general'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'Do I need to verify my phone number?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I contact support?',
       'The main way to reach us is through the chatbot - if it cannot answer your question, it offers to raise a support ticket for you, which then shows up under My Tickets. A ticket is just a subject and a free-text message, and does not need to be tied to a specific order. You can reply to an open ticket, and reopen one that has already been resolved if you still need help.',
       ARRAY['support','contact','ticket','help','human'], 'general'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I contact support?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I top up my wallet?',
       'Tap Top Up on your Wallet page, enter an amount, and pay by card through Stripe checkout - minimum RM 1. Your balance updates once the payment clears, usually within a minute. Top-up requires phone verification first, and your maximum top-up amount depends on your verification tier: RM 100 once phone-verified, RM 500 once your profile is complete, and unlimited once KYC-verified.',
       ARRAY['top up','topup','add money','wallet','deposit'], 'wallet'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I top up my wallet?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I recommend a vendor?',
       'Once your profile is complete, submit a recommendation with the business name, a description, why you recommend it, a category, its location on the map, at least one contact method, and 1-5 photos you have permission to share. An admin reviews it and can approve, reject, or ask for changes you can resubmit. Approval alone does not make it live yet - your reward activates once the vendor actually joins through your recommendation.',
       ARRAY['recommend','recommendation','nominate','suggest a vendor','business'], 'vendor'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I recommend a vendor?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I close my account?',
       'You can close your own account from your profile settings. It is a soft close - your orders and wallet data are not deleted, and you can restore it anytime by signing back in and choosing to restore. Restoring resets your KYC, phone verification, and profile-completion progress, so you will need to redo those. Suspended accounts cannot be closed this way.',
       ARRAY['close account','delete account','deactivate','restore account'], 'account'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I close my account?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'My account is suspended, how do I appeal?',
       'If your account is suspended, you will be redirected to an account-suspended page where you can still reach support. Submit an appeal message explaining your situation (at least 10 characters); it is reviewed the same way as a support ticket, and you can track it under My Tickets.',
       ARRAY['suspended','suspension','appeal','banned','account locked'], 'account'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'My account is suspended, how do I appeal?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'Where can I see my past orders and receipts?',
       'Go to My Orders to see your full order history, with each order''s items, totals, and status. Open an order for its details, or a booking for its QR entry pass and its own Print Receipt button - receipts print via your browser (no separate PDF download), and a copy is also emailed to you automatically right after checkout.',
       ARRAY['order history','receipt','past orders','invoice','print'], 'booking'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'Where can I see my past orders and receipts?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'What do the different wallet balances mean?',
       'Your Wallet page shows several balances: Top-up balance (money you have added), Earnings balance (rewards you have earned), Pending rewards, also called pending earnings (still in their 7-day hold and awaiting KYC approval), Reserved (tied up in withdrawal requests currently in progress), and Withdrawn (earnings already paid out). Top-up plus Earnings makes your total spendable balance.',
       ARRAY['wallet balance','earnings','pending','pending earnings','reserved','available balance'], 'wallet'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'What do the different wallet balances mean?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I message a vendor?',
       'Tap the chat icon on an activity''s page to start a conversation with its vendor - it opens (or continues) your thread with them, pre-filled with a reference to that activity. You can also send image or file attachments. All your conversations are listed under Chat, with filters for unread messages and ones still needing your reply.',
       ARRAY['message vendor','chat','contact vendor','ask vendor'], 'general'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I message a vendor?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do I manage my notifications?',
       'Your notifications are under the notification bell, filterable by category - Wallet, Bookings & Purchases, Recommendations & Affiliate, Support, and Account & Security - or by read/unread. You can mark a single notification as read, or mark everything as read at once.',
       ARRAY['notifications','alerts','mark read','notification settings'], 'general'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do I manage my notifications?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'Can I leave a review?',
       'Not yet - you can read other travellers'' reviews on an activity''s page, but there is currently no way to submit your own review through the app.',
       ARRAY['review','rate','rating','feedback on activity'], 'general'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'Can I leave a review?');
