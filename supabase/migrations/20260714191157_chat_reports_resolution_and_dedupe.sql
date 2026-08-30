alter table chat_reports
  add column resolution_reason text,
  add column resolution_note text;

alter table chat_reports
  add constraint chat_reports_resolution_reason_check
  check (resolution_reason is null or resolution_reason in ('action_taken', 'no_violation', 'insufficient_evidence', 'spam_abuse'));

-- One OPEN report per (thread, reporter) — a user can't spam-report the same
-- conversation repeatedly while it's still pending. They CAN re-report after
-- it's resolved/dismissed (partial index only covers status='open').
create unique index chat_reports_one_open_per_reporter
  on chat_reports (thread_id, reporter_id)
  where status = 'open';
;
