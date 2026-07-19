# Withdrawal Review Actions Design

## Goal

Make the withdrawal review actions visually consistent while preserving the existing approval behavior.

## Scope

- Keep **Approve** as the dark, filled primary action.
- Render **Hold** as a visible neutral outlined secondary button.
- Render **Reject** as a visible red outlined button with a subtle red-tinted background.
- Capitalize status values shown in the review summary (`approved` → `Approved`, `low` → `Low`).
- Modify only `app/admin/withdrawals/page.tsx` and its focused UI contract test.
- Do not change APIs, RPCs, validation, permissions, or database schema.

## Acceptance Criteria

1. All available account actions have an obvious clickable button treatment.
2. Approve remains visually dominant.
3. Reject communicates a destructive action without becoming the primary action.
4. App KYC and Risk values use title case in the detail panel.
5. Existing approval, hold, reject, moderation, and reason validation behavior remains unchanged.
