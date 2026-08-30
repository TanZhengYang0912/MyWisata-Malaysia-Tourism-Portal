alter table chat_messages add column reply_to_message_id uuid references chat_messages(id) on delete set null;;
