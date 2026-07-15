-- Mock chat conversations + reports for testing the chat/moderation feature.
-- Idempotent (fixed ids + ON CONFLICT DO NOTHING) — safe to re-run.
-- Does NOT touch any other table; run via MCP execute_sql (not a schema migration).
--
-- Demo accounts used (see scripts/seed-remote-demo.mjs for the full roster):
--   Vendor owner  aaaaaaaa-0000-0000-0000-000000000003  vendor.owner@demo.local
--   Alice         aaaaaaaa-0000-0000-0000-000000000005  customer1@demo.local
--   Bob           aaaaaaaa-0000-0000-0000-000000000006  customer2@demo.local
--   Carol         aaaaaaaa-0000-0000-0000-000000000007  customer3@demo.local
--   Dave          aaaaaaaa-0000-0000-0000-000000000008  customer4@demo.local
--   Admin         aaaaaaaa-0000-0000-0000-000000000001  admin@demo.local

alter table chat_threads disable trigger chat_threads_welcome;

-- ── Thread A — Alice, booking inquiry (Gaya Street). Friendly, unreported. ──
insert into chat_threads (id, customer_id, outlet_id, status, created_at, last_message_at)
values ('d0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000005', '360da7be-70bc-4c99-a53c-fe8cb05d5f6f', 'open', now() - interval '5 days', now() - interval '5 days' + interval '40 minutes')
on conflict (id) do nothing;

insert into chat_messages (id, thread_id, sender_id, body, created_at) values
('e0000000-0000-0000-0000-00000000a001','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000003','Welcome! Thanks for your interest. Any questions?', now() - interval '5 days'),
('e0000000-0000-0000-0000-00000000a002','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000005','Hi! Do you have availability for a group of 6 this Saturday evening?', now() - interval '5 days' + interval '3 minutes'),
('e0000000-0000-0000-0000-00000000a003','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000003','Yes, we do! What time were you thinking?', now() - interval '5 days' + interval '6 minutes'),
('e0000000-0000-0000-0000-00000000a004','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000005','Around 7pm would be great.', now() - interval '5 days' + interval '9 minutes'),
('e0000000-0000-0000-0000-00000000a005','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000003','7pm works. Do you have any dietary restrictions we should know about?', now() - interval '5 days' + interval '12 minutes'),
('e0000000-0000-0000-0000-00000000a006','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000005','Two of us are vegetarian, and one has a peanut allergy.', now() - interval '5 days' + interval '15 minutes'),
('e0000000-0000-0000-0000-00000000a007','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000003','Noted — we''ll flag the peanut allergy with our kitchen team specifically.', now() - interval '5 days' + interval '18 minutes'),
('e0000000-0000-0000-0000-00000000a008','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000005','That''s great, thank you! Is there a deposit required?', now() - interval '5 days' + interval '21 minutes'),
('e0000000-0000-0000-0000-00000000a009','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000003','A RM50 deposit secures the booking, refundable if you cancel 24h ahead.', now() - interval '5 days' + interval '24 minutes'),
('e0000000-0000-0000-0000-00000000a00a','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000005','Perfect, I''ll book through the app now.', now() - interval '5 days' + interval '27 minutes'),
('e0000000-0000-0000-0000-00000000a00b','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000003','Looking forward to hosting you and your group on Saturday!', now() - interval '5 days' + interval '35 minutes'),
('e0000000-0000-0000-0000-00000000a00c','d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000005','Thank you so much for the quick responses!', now() - interval '5 days' + interval '40 minutes')
on conflict (id) do nothing;

-- ── Thread B — Bob, complaint/dispute (Pasar Payang). Resolved via conversation, unreported. ──
insert into chat_threads (id, customer_id, outlet_id, status, created_at, last_message_at)
values ('d0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000006', 'e93f6ad1-6518-4d32-a7c8-b6023bd70ee0', 'open', now() - interval '4 days', now() - interval '4 days' + interval '55 minutes')
on conflict (id) do nothing;

insert into chat_messages (id, thread_id, sender_id, body, created_at) values
('e0000000-0000-0000-0000-00000000b001','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000003','Welcome! Thanks for your interest. Any questions?', now() - interval '4 days'),
('e0000000-0000-0000-0000-00000000b002','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000006','We visited last night and the reservation you confirmed wasn''t honored — we waited 40 minutes.', now() - interval '4 days' + interval '4 minutes'),
('e0000000-0000-0000-0000-00000000b003','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000003','I''m very sorry to hear that. Can you share your booking reference?', now() - interval '4 days' + interval '9 minutes'),
('e0000000-0000-0000-0000-00000000b004','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000006','BK-88213. We ended up leaving without being seated.', now() - interval '4 days' + interval '13 minutes'),
('e0000000-0000-0000-0000-00000000b005','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000003','I''ve checked the log — there was a staffing gap that evening, that''s on us.', now() - interval '4 days' + interval '18 minutes'),
('e0000000-0000-0000-0000-00000000b006','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000006','This was for my parents'' anniversary. It was disappointing.', now() - interval '4 days' + interval '22 minutes'),
('e0000000-0000-0000-0000-00000000b007','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000003','I completely understand. We''d like to make this right — a complimentary dinner for 4, on us.', now() - interval '4 days' + interval '27 minutes'),
('e0000000-0000-0000-0000-00000000b008','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000006','I appreciate that, but I''m hesitant to book again after this.', now() - interval '4 days' + interval '33 minutes'),
('e0000000-0000-0000-0000-00000000b009','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000003','Totally fair. I''ll personally greet you and your parents if you''re open to giving us another chance.', now() - interval '4 days' + interval '40 minutes'),
('e0000000-0000-0000-0000-00000000b00a','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000006','Okay, we''ll try again next month. Please make sure the table is ready.', now() - interval '4 days' + interval '48 minutes'),
('e0000000-0000-0000-0000-00000000b00b','d0000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000003','Absolutely, I''ll block the table myself and confirm the day before.', now() - interval '4 days' + interval '55 minutes')
on conflict (id) do nothing;

-- ── Thread D — Dave, spam promo (Seremban Gateway). Reported + resolved. ──
insert into chat_threads (id, customer_id, outlet_id, status, created_at, last_message_at)
values ('d0000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000008', 'ab3263fd-bc1f-412d-a257-95acf3de07eb', 'open', now() - interval '2 days', now() - interval '2 days' + interval '20 minutes')
on conflict (id) do nothing;

insert into chat_messages (id, thread_id, sender_id, body, created_at) values
('e0000000-0000-0000-0000-00000000d001','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000003','Welcome! Thanks for your interest. Any questions?', now() - interval '2 days'),
('e0000000-0000-0000-0000-00000000d002','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000008','Just checking your opening hours.', now() - interval '2 days' + interval '2 minutes'),
('e0000000-0000-0000-0000-00000000d003','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000003','We''re open 11am-10pm daily! BIG SALE THIS WEEK - 50% off all set menus!', now() - interval '2 days' + interval '4 minutes'),
('e0000000-0000-0000-0000-00000000d004','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000003','Don''t miss out! Limited time offer, book NOW before slots run out!', now() - interval '2 days' + interval '6 minutes'),
('e0000000-0000-0000-0000-00000000d005','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000003','Also check out our sister restaurant for another exclusive discount code: SAVE20', now() - interval '2 days' + interval '7 minutes'),
('e0000000-0000-0000-0000-00000000d006','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000008','I just wanted the hours, please stop sending promos', now() - interval '2 days' + interval '10 minutes'),
('e0000000-0000-0000-0000-00000000d007','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000003','Sure! But have you seen our NEW loyalty program? Sign up today for FREE dessert!', now() - interval '2 days' + interval '13 minutes'),
('e0000000-0000-0000-0000-00000000d008','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000003','Last chance - sale ends midnight!', now() - interval '2 days' + interval '16 minutes'),
('e0000000-0000-0000-0000-00000000d009','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000008','This is excessive, please stop messaging me', now() - interval '2 days' + interval '20 minutes')
on conflict (id) do nothing;

-- ── Thread C — Carol's EXISTING Georgetown thread. Escalates into an abusive
-- exchange; reported by both sides (the "same thread, two reporters" crowd-signal case). ──
insert into chat_messages (id, thread_id, sender_id, body, created_at) values
('e0000000-0000-0000-0000-00000000c001','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000007','Your restaurant is a scam, you charged my card twice!', '2026-07-08 05:05:00+00'),
('e0000000-0000-0000-0000-00000000c002','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000003','I''m sorry to hear that — could you share your order ID so we can check?', '2026-07-08 05:09:00+00'),
('e0000000-0000-0000-0000-00000000c003','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000007','Why should I, you''ll just make excuses like every other useless business here', '2026-07-08 05:12:00+00'),
('e0000000-0000-0000-0000-00000000c004','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000003','We take this seriously, we just need the order ID to look into the duplicate charge.', '2026-07-08 05:16:00+00'),
('e0000000-0000-0000-0000-00000000c005','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000007','Forget it, I''m reporting this whole app, you''re all thieves and liars', '2026-07-08 05:19:00+00'),
('e0000000-0000-0000-0000-00000000c006','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000003','I understand you''re frustrated. We can process a refund once we verify the transaction.', '2026-07-08 05:23:00+00'),
('e0000000-0000-0000-0000-00000000c007','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000007','Don''t bother, I already know how this ends. Scammers.', '2026-07-08 05:26:00+00'),
('e0000000-0000-0000-0000-00000000c008','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000003','We''ve located a duplicate authorization hold — it will drop off in 3-5 business days automatically, no charge was captured twice.', '2026-07-08 05:32:00+00'),
('e0000000-0000-0000-0000-00000000c009','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000007','Whatever, I don''t believe you', '2026-07-08 05:37:00+00')
on conflict (id) do nothing;

update chat_threads set last_message_at = '2026-07-08 05:37:00+00'
where id = 'aaf965bc-a64c-44ff-a989-2b84d916bc3e' and last_message_at < '2026-07-08 05:37:00+00';

alter table chat_threads enable trigger chat_threads_welcome;

-- ── Reports ──

-- Thread C reported from both sides (crowd signal: 2 distinct reporters, same thread).
insert into chat_reports (id, thread_id, reporter_id, reason, details, status, created_at) values
('f0000000-0000-0000-0000-00000000f001','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000007','scam','They charged me twice and refused to explain.','open', now() - interval '2 hours'),
('f0000000-0000-0000-0000-00000000f002','aaf965bc-a64c-44ff-a989-2b84d916bc3e','aaaaaaaa-0000-0000-0000-000000000003','abuse','Customer used insulting language repeatedly despite our attempts to help.','open', now() - interval '1 hour')
on conflict (id) do nothing;

-- Thread D — spam, resolved with action taken.
insert into chat_reports (id, thread_id, reporter_id, reason, details, status, resolution_reason, resolution_note, resolved_by, resolved_at, created_at) values
('f0000000-0000-0000-0000-00000000f003','d0000000-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000008','spam','Vendor keeps sending promotional spam after I asked them to stop.','resolved','action_taken','Vendor warned about promotional spam in chat; repeat violations will result in a formal warning on their account.','aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day', now() - interval '2 days')
on conflict (id) do nothing;

-- Carol's 3 dismissed reports on her existing thin threads — this is the
-- "serial false-reporter" reputation scenario the admin dashboard should surface.
insert into chat_reports (id, thread_id, reporter_id, reason, details, status, resolution_reason, resolution_note, resolved_by, resolved_at, created_at) values
('f0000000-0000-0000-0000-00000000f004','63519f52-e194-484a-abcc-c2eb303b3597','aaaaaaaa-0000-0000-0000-000000000007','other','Not sure why but this felt off.','dismissed','no_violation','Reviewed the conversation — no policy violation found. Standard booking inquiry.','aaaaaaaa-0000-0000-0000-000000000001', now() - interval '3 days', now() - interval '3 days' - interval '1 hour'),
('f0000000-0000-0000-0000-00000000f005','28c6b325-0e84-4c03-a03b-b7508dc21ddb','aaaaaaaa-0000-0000-0000-000000000007','scam','I think this vendor is fake.','dismissed','insufficient_evidence','No evidence of fraudulent activity found in the conversation or transaction history.','aaaaaaaa-0000-0000-0000-000000000001', now() - interval '6 days', now() - interval '6 days' - interval '1 hour'),
('f0000000-0000-0000-0000-00000000f006','f387ee9a-47a8-47f5-aa10-89df75a15ce0','aaaaaaaa-0000-0000-0000-000000000007','abuse','They were rude to me.','dismissed','no_violation','Conversation reviewed — vendor response was professional and appropriate.','aaaaaaaa-0000-0000-0000-000000000001', now() - interval '9 days', now() - interval '9 days' - interval '1 hour')
on conflict (id) do nothing;
