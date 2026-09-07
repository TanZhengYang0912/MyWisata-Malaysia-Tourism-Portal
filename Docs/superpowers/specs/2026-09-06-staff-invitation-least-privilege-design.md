# Staff Invitation and Least-Privilege Access Design

**Status:** Approved design; awaiting written-spec confirmation.

## Problem

Staff Roles currently solves only half of the staffing workflow. A Super Admin can create a reusable permission role and assign it to an existing global Admin, Approver, or Super Admin, but cannot invite a new employee who has no MyWisata account. The current employee search therefore cannot create an identity, send a real email, collect the employee's consent, or connect a newly registered account to the selected role.

Assigning a new employee the existing coarse `admin` identity would also violate the requested least-privilege model. The Admin shell still exposes many modules by coarse role, while configurable Staff Roles currently enforce only four dedicated permission keys. A new employee must not gain broad Admin access merely to enter the back office.

## Existing implementation to reuse

- Staff Role definitions, permission membership, assignments, governed mutation RPCs, and audit receipts already exist.
- The Staff Roles page already displays active system and custom roles and their human-readable permission lists.
- `requireStaffRoleManagementSuperAdmin()` is the existing server guard for Staff Role governance.
- The project already has an SMTP sender and tested HTML/text email rendering patterns.
- Outlet Manager invitations provide reusable patterns for random tokens, SHA-256 token hashes, expiry, email matching, invitation preview, acceptance, and login/registration UX.
- The main login page supports password login, password registration, email verification, and Google OAuth.
- The auth callback already preserves selected invitation return paths and can be extended for Staff invitation paths.
- `requireStaffPermission()` and `has_staff_permission()` already enforce four high-risk mutation boundaries.

The Outlet Manager invitation implementation is a reference, not a drop-in solution: its creation endpoint returns a link instead of sending mail, it grants an outlet-scoped role, and it does not implement the strict Staff identity or permission-filtered Admin shell required here.

## Confirmed product decisions

- This is a real email invitation flow, not manual account creation by the Super Admin.
- New employees receive a dedicated base `staff` identity, not the broad legacy `admin` identity.
- First release supports only the four existing Staff permission keys:
  - `admin.kyc.review`
  - `admin.withdrawal.approve`
  - `admin.vendor.manage`
  - `admin.map_campaign.manage`
- An invited Staff user can see and invoke only the modules represented by their effective permission set.
- Email addresses already carrying any MyWisata application role—including Customer, Vendor Owner, Outlet Manager, Staff, Admin, Approver, or Super Admin—cannot enter the new-employee invitation flow. The only exception is a roleless identity created solely from an earlier attempt for the same Staff invitation email; it may resume or receive a replacement invitation.
- Existing Staff employees are managed in a separate “Employees and permissions” area and are not sent through the new-employee invitation flow.
- An invitation is valid for seven days.
- Resending rotates the token and immediately invalidates every earlier link.
- The recipient sees the role and permissions, then signs in or registers with the exact invited email and explicitly accepts.
- Registration supports name/password for any valid invited email and Google login when Google returns the exact same verified email, including Gmail or Google Workspace addresses. The feature is not Gmail-only.
- Accepted employees land on a dedicated Staff home page showing only authorized work areas.
- Governance reasons are internal and never included in invitation email content.

## Approaches considered

### 1. Dedicated governed Staff invitation domain — selected

Use an application-owned invitation record, custom SMTP email, public acceptance page, new `staff` base role, transactional acceptance, and permission-filtered Staff access. This preserves auditability, explicit consent, revocation, resend, expiry, and strict least privilege.

### 2. Supabase native invitation email

This would reduce identity-provisioning work but couples the product flow to Supabase email templates and makes application-level role consent, delivery state, resend/revoke behavior, and governance history harder to express consistently.

### 3. Pre-created account with a temporary password

This is operationally simple but makes an administrator handle initial credentials and grants an account before the intended recipient confirms control. It was rejected.

## Terminology and page responsibilities

The Staff Roles tab has three distinct responsibilities:

1. **Create a custom role** — define a reusable name, description, and permission combination.
2. **Invite a new employee** — send one role to a new, dedicated employee email for explicit acceptance.
3. **Employees and permissions** — inspect joined Staff, adjust their assignments, and manage pending invitations.

The invitation form must not contain an “existing employee” mode. Existing employees are selected only from “Employees and permissions.”

## Identity and permission model

### Base identity

Add `staff` to the coarse role catalogue and application `Role` types. A global `staff` role only makes the account eligible for the Staff shell; it grants no business permission by itself.

`has_staff_permission()` must recognize an active global `staff` identity as assignment-eligible while preserving the existing behavior for Legacy Admin, Wallet Approver, and Super Admin. The effective permission set is the union of active assignments whose Staff Roles are active.

Super Admin retains its implicit access. Legacy Admin and Legacy Wallet Approver remain compatible and unchanged. New invitation recipients do not receive either legacy coarse identity.

### Invitation-time identity isolation

Invitation creation rejects an email already belonging to any application user with a Customer, Vendor Owner, Outlet Manager, Admin, Approver, Super Admin, or Staff role. Existing Staff must be adjusted from “Employees and permissions.” This prevents role mixing and duplicate onboarding.

Email identity normalization uses one shared helper that trims surrounding whitespace and lowercases the complete address after standard email validation. It does not remove Gmail dots, strip `+tag` suffixes, or apply provider-specific alias rules. Invitation, password-auth, and verified OAuth emails must match by that same normalization rule.

The normal auth-user trigger currently assigns every new auth identity the Customer role. It must be extended so a new auth identity whose normalized email matches one live, unexpired Staff invitation is instead provisioned as a roleless pending Staff identity and bound to that invitation. It receives neither Customer nor Staff access at this stage.

This pending identity may complete email verification, password login, or Google OAuth and resume the same invitation. If the invitation expires, a Super Admin may resend it; the same bound, roleless identity can resume. Revoking or expiring a claimed invitation does not delete the auth identity: it remains roleless and inaccessible until a Super Admin resends or replaces the invitation for the same email. A roleless invitation identity cannot access Customer, Vendor, Staff, or Admin areas.

Replacing a revoked invitation for a previously claimed email is an atomic server-side operation. It locks the old invitation and roleless identity, verifies the normalized email still matches and the identity still has no application role, creates the new pending invitation with the same `claimed_by`, and leaves the old row permanently revoked. At most one pending invitation may exist for the normalized email, and acceptance enforces `accepted_by = claimed_by`.

### Acceptance

Acceptance is a single governed database transaction. It must:

1. Lock the invitation row.
2. Verify `pending` status, current token hash, expiry, a verified authenticated email, and an exact normalized-email match.
3. Verify the authenticated user is the invitation-bound roleless identity and has no Customer, Vendor, Outlet Manager, or other global role.
4. Verify the selected Staff Role is active and unchanged from the invitation snapshot.
5. Add the global `staff` role.
6. Add the Staff Role assignment.
7. Mark the invitation accepted and record the accepting user and timestamp.
8. Insert the invitation-acceptance and permission-assignment audit facts.

Any failure rolls back all database changes. Repeated acceptance returns the stable `already_used` conflict without writing again or creating duplicate assignments.

## Invitation data model

Create `public.staff_invitations` with the following logical fields:

- identity: `id`, normalized `invited_email`, nullable bound `claimed_by` user;
- authorization: `staff_role_id`, role-name snapshot, sorted permission-key snapshot;
- governance: `invited_by`, sanitized `reason` of 10–500 characters, nullable sanitized `revoked_reason` of 10–500 characters;
- secret lifecycle: unique `token_hash`, `expires_at`;
- invitation lifecycle: `status` (`pending`, `accepted`, `revoked`), with expiry derived from `expires_at`;
- delivery lifecycle: `delivery_status` (`pending`, `sending`, `sent`, `failed`), send-attempt count, last attempted/sent timestamps;
- completion: `accepted_by`, `accepted_at`, `revoked_by`, `revoked_at`;
- timestamps: `created_at`, `updated_at`.

Constraints and indexes must enforce:

- normalized nonblank email no longer than 254 characters;
- one pending invitation per normalized email;
- one token hash per live or historical invitation;
- accepted/revoked fields consistent with status, including `accepted_by = claimed_by`;
- expiry after creation;
- valid role and inviter references.

The permission snapshot records what the recipient was asked to accept. If the role name or permission keys change before acceptance, the invitation becomes non-acceptable and must be resent so consent is based on current information. A disabled role is likewise non-acceptable and cannot be resent until it is re-enabled; the Super Admin may instead revoke it and create a replacement invitation with a different active role.

The lifecycle state machine is exact:

- create produces `pending` with a future `expires_at`;
- the UI/API presents `pending` with `expires_at <= now()` as expired, without a scheduled status mutation;
- accept atomically changes an unexpired, unchanged `pending` record to `accepted`;
- revoke atomically changes any `pending` record, expired or not, to `revoked` and records the new revocation reason;
- resend is allowed for `pending` records after cooldown, including records whose delivery failed, whose delivery outcome is unknown, or whose expiry passed; it atomically rotates the token, refreshes role/permission snapshots and `expires_at`, and keeps lifecycle status `pending`;
- `accepted` and `revoked` are terminal and cannot be resent or reopened.

RLS exposes no direct table writes to browser roles. Super Admin reads and all mutations go through guarded server APIs or governed RPCs. Public preview is performed server-side by token hash and returns only the invitation summary required by the recipient.

## Token and email delivery design

- Generate at least 32 cryptographically random bytes for each send.
- Put the raw token only in the emailed HTTPS invitation URL.
- Store only the SHA-256 token hash in `staff_invitations`.
- Never store the raw token in audit logs, application/API logs, analytics, browser storage, email-outbox payloads, or database metadata.
- Public preview and acceptance responses use `Cache-Control: no-store`.
- Invitation pages set `Referrer-Policy: no-referrer`, load no third-party resources, and redact token-bearing paths from request/error telemetry.

Invitation creation commits the invitation record before attempting SMTP delivery. Each send attempt first persists the token hash, expiry, snapshots, incremented attempt count, and delivery status `sending`; it then calls SMTP and finalizes the status as `sent` or `failed`. A `sending` attempt older than the configured send timeout is displayed and treated by the resend endpoint as an unknown outcome, meaning the email may have left the provider even though final delivery state was not recorded. Retrying an unknown outcome warns the Super Admin that a duplicate email may arrive, rotates the token so every older link becomes unusable, and proceeds after cooldown. A retry otherwise follows the same preparation sequence. The discarded raw token from a failed request cannot be recovered.

Resend is available only for lifecycle-`pending` invitations after cooldown, including delivered, failed-delivery, derived-unknown-delivery, and derived-expired cases. It never reopens an accepted or revoked invitation. Replacing a revoked invitation creates a new invitation record and audit history.

Apply a resend cooldown to prevent accidental email bursts. Revocation changes the lifecycle status to `revoked`; all preview and acceptance paths reject revoked records regardless of the retained historical token hash.

The email includes:

- MyWisata Staff invitation purpose;
- role name;
- localized, human-readable permission list;
- exact expiry time in Malaysia time;
- one “Review and accept invitation” action;
- security guidance for an unexpected invitation.

It excludes the governance reason, UUIDs, technical permission keys, raw audit data, and unrelated account information.

Invitation URLs are built only from a validated server-side application-origin configuration. Request `Host` and forwarded-host headers are never trusted to construct the link.

## API boundaries

All administrative endpoints authenticate and authorize the Super Admin before parsing privileged mutation data or creating a service client.

### Super Admin endpoints

- `GET /api/admin/access-control/staff-invitations`
  - Lists invitation summaries and delivery/lifecycle state.
- `POST /api/admin/access-control/staff-invitations`
  - Validates email, role, reason, uniqueness, and account isolation; creates and sends an invitation. For a matching roleless identity from a revoked invitation, it performs the governed replacement/rebind operation described above. The response contains only invitation ID, lifecycle/delivery state, and expiry—never the raw token or invitation URL.
- `POST /api/admin/access-control/staff-invitations/[invitationId]/resend`
  - Rotates the token, refreshes snapshots/expiry, and sends again. Its response likewise never contains the raw token or invitation URL.
- `POST /api/admin/access-control/staff-invitations/[invitationId]/revoke`
  - Requires a new governance reason and revokes a pending invitation.
- Existing Staff Role assignment/revocation endpoints remain the mutation path for joined employees.

### Recipient endpoints

- `GET /api/staff-invitations/[token]`
  - Returns role, human-readable permissions, the normalized invited email required by the acceptance page's fixed registration field, expiry, and safe lifecycle state. Possession of the bearer token authorizes only this no-store invitation summary.
- `POST /api/staff-invitations/[token]/accept`
  - Requires an authenticated matching identity and invokes the transactional acceptance RPC.

Invalid, expired, revoked, already-used, changed-role, and mismatched-email cases return stable public error codes without exposing whether unrelated accounts exist.

## Authentication and routing

Add `/staff-invitations/[token]` to validated post-auth return paths. Password registration and Google OAuth must return to that exact sanitized path.

The acceptance page supports these states:

- valid invitation, signed out;
- password registration;
- email verification pending;
- Google login;
- matching authenticated pending identity;
- wrong authenticated email with a “Switch account” action;
- expired, revoked, used, role-changed, and invalid invitation;
- acceptance in progress, success, and recoverable failure.

After acceptance, refresh the auth profile and redirect to `/staff`.

Update auth role resolution and post-login routing so `staff` lands on `/staff`. Existing Customer, Vendor, Admin, Approver, and Super Admin destinations remain unchanged.

## Strict Staff authorization

### Staff shell and home

`/staff` is a dedicated home page showing:

- employee name;
- assigned Staff Role names;
- effective human-readable permissions;
- one work card per authorized module.

If there are no active permissions, it shows a contact-administrator state and no operational links.

The existing Admin layout is extended with an explicit Staff mode so shared shell components and styling remain reusable. In Staff mode, navigation is derived from effective permission keys rather than coarse-role allowlists. The four mappings are:

| Permission | Work area |
| --- | --- |
| `admin.kyc.review` | KYC Review |
| `admin.withdrawal.approve` | Withdrawals |
| `admin.vendor.manage` | Vendor Approvals |
| `admin.map_campaign.manage` | Sponsored Placements |

No other Admin navigation, global counts, search results, or command-palette actions are visible to Staff.

### Page and API enforcement

Navigation filtering is convenience only. Every list, detail, mutation, attachment, count, export, and supporting endpoint used by each of the four work areas must call the corresponding Staff permission guard. Direct URLs without permission render a forbidden state or redirect to `/staff` without fetching protected data.

Other Admin pages continue rejecting the new `staff` coarse role. Their APIs must not become reachable merely because the shared shell recognizes Staff.

Database functions and RLS policies used by these work areas must recognize only the corresponding permission. Existing ownership, self-dealing, assignment, dual-control, and audit invariants remain in force.

## Staff Roles page UX

### Invite a new employee

The new invitation card is a focused sequence:

1. Choose one active Staff Role and preview its current permissions.
2. Enter the employee email.
3. Enter the internal governance reason.
4. Review email, role, permissions, expiry, and consequence.
5. Send the invitation.

It has no existing-employee toggle.

### Employees and permissions

This separate area contains:

- active Staff employees with name, email, role assignments, effective permissions, and joined date;
- actions to add another Staff Role or revoke one existing assignment with a governance reason;
- pending invitations with role, expiry, delivery state, resend, and revoke actions;
- accepted, revoked, and expired invitations in a secondary history view.

Effective permissions are additive across active role assignments. Revoking one role does not remove permissions supplied by another role. A Staff identity with no active assignments remains able to sign in to `/staff` but has no operational access.

## State and error handling

- Duplicate pending invitation or existing role-bearing identity: do not create or send; direct existing Staff management to “Employees and permissions.” A matching roleless identity from a revoked Staff invitation follows only the governed replacement/rebind path.
- SMTP failure: preserve the invitation with failed delivery state and expose retry.
- Resend cooldown: disable resend with remaining wait time.
- Role changed or disabled: block acceptance and direct the recipient to request a new invitation.
- Wrong email session: never reveal account details; require account switching.
- Expiry: derive the expired presentation from `pending` plus `expires_at <= now()`, deny preview/acceptance, and offer Super Admin resend after cooldown.
- Concurrent acceptance/revocation: row locking makes one transition win and the other return a stable conflict.
- Database or authorization uncertainty: fail closed and grant no permission.
- Success notices link to the global audit event where appropriate.

## Audit and privacy

Audit events cover invitation creation, delivery retry, revocation, acceptance, role assignment, and later role revocation. They include actor, target or normalized invited email, role, permission snapshot, sanitized governance reason, timestamp, and outcome.

Never audit or log raw tokens, passwords, OAuth material, SMTP credentials, Supabase service keys, or full provider error objects. Public errors do not enumerate unrelated user accounts. Administrative invitation lists expose recipient emails only to authorized Super Admins.

## Accessibility and localization

- Provide explicit labels and descriptions for email, role, reason, and confirmation controls.
- Use live regions for send, retry, acceptance, and error state.
- Keep invitation lifecycle distinguishable by text and icon, not color alone.
- Preserve keyboard focus when opening confirmation and after retry/revoke actions.
- Localize the Staff Roles additions, invitation email, acceptance page, Staff home, permission labels, statuses, and stable user-facing errors in English, Malay, and Simplified Chinese.
- Technical permission keys may appear only as secondary Super Admin detail, not as the recipient's primary explanation.

## Testing strategy

### Database and authorization

- Invitation table constraints, partial uniqueness, RLS, grants, and token-hash-only storage.
- Pending Staff auth provisioning skips the default Customer role and binds only the matching pending email.
- Email normalization matches case-insensitively without collapsing provider-specific dot or `+tag` aliases.
- Revoked-invitation replacement atomically rebinds the same still-roleless identity while leaving the old invitation terminal.
- Transactional acceptance checks status, token, expiry, email, claim identity, role activity/snapshot, and conflicting roles.
- Acceptance creates exactly one global `staff` role and one Staff Role assignment with audit facts.
- Resend invalidates the old token; revoke and expiry fail closed.
- Effective permission union and removal behavior.
- Direct database/RPC attempts without authority are rejected.

### Server routes and email

- Super Admin guard executes before service access, parsing, or SMTP.
- Existing identities and duplicate pending invitations are rejected without sending.
- Successful send uses the expected recipient, role summary, permission labels, expiry, and URL.
- Invitation and resend responses never return the raw token or invitation URL, and link origin never comes from request host headers.
- Governance reason and raw token never enter persisted email-outbox or audit payloads.
- SMTP failures preserve a retryable invitation state.
- Stale `sending` delivery state is treated as an unknown outcome and retry invalidates the earlier link.
- Public preview and acceptance return stable, non-enumerating errors.

### UI and routing

- Invitation form, review confirmation, success, duplicate, SMTP failure, retry, revoke, and cooldown states.
- Acceptance with password and Google, wrong email, verification pending, expired/revoked/used/role-changed links, and successful redirect.
- Staff home permission cards and empty state.
- For each of the four permissions: allowed menu/page/read/write behavior and denied behavior for the other three.
- Direct unauthorized URL access fetches no protected data.
- Super Admin, Legacy Admin, Wallet Approver, Customer, Vendor Owner, and Outlet Manager regression coverage.
- English, Malay, and Simplified Chinese translation coverage.

## Scope boundaries

### In scope

- Dedicated Staff identity and post-login destination.
- New Staff invitation persistence, APIs, SMTP email, acceptance page, and transactional acceptance.
- New invitation and employee-management surfaces inside Staff Roles.
- Dedicated Staff home.
- Complete least-privilege enforcement for the four existing Staff permissions, including their supporting read endpoints.
- Required auth provisioning, navigation, localization, audit, migration, and test changes.

### Out of scope

- Adding new permission keys for Refunds, Catalogue Review, Support, Chat Reports, Affiliate, Chatbot, AI Assistant, User Management, Wallet Settings, Payout Reports, Recommendations, or Staff Conduct.
- Inviting an email that already carries any MyWisata application role, including Customer, Vendor Owner, Outlet Manager, Staff, Admin, Approver, or Super Admin.
- Multiple roles in one invitation; additional roles are granted after joining from “Employees and permissions.”
- Bulk Staff import or bulk invitation.
- Custom invitation-email editing by the Super Admin.
- SMS invitations, phone OTP, SCIM, enterprise SSO, or organization/domain allowlists.
- Changes to Vendor or Outlet Manager onboarding.
- Refactoring unrelated Admin pages or permission systems.

## Success criteria

The feature is complete when a Super Admin can choose any active Staff Role, send a real seven-day email invitation to a new dedicated employee email, and see its delivery/lifecycle state; the recipient can register or use matching Google login, review the exact role and permissions, explicitly accept, and arrive at `/staff`; and the resulting employee can see, read, and mutate only the subset of the four governed modules represented by their active Staff Role assignments. Every unauthorized menu, page, API, and database path must fail closed while existing role behavior remains unchanged.
