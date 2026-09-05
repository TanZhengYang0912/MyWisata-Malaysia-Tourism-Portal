# Staff Role Guided Assignment Design

**Status:** Approved direction; awaiting written-spec confirmation.

## Problem

The Staff Roles page exposes the correct data but does not explain the task. `Legacy Admin` and `Legacy Wallet Approver` look like internal records rather than reusable system presets. The assignment form does not show what permissions a selected role grants, what changes for the selected employee, or what to write in Governance reason. The generic `Assign role` action therefore feels unsafe and unclear.

The word “template” was also misleading. These Legacy entries are assignable system preset roles. Assigning one adds that role's permissions to an employee; it does not clone or create a new role.

## Existing implementation to reuse

- `StaffRolesTab` already loads roles, permission metadata, and active assignments.
- The staff candidate endpoint already searches active global Admin, Approver, and Super Admin users by name or email and returns the UUID internally.
- The existing assignment endpoint already creates an additive, audited assignment.
- Role permission keys can be joined to the loaded permission catalogue in the browser; no new API is required.
- Existing cards, borders, buttons, colors, spacing, icons, and confirmation dialog remain the visual system.

## Design decision

Use an inline, guided three-step assignment card. This is clearer than copy-only changes while avoiding the extra clicks and hidden context of a modal wizard.

Alternative approaches considered:

1. Copy-only clarification: smallest change, but the form would still hide the permission outcome.
2. Inline three-step flow: recommended because the complete decision stays visible and fits the existing right column.
3. Modal wizard: strongest isolation, but slower for repeat admin work and disproportionate for three fields.

## Terminology and page hierarchy

- Rename the assignment card from `Assign a staff role` to `Grant permissions to an employee`.
- Describe Legacy roles as `System preset roles`, not templates and not merely `System`.
- Clarify the page's two jobs:
  - Left: create a custom role when existing presets do not fit.
  - Right: grant an existing preset or custom role to an employee.
- Keep the underlying database names unchanged.

## Guided assignment flow

### Step 1 — Choose a permission role

- Label the selector `1. Choose a permission role`.
- After selection, show a persistent summary card with:
  - role name;
  - `System preset` or `Custom role` badge;
  - plain-language permission names;
  - an explicit additive note: `This adds permissions. Existing permissions will not be removed.`
- For `Legacy Wallet Approver`, the summary must say it grants one permission: `Approve wallet withdrawal requests`.
- Each configured-role card shows its plain-language permissions and offers `Use this role`, which selects it in Step 1 and moves focus to employee search.
- System preset definitions remain non-editable. Their cards are inspectable and usable, not disabled-looking records.

### Step 2 — Choose an employee

- Label the section `2. Choose an employee`.
- Keep name/email search and internal UUID submission.
- Add concise helper text: only active Admin, Approver, or Super Admin employees can be selected.
- Show an explicit empty result after a completed search rather than displaying general help text.
- After selection, show `Selected employee` with name, email, and current coarse staff identity.
- If the employee already has the selected role, show `This employee already has this role` and disable submission.

### Step 3 — Explain and confirm

- Label the field `3. Reason for granting access`.
- Explain that this note is stored in the audit log, not shown as part of the employee's role name.
- Use a concrete placeholder, for example: `Example: Add a second wallet approver for weekend withdrawal reviews.`
- Replace the generic CTA with a consequence-led label such as `Review granting 1 permission`.
- The confirmation dialog shows:
  - employee name and email;
  - selected role;
  - every permission being added;
  - governance reason;
  - reassurance that existing permissions remain unchanged.
- The final confirmation action says `Grant permissions`.

## Permission language

Display human-readable, localized permission names as the primary text and keep the technical permission key as secondary text where useful for administrators. Add translations for the four existing permission keys in English, Malay, and Simplified Chinese:

- Review KYC submissions
- Approve wallet withdrawal requests
- Manage vendors
- Manage sponsored map campaigns

Database-provided English descriptions remain available as fallback only.

## States and error recovery

- Searching: disable the Search button and show its busy state.
- No results: explain that no eligible active staff matched the name or email.
- Already assigned: keep the selected employee visible, explain why submission is disabled, and allow another role or employee to be chosen.
- API error: preserve the existing inline error banner.
- Success: identify the employee and granted role, then keep the audit-event action available.

## Accessibility

- Give each input an explicit `id` and matching `label`; do not wrap the search `<form>` inside a label.
- Use a real ordered-list structure or equivalent headings for the three steps.
- Announce search results, already-assigned state, errors, and success with appropriate live regions.
- Keep keyboard focus visible and move focus only when `Use this role` is intentionally activated.
- Do not rely on badge color alone to distinguish system preset and custom roles.

## Scope

### Files expected to change

- `components/admin/access-control/staff-roles-tab.tsx`
- `components/admin/access-control/__tests__/staff-roles-tab.test.tsx`
- `app/i18n/locales/en/admin.json`
- `app/i18n/locales/ms/admin.json`
- `app/i18n/locales/zh-CN/admin.json`

### Explicitly out of scope

- No database migration, schema, RLS, RPC, API, or authorization changes.
- No new role-cloning feature.
- No change to who qualifies as an employee candidate.
- No ability to add new permission catalogue keys from this screen.
- No unrelated Access Control tab redesign.
- No new dependency or new page.

## Verification

- Component tests cover permission preview, `Use this role`, search/selection, already-assigned prevention, dynamic confirmation details, and UUID-only submission.
- Verify English, Malay, and Simplified Chinese translation coverage.
- Run the affected Access Control tests, TypeScript, lint, and one focused permission/privacy review.
- Visually verify the default, selected-role, selected-employee, confirmation, no-results, already-assigned, and success states at desktop width.
