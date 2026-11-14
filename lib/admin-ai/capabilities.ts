// P4 — Member 4: admin capability ("how do I…") registry for the admin AI
// assistant.
//
// WHY THIS EXISTS: lib/admin-ai/queries.ts answers "what is the number?"
// questions. It cannot answer "how do I approve a withdrawal?" or "what can
// I do on this panel?" — those aren't data questions, so the picker returns
// {"query": null} and the admin gets the generic no-match line. This
// registry is the second half: the same router idea, but for procedural
// questions about the admin panel itself.
//
// Deliberately a STATIC registry, not a DB table like the customer chatbot's
// chatbot_kb_documents:
//   - mirrors QUERY_REGISTRY's established shape in this same module
//   - adds no table, no RLS surface, and no new permission boundary
//   - lives in version control beside the routes it documents, so a reviewer
//     changing an admin route sees this file in the same diff
//   - no embedding/reindex step to forget
//
// GROUNDING RULE (same discipline as queries.ts): every line below was read
// off the real route/schema/layout files cited in each entry's `source`. If
// a limit, role, or action isn't in the code, it is NOT stated here. No
// invented SLAs, no aspirational features. When an admin route changes,
// update the matching entry — the `source` field is there to make that
// lookup mechanical.

import { STAFF_WORKFLOWS, workflowsForGuide, type StaffWorkflow } from './workflows';

export type AdminRole = 'super_admin' | 'admin_or_approver';

export interface LifecycleStage {
  /** The status as shown on the page. */
  status: string;
  /** Who moves an item into this status. */
  by: string;
  /** What the status means and what can happen next. */
  detail: string;
}

export interface AdminCapability {
  /** Stable slug the picker returns. */
  name: string;
  /**
   * Title shown in Staff Help when the sidebar label differs from `name`
   * (e.g. the reconciliation page is "Order Breakdown" in the sidebar).
   * Keep it equal to the English sidebar label so staff can search for it.
   */
  title?: string;
  /** One line shown to the picker LLM — what questions this entry answers. */
  description: string;
  /** Where it lives in the admin panel. */
  path: string;
  /**
   * Who can actually use it. Every /admin page requires admin, approver, or
   * super_admin (app/admin/layout.tsx useRequireRole); `super_admin` here
   * means the stricter gate on top of that.
   */
  role: AdminRole;
  /** What the admin can actually DO — each verified against a real route. */
  actions: string[];
  /** Constraints/gotchas that are real (validation minimums, dual approval…). */
  notes?: string[];
  /**
   * For a page that runs a whole activity on its own: the statuses an item
   * moves through, in order, including side paths. Status names match what
   * staff see on the page.
   */
  lifecycle?: LifecycleStage[];
  /**
   * Distinctive phrases that identify this section, used by the keyword
   * fast-path in matchCapabilityByKeywords(). Keep them SPECIFIC: a phrase
   * that could plausibly belong to two sections must not be here, since an
   * ambiguous hit is what makes the fast path defer to the LLM picker
   * instead of guessing.
   */
  keywords: string[];
  /** File(s) this entry was derived from — for keeping it honest on change. */
  source: string;
}

export const CAPABILITY_REGISTRY: AdminCapability[] = [
  {
    name: 'dashboard',
    title: 'Overview',
    description: 'The admin Overview/dashboard page: where to see platform activity at a glance.',
    path: '/admin/dashboard',
    role: 'admin_or_approver',
    actions: [
      'See an at-a-glance overview of platform activity, including withdrawals waiting for review',
    ],
    keywords: ['dashboard', 'overview page'],
    source: 'app/admin/dashboard/page.tsx',
  },
  {
    name: 'vendor_approvals',
    title: 'Vendor review',
    description:
      'Reviewing vendor applications: approving, rejecting, or requesting more information from a vendor; sending the approval email; suspending a vendor; linking a recommendation to a vendor.',
    path: '/admin/vendors',
    role: 'admin_or_approver',
    actions: [
      'Approve a vendor application: this also grants the applicant the vendor_owner role automatically',
      'Reject an application, with an optional rejection reason',
      'Request more information, which puts the application into a needs-information state',
      'Send the vendor approval email, either written yourself or started from an AI draft',
      'Suspend or unsuspend an existing vendor',
      'Link an approved recommendation to a vendor, or send a recommendation invite',
    ],
    notes: [
      'Approving is what activates the vendor account: until then nothing they set up is visible to travellers.',
      'The reason typed for a reject, suspend, or request-more-information action is not cosmetic: it becomes the body of the actual email and in-app notification the vendor receives. A "Draft with AI" button on that reason box will draft it (rejection notice / suspension warning / follow-up request) for the admin to edit before confirming.',
    ],
    keywords: ['vendor application', 'approve a vendor', 'vendor approval', 'reject a vendor', 'suspend a vendor', 'approval email'],
    source:
      'app/api/admin/vendors/[id]/approve/route.ts, [id]/suspend, [id]/approval-email(+/draft), vendors/link-recommendation, vendors/recommendation-invite, lib/validation/vendor-schemas.ts',
  },
  {
    name: 'catalogue_review',
    title: 'Catalogue',
    description:
      'Reviewing vendor-submitted listings (outlets, products, and vouchers) that are waiting for approval before going live.',
    path: '/admin/catalogue',
    role: 'admin_or_approver',
    actions: [
      'See every outlet, product, and voucher currently in pending_review',
      'Approve an item, which sets it live/active',
      'Reject an item, which leaves it inactive',
      'Attach a review note explaining the decision',
    ],
    notes: [
      'Only items still in pending_review can be actioned: one already reviewed returns a conflict.',
      'Every decision is written to content_reviews and notifies the vendor.',
    ],
    keywords: ['catalogue', 'catalog', 'pending listing', 'approve a product', 'approve an outlet', 'approve a voucher', 'listing review'],
    source: 'app/api/admin/catalogue/reviews/route.ts, lib/validation/vendor-schemas.ts',
  },
  {
    name: 'hotel_amenities',
    title: 'Hotel Amenities',
    description: 'Managing the amenity checklist hotels tick in their hotel profile.',
    path: '/admin/catalogue/hotel-amenities',
    role: 'admin_or_approver',
    actions: [
      'Open it from Catalogue Review with the manage hotel amenities button',
      'See every amenity with its code, English, Malay and Chinese labels, and whether it is active',
      'Add an amenity with a code, the three labels and an icon',
      'Activate or deactivate an amenity',
    ],
    notes: [
      'Needs the catalogue review permission.',
      'Codes use 2 to 40 lowercase letters, numbers and underscores, and must be unique; labels are up to 60 characters.',
    ],
    keywords: ['hotel amenity', 'hotel amenities', 'amenity checklist'],
    source: 'app/admin/hotel-amenities/page.tsx, app/api/admin/hotel-amenities/route.ts',
  },
  {
    name: 'sponsored_placements',
    title: 'Sponsored Ads',
    description:
      'Reviewing and approving vendor-submitted sponsored product placements: paid promotional slots targeted by state/category over a time window.',
    path: '/admin/sponsored-placements',
    role: 'admin_or_approver',
    actions: [
      'See placements grouped by lifecycle: active, pending approval, drafts, paused, archived/rejected',
      'Create a placement for a product: a specific state or all states, a specific category or all categories, a start/end window, and a priority',
      'Preview the impact of creating or approving a placement before committing: what it would displace',
      'Approve a pending placement, or reject it with a reason',
      'Pause an active placement',
    ],
    notes: ['Every create or approve is preceded by an impact preview the admin must confirm before it takes effect.'],
    keywords: ['sponsored placement', 'sponsored product', 'promotional slot', 'placement approval'],
    source: 'app/admin/sponsored-placements/page.tsx, components/admin/sponsored-placements/impact-dialog.tsx, lib/sponsored-placements/impact.ts',
  },
  {
    name: 'user_management',
    title: 'Users',
    description:
      'Managing platform user accounts: suspending, unsuspending, deleting, restoring an account, or clearing a bio restriction.',
    path: '/admin/users',
    role: 'super_admin',
    actions: [
      'Search and filter platform users, and open a user to see their details',
      'Suspend an account, or unsuspend a suspended one',
      'Soft-delete an account, or restore a deleted one',
      'Clear a bio restriction on an account',
    ],
    notes: [
      'Super Admin only: this section is hidden from the admin and approver roles.',
      'Every action requires a reason of at least 10 characters.',
      'An account with a pending or processing withdrawal cannot be deleted this way.',
    ],
    keywords: ['user management', 'suspend a user', 'suspend an account', 'delete a user', 'delete an account', 'restore an account', 'unsuspend', 'bio restriction', 'manage users'],
    source:
      'app/api/admin/users/route.ts, users/[userId]/route.ts, lib/validation/user-management-schemas.ts, supabase/migrations/054_account_moderation_rpc.sql',
  },
  {
    name: 'access_control',
    title: 'Access Control',
    description:
      'Staff role/permission management (the live authorization system), plus a newer policy-based entitlements engine still running in shadow mode for parity-testing before cutover.',
    path: '/admin/access-control',
    role: 'super_admin',
    actions: [
      'Staff Roles tab: the real, currently-enforced system. See and manage which staff/admin users hold which role/permission, invite new staff, review role candidates',
      'Capabilities tab: browse the newer entitlements engine\'s capability key definitions',
      'Policies tab: author and version policies (draft, pending_approval, scheduled, active, retired) for the new engine',
      'Assignments tab: assign a policy/capability to a subject (user, role, plan, or partner) in the new engine',
      'Audit Log tab: see every change made across these tabs',
      'Shadow Report: compares what the new policy engine WOULD decide against what the real staff-permission system actually decided, without changing real access',
    ],
    notes: [
      'Super Admin only.',
      'The Capabilities / Policies / Assignments / Audit Log tabs belong to a SHADOW entitlements engine: it is not yet the live authorization path and grants or denies nothing on its own.',
      'Real staff access is still governed by the Staff Roles tab (the staff_permissions table / has_staff_permission RPC): the same system every gated admin route checks.',
    ],
    keywords: ['access control', 'staff role', 'staff permission', 'entitlements', 'shadow report', 'policy engine'],
    source: 'app/admin/access-control/page.tsx, components/admin/access-control/*, app/api/admin/access-control/*, lib/entitlements/*, lib/staff-permissions/server.ts',
  },
  {
    name: 'kyc_review',
    title: 'KYC',
    description:
      'Reviewing customer KYC identity verification: the review queue, document checks, two-reviewer approval, information requests, rejections, identity resolutions and KYC security status.',
    path: '/admin/kyc',
    role: 'admin_or_approver',
    actions: [
      'Work the review queue oldest first: start the next applicant or continue your current review, filter by review status, and search by name, email or document type',
      'Open the front and back document images in a short-lived secure viewer and compare them with the identity captured at submission and the automated OCR check (matched, mismatch, unreadable or unavailable)',
      'Approve: open both current images, enter the actual document type, issuing country, the name and the document number you read, say why manual confirmation was needed, and pick an independent second reviewer',
      'As the second reviewer, inspect both images yourself and confirm the same name and number; the approval can be submitted once both confirmations are recorded',
      'Reject with a reason (expired, incomplete, details do not match, suspected tampering, unreadable, or other with at least 10 characters of detail), or request more information from the customer',
      'Start an identity resolution for a conflict or correction: replace an account\'s previous identity, record a historical identity conflict, or freeze a contested legacy ownership record. It needs an independent second resolver; both confirm the current evidence, then it can be applied, or cancelled with a reason',
      'Check KYC security status: the latest document cleanup run, document-access alerts, and whether their notifications are queued',
    ],
    notes: [
      'KYC approval is what unlocks withdrawals for that customer.',
      'KYC review needs an authenticator code on top of your sign-in; the first time, KYC review asks you to set one up.',
      'Opening a case assigns it to you. A case assigned to another reviewer stays visible, but only its assignee or a Super Admin can decide it.',
      'The document number you enter becomes a protected match key; it is not stored in plain text.',
      'A case waiting for the customer (information requested) cannot be decided until they resubmit.',
      'Applying an identity resolution only reserves or transfers the identity key for fresh verification; the account stays unverified until a normal KYC approval succeeds. Identity resolution needs its own staff permission.',
    ],
    lifecycle: [
      { status: 'Draft', by: 'Customer', detail: 'Started but not yet submitted.' },
      { status: 'Pending review', by: 'Customer', detail: 'Submitted and waiting in the review queue, oldest first. Opening it assigns it to that reviewer.' },
      { status: 'Info requested', by: 'Reviewer', detail: 'More information was asked for. Nothing more can be decided until the customer resubmits.' },
      { status: 'Superseded', by: 'System', detail: 'When the customer resubmits after an information request, the earlier submission is replaced and the new one goes back to Pending review.' },
      { status: 'Approved', by: 'Reviewer and an independent second reviewer', detail: 'Both confirmed the identity evidence. The customer is now KYC verified, which unlocks withdrawals.' },
      { status: 'Rejected', by: 'Reviewer', detail: 'Declined with a reason.' },
    ],
    keywords: ['kyc', 'identity verification', 'id document', 'identity document', 'second reviewer', 'identity resolution'],
    source: 'app/admin/kyc/page.tsx, components/admin/kyc-review-detail.tsx, app/api/admin/kyc/{review,review/confirm,review/countersign,identity-resolutions,security-status,work}/route.ts',
  },
  {
    name: 'withdrawals',
    description:
      'Reviewing and actioning customer withdrawal/payout requests: approving, rejecting, holding, resuming, or overriding a fraud block.',
    path: '/admin/withdrawals',
    role: 'admin_or_approver',
    actions: [
      'Browse and filter withdrawal requests, and open one for full detail',
      'Approve a withdrawal, which triggers the actual payout',
      'Reject a withdrawal',
      'Put a withdrawal on hold, and later resume it',
      'Override a fraud block on a withdrawal',
    ],
    notes: [
      'Approving or rejecting requires a note of at least 10 characters plus a reason category.',
      'Requests at or above the configured dual-approval threshold need two different approvers: the first approval is recorded and waits for a second approver before any payout happens.',
      'The threshold itself is configurable in Wallet Settings.',
      'Approving, retrying a payout, and overriding a fraud block each need a fresh passkey confirmation tied to that exact withdrawal; if the withdrawal changes before you confirm, refresh and confirm again.',
    ],
    lifecycle: [
      { status: 'Pending', by: 'Customer', detail: 'Requested from the Wallet page. The amount moves from earnings to reserved while it waits for review.' },
      { status: 'Pending second approval', by: 'Approver or Super Admin', detail: 'At or above the dual-approval threshold, the first approval is recorded here and a different approver must also approve.' },
      { status: 'Approved, then Processing', by: 'System', detail: 'Once it has enough approvals, the payout is sent to the payment provider.' },
      { status: 'Paid', by: 'System', detail: 'The payment provider confirmed the payout.' },
      { status: 'Failed', by: 'System', detail: 'The payment provider could not pay out. Staff can retry the payout after a fresh passkey confirmation.' },
      { status: 'Hold', by: 'Approver or Super Admin', detail: 'Paused for checking. Resuming it returns it to review.' },
      { status: 'Overdue', by: 'System', detail: 'Still waiting after the escalation window, so Super Admins are notified. It can still be approved, held or rejected.' },
      { status: 'Rejected', by: 'Approver or Super Admin', detail: 'Declined with a reason. The reserved amount goes back to the customer\'s earnings.' },
    ],
    keywords: ['withdrawal', 'payout request', 'approve a payout', 'dual approval', 'fraud override'],
    source:
      'app/api/admin/withdrawals/[id]/{approve,reject,hold,resume,fraud-override}/route.ts, lib/wallet/withdrawal-risk.ts',
  },
  {
    name: 'wallet_settings',
    title: 'Wallet',
    description:
      'Configuring wallet and withdrawal policy: clearance days, minimum withdrawal, dual-approval threshold and escalation timers.',
    path: '/admin/wallet/settings',
    role: 'super_admin',
    actions: [
      'Change the clearance period (1–30 days)',
      'Change the minimum withdrawal amount',
      'Change the dual-approval threshold that decides which withdrawals need two approvers',
      'Change the escalation window (24–168 hours) and the hold escalation window (24–720 hours)',
    ],
    notes: [
      'Super Admin only.',
      'Every settings change requires a reason of at least 10 characters and a reason category.',
      'Who can approve withdrawals is managed on Wallet Approvers (see wallet_approvers).',
    ],
    keywords: ['wallet setting', 'clearance period', 'clearance days', 'dual approval threshold', 'minimum withdrawal', 'escalation window'],
    source: 'app/api/admin/wallet-settings/route.ts, lib/validation/schemas.ts',
  },
  {
    name: 'wallet_approvers',
    title: 'Wallet Approvers',
    description: 'Managing who holds the Wallet Approver role, the staff who can approve customer withdrawals.',
    path: '/admin/wallet/approvers',
    role: 'super_admin',
    actions: [
      'See the current wallet approvers, whether each account is active, and when the role was granted',
      'Grant the Wallet Approver role to an active user',
      'Revoke the role from a current approver',
    ],
    notes: [
      'Super Admin only.',
      'Each grant or revoke needs a reason category (role granted, role revoked, coverage change or other) and a reason of 10 to 500 characters, then a confirmation.',
      'The last active wallet approver cannot be removed.',
      'Super Admins and existing approvers are not offered as new approvers.',
    ],
    keywords: ['wallet approver', 'wallet approvers', 'approver role', 'grant approver', 'revoke approver'],
    source: 'app/admin/wallet/approvers/page.tsx, app/api/admin/wallet-approvers/route.ts, lib/validation/wallet-reason-schemas.ts',
  },
  {
    name: 'platform_fees',
    description:
      'Setting what the platform charges vendors: three shared vendor tiers (each a % of the item price or a fixed RM per item), the sales needed for each tier, and the fixed per-item fee for items sold at events.',
    path: '/admin/vendors/platform-fees',
    role: 'super_admin',
    actions: [
      'Rename each of the three tiers and set its fee as a percentage of the item price or a fixed RM amount per item',
      'Set the 90-day sales amount a vendor needs to reach tier 2 and tier 3 (tier 1 always starts at RM0)',
      'Set a default fixed fee per item for event orders, and override it per event',
      'Pin a single vendor to a tier from the vendor review drawer on Vendor review',
    ],
    notes: [
      'Admins with vendor management can view the page and pin vendors; only a Super Admin can change fees, and every change needs a reason of at least 10 characters.',
      'Vendors are re-placed into tiers every night from their last 90 days of settled sales, unless pinned.',
      'Changes apply to orders paid from then on; past settlements keep the fee they were charged.',
      'A fixed fee per item is never more than the item\'s share of the sale, and the fee is raised to cover any affiliate or recommendation payout on the order.',
    ],
    keywords: ['vendor tier', 'fee tier', 'platform fee tier', 'change the platform fee', 'event fee', 'fee per item', 'commission rate'],
    source: 'app/admin/vendors/platform-fees/page.tsx, app/api/admin/vendor-fee-tiers/route.ts, app/api/admin/vendors/[id]/fee-tier/route.ts, lib/vendor/fee-tiers.ts, supabase/migrations/20261007230000_vendor_platform_fee_tiers.sql',
  },
  {
    name: 'payout_reports',
    title: 'Payouts',
    description: 'The payout report: platform-wide payout figures, and exporting them as CSV.',
    path: '/admin/reports/payouts',
    role: 'super_admin',
    actions: ['View the payout report for a chosen period', 'Export the report as a CSV file'],
    notes: [
      'Super Admin only.',
      'This report is platform-wide payouts: it is not specific to affiliate or recommendation earnings.',
    ],
    keywords: ['payout report', 'payout csv', 'export payouts'],
    source: 'app/api/admin/reports/payouts/route.ts, app/admin/reports/payouts/page.tsx, lib/admin/csv.ts',
  },
  {
    name: 'reconciliation',
    title: 'Order Breakdown',
    description:
      'The order money-reconciliation report: per-order and monthly totals of gross revenue, platform commission, vendor net, and what was paid out to affiliates and recommenders.',
    path: '/admin/reports/reconciliation',
    role: 'super_admin',
    actions: [
      'Pick a calendar month and see every order settled that month, broken down into gross amount, platform fee (commission), vendor net, affiliate payout, recommendation payout, and platform net',
      'See monthly totals for each of those figures',
      'Export the month\'s breakdown as CSV',
      'See platform funds: money still owed to others (vendor and affiliate earnings ready to withdraw, earnings on hold, withdrawals being paid out, customer top-up balances, approved refunds not yet paid) and platform earnings on confirmed settlements',
      'Record a transfer of platform earnings to the company account (amount, date, bank reference, optional note), or void one with a reason',
    ],
    notes: [
      'Super Admin only.',
      'Affiliate and recommendation payouts come out of the platform\'s commission cut, not on top of it. Since the vendor tier change, the platform fee on a held order is raised to at least the payout owed, so platform net no longer goes negative on new orders.',
      'A row where the platform net is negative (the commission on it was smaller than what got paid out to affiliates/recommenders) is flagged with a warning banner.',
      'Platform fees are set per vendor tier on Platform fees.',
      'There is no platform wallet or cash-out: customer payments already land in the company account. Recording a transfer moves no money; it logs a transfer finance already made, so "available to transfer" stays accurate.',
      'Available to transfer = platform net on confirmed settlements (past their hold period) minus transfers already recorded. Recording more than that is refused. Transfers cannot be edited or deleted, only voided with a reason, and each action is in the audit log.',
    ],
    keywords: ['reconciliation', 'order breakdown', 'platform commission', 'platform fee', 'vendor net', 'platform net', 'platform funds', 'platform earnings', 'transfer log', 'record a transfer', 'cash out', 'money owed'],
    source: 'app/admin/reports/reconciliation/page.tsx, app/api/admin/reconciliation/route.ts, lib/admin/reconciliation.ts, lib/vendor/settlement.ts',
  },
  {
    name: 'recommendations',
    description:
      'Reviewing customer-submitted vendor recommendations: approving, rejecting, or requesting changes.',
    path: '/admin/recommendations',
    role: 'admin_or_approver',
    actions: [
      'Browse submitted recommendations and open one for the full detail view',
      'Approve a recommendation',
      'Reject it, or request changes so the submitter can edit and resubmit',
      'Invite the recommended business to join, from the recommendation detail page',
    ],
    notes: [
      'Rejecting or requesting changes requires a reason of at least 10 characters.',
      'Approving does not pay the recommender: the reward only activates once the vendor actually joins and the recommendation converts. Clearing that reward is a separate section: see recommendation_rewards.',
    ],
    keywords: ['recommendation', 'recommended business', 'request changes'],
    source:
      'app/api/admin/recommendations/review/route.ts, recommendations/[id], components/admin/recommendation-detail-view.tsx',
  },
  {
    name: 'recommendation_rewards',
    description: 'Clearing pending recommendation rewards that are past their hold period: the recommendation equivalent of rewards_clearing.',
    path: '/admin/recommendations/rewards',
    role: 'admin_or_approver',
    actions: [
      'Run recommendation reward clearing, which confirms rewards past their hold and reverses any that no longer qualify',
      'See how many were cleared, reversed, or skipped after a run',
    ],
    notes: ['This page is not in the admin sidebar; open it with Open this page on this guide. It is not the same page as Rewards clearing, which clears affiliate earnings.'],
    keywords: ['recommendation reward', 'recommendation rewards', 'recommendation clearing'],
    source: 'app/admin/recommendations/rewards/page.tsx, app/api/admin/recommendations/run-clearing/route.ts',
  },
  {
    name: 'support_tickets',
    title: 'Support',
    description: 'Working the customer support ticket queue: reading, replying, and changing a ticket status or category.',
    path: '/admin/support',
    role: 'admin_or_approver',
    actions: [
      'Browse and filter the ticket queue (the sidebar badge counts tickets with an unread customer reply)',
      'Open a ticket and read the full conversation',
      'Reply to the customer',
      'Change a ticket status, or re-categorise it',
      'Review customer-safety moderation flags from the panel on this page',
    ],
    notes: [
      'Every new ticket is auto-classified (Gemini AI, keyword matcher as a fallback if the AI call fails) into one of: booking, payment, vendor, withdrawal, kyc, technical, affiliate, general: shown as a badge next to each ticket subject with which method classified it (ai/keyword/manual).',
      'Each category is routed to a named team (e.g. withdrawal -> Wallet Team, kyc -> KYC Team) shown as a badge on the ticket: a label for which team\'s queue it belongs in via the category filter, not an automatic assignment to a specific staff member (assigned_to still requires an admin to pick it up).',
      'An admin can always override the AI\'s category from the dropdown next to each ticket: that also re-routes its team label immediately.',
    ],
    keywords: ['support ticket', 'ticket queue', 'reply to a customer', 'reply to a ticket', 'moderation flag', 'ticket category', 'ticket routing', 'admin team'],
    source: 'app/api/admin/tickets/route.ts, tickets/[id], app/api/support/tickets/[id]/replies, components/admin/moderation-flags-panel.tsx, lib/chatbot/classify.ts, lib/chatbot/classify-ai.ts, lib/support/team-routing.ts',
  },
  {
    name: 'chat_reports',
    title: 'Chat Reports',
    description:
      'Handling reports that users filed about vendor/customer chat conversations: resolving or dismissing them, and banning abusive reporters.',
    path: '/admin/chat-reports',
    role: 'admin_or_approver',
    actions: [
      'Review reported chat conversations and read the full thread',
      'Resolve or dismiss a report with a resolution reason: action taken, no violation, insufficient evidence, or spam/abuse',
      'Add an optional resolution note',
      'Ban a repeat false reporter from filing further reports, or lift that ban',
      'Change the auto-archive threshold (Super Admin only): how many days of inactivity (1–3650) before an open chat thread is automatically archived; archiving only changes status, message history is kept',
    ],
    notes: [
      'These are reports about chats between users and vendors: not the same thing as the chatbot oversight page, and not the same thing as staff_conduct (which covers support-ticket/staff conduct reports).',
      'The ban applies to the person who filed the report, not the person reported.',
      'While a report is open, both the reporting customer and the admin see a persistent "reported, under review" line on that conversation. The reported party never sees it, so an investigation isn\'t tipped off.',
      'The auto-archive threshold control only shows for Super Admins: everyone else with access to this page can still review/resolve/dismiss reports.',
    ],
    keywords: ['chat report', 'reported chat', 'report ban', 'reported conversation', 'dismiss a report', 'resolve a report'],
    source: 'app/api/admin/chat-reports/route.ts, chat-reports/[reportId], report-bans/[userId], chat-settings',
  },
  {
    name: 'affiliate',
    description:
      'The affiliate admin section: commission stats, fraud flags and sweeps, commission tier rates, disabled affiliate links, and the affiliate report export.',
    path: '/admin/affiliate',
    role: 'admin_or_approver',
    actions: [
      'View affiliate stats and insights',
      'Review fraud flags and either confirm or dismiss each one',
      'Run a fraud sweep',
      'Run affiliate commission clearing',
      'Edit a commission tier: its rate percentage and minimum referrals',
      'Reactivate a disabled affiliate link',
      'Export the affiliate report',
    ],
    notes: [
      'Editing a tier changes future attributions only; it does not retroactively change historical ones.',
    ],
    keywords: ['affiliate', 'commission tier', 'fraud flag', 'fraud sweep', 'commission rate'],
    source:
      'app/api/admin/affiliate/{stats,insight,fraud-flags,fraud-flags/[id],fraud-sweep,fraud-analytics,run-clearing,tiers/[id],links/[id],report}/route.ts',
  },
  {
    name: 'chatbot_oversight',
    title: 'Chatbot',
    description:
      'The chatbot oversight page: chatbot answer/escalation stats, unanswered questions, and managing the customer FAQ knowledge base (add, edit, activate, AI-draft, reindex).',
    path: '/admin/chatbot',
    role: 'admin_or_approver',
    actions: [
      'See chatbot stats: questions asked, answer rate, escalation rate',
      'See the top unanswered questions, and answers customers marked unhelpful (a KB doc exists but needs improving, not creating)',
      'See the top questions that most often end in a support ticket regardless of what the bot answered: the escalation rate tells you HOW OFTEN that happens, this list tells you WHICH topics, so Help Centre effort goes where it is actually needed',
      'Add a knowledge base entry, or start one from an AI draft based on a failed question',
      'Edit an existing entry, and activate or deactivate entries (individually or in batch)',
      'Reindex the knowledge base so new or edited entries become searchable',
    ],
    notes: [
      'This manages the CUSTOMER-facing chatbot knowledge base, not this admin assistant.',
      'A newly saved entry is embedded automatically; Reindex is the bulk catch-up for anything that was missed.',
      'All three gap lists (unanswered / not-helpful / most-escalated) can start an AI-drafted KB entry with one click.',
    ],
    keywords: ['chatbot', 'knowledge base', 'kb entry', 'faq entry', 'reindex', 'unanswered question', 'help centre gap', 'escalated question'],
    source: 'app/api/admin/chatbot/{kb,kb/[id],kb/draft,reindex,stats}/route.ts, app/admin/chatbot/page.tsx',
  },
  {
    name: 'ai_assistant',
    title: 'AI Assistant',
    description: 'Ask in English, Malay or Chinese. The assistant looks up live numbers and Staff Help for you, and can prepare simple changes that only happen when you press Confirm.',
    path: '/admin/ai-assistant',
    role: 'super_admin',
    actions: [
      'Ask for live numbers: vendors, products, KYC, orders, withdrawals, recommendations, support tickets, affiliates and unanswered chatbot questions. For example "How many withdrawals are pending?"',
      'Ask how to do something, where a page is, who can use it, or how a whole workflow runs. For example "Walk me through the event lifecycle"',
      'Ask to see records you want to act on: open support tickets and a ticket conversation, knowledge base entries, open event exception cases, hotel amenities, moderation words, pending vendor applications, pending recommendations, the catalogue queue, open chat reports, running event ads, active sponsored ads and approved event stalls',
      'Support: change a ticket status or category, or have a reply drafted for the customer',
      'Chatbot: add a knowledge base entry (saved turned off so you can check it), turn entries on or off, and reindex',
      'Events: claim an event exception case with a due date, pause or resume an event ad, and change an approved stall booth number',
      'Catalogue: approve, request changes to, or reject a pending outlet, product or voucher',
      'Vendor review and Recommendations: ask a vendor applicant for more information, or send a recommendation back for changes',
      'Chat Reports: resolve or dismiss a report with a reason',
      'Announcements: send an announcement to all vendors',
      'Sponsored Ads: pause an active placement',
      'Hotel Amenities and Moderation Words: add one, or turn one on or off',
      'Notifications: mark all as read',
      'Follow up on its last answer: a short reply such as "the pending ones" is understood',
    ],
    notes: [
      'Super Admin only.',
      'Every change appears as a card that shows exactly what will happen. Nothing changes until you press Confirm; press Cancel to drop it, or Open page to check the item first.',
      'Confirm does the same thing as doing it on the page yourself, with the same permission checks and records.',
      'At most 5 cards per answer, one per item. Cards are not kept when you reload the page.',
      'It cannot approve or reject vendors or recommendations, act on withdrawals, refunds, KYC, users, roles, payments, settings or events, run reward clearing, or delete anything. It names the page to use instead.',
      'Live numbers are totals and counts only. Text that may contain personal details is withheld from it, so it may not be able to read every ticket.',
      'Questions that contain an email address, phone number, IC number, or bank or address details are not sent.',
      'Staff conduct review moved to its own page: Staff Conduct.',
    ],
    keywords: ['ai assistant', 'this assistant', 'what can the assistant do', 'assistant actions', 'confirm card'],
    source: 'app/api/admin-ai/ask/route.ts, lib/admin-ai/orchestrate.ts, lib/admin-ai/actions.ts, lib/admin-ai/queries.ts',
  },
  {
    name: 'staff_conduct',
    title: 'Staff Conduct',
    description:
      'Reviewing staff/admin conduct in chats: messages the system automatically flagged for profanity or slurs, and chats a user reported.',
    path: '/admin/staff-conduct',
    role: 'super_admin',
    actions: [
      'Flagged Conduct tab: admin/staff messages the system detected as containing profanity or slurs, shown uncensored with who sent it and to whom',
      "Reported Chat tab: chats a user reported via the Report button, currently populated from customer<->admin SUPPORT TICKET conversations only",
      'Open the full message transcript behind a flag or report',
      'Mark a flagged item reviewed',
    ],
    notes: [
      'Super Admin only.',
      'Not the same thing as Chat Reports, which handles reports about CUSTOMER<->VENDOR chat conversations (scam/abuse/spam): this page is about support-ticket conduct and staff behaviour, not vendor chat.',
      'Moved out of AI Assistant into its own sidebar entry: it is a moderation tool, not an AI capability.',
    ],
    keywords: ['staff conduct', 'flagged conduct', 'profanity', 'admin misconduct'],
    source: 'app/admin/staff-conduct/page.tsx, components/admin/staff-conduct-panel.tsx, app/api/admin/conduct-flags/route.ts, app/api/admin/chat-conduct-reports/route.ts, lib/moderation/chat-conduct-reports.ts',
  },
  {
    name: 'moderation_words',
    title: 'Moderation Words',
    description:
      'Adding words to the auto-censor list: words that get masked wherever profanity/slurs are already masked (tickets, comments, chatbot, chat).',
    path: '/admin/moderation-words',
    role: 'super_admin',
    actions: [
      'Add a word (any language) to be auto-censored, tagged as either "profanity" or "slur"',
      'Optionally tag a word with a language label, for the admin\'s own reference: this label is not enforced',
      'Toggle a word active/inactive without deleting it',
      'Delete a word from the list',
    ],
    notes: [
      'Super Admin only.',
      'Supplements (does not replace) the built-in, hardcoded English profanity/slur lists (lib/moderation/wordlists.ts). Words added here are for cases the built-in list misses, especially other languages.',
      'Takes effect immediately on the next message: no redeploy needed.',
      'Applies everywhere existing profanity masking already runs: support tickets, place comments, the customer chatbot, the admin AI assistant, and customer<->vendor chat.',
    ],
    keywords: ['banned word', 'custom word', 'word list', 'censor list', 'moderation word', 'add a word'],
    source: 'app/admin/moderation-words/page.tsx, app/api/admin/moderation-words/route.ts, app/api/admin/moderation-words/[id]/route.ts, lib/moderation/custom-words.ts',
  },
  {
    name: 'rewards_clearing',
    description: 'Clearing pending affiliate earnings that are past their hold period.',
    path: '/admin/rewards',
    role: 'admin_or_approver',
    actions: [
      'See how many affiliate attributions are past their hold and ready to confirm',
      'Run clearing to confirm them',
    ],
    notes: ['This page is not in the admin sidebar; open it with Open this page on this guide.'],
    keywords: ['clear earnings', 'clearing earnings', 'rewards clearing', 'pending earnings clearing'],
    source: 'app/admin/rewards/page.tsx, app/api/admin/clear-earnings/route.ts',
  },
  {
    name: 'event_campaigns',
    title: 'Events',
    description:
      'Creating and running pop-up events (vendor-fair campaigns): drafting an event, adding its locations with dates, hours, stall capacity and vendor application deadlines, publishing, pausing, archiving, and cancelling a location.',
    path: '/admin/promotion-campaigns',
    role: 'super_admin',
    actions: [
      'Create an event draft with a title, web address (slug), summary, description, start and end time, operating hours text, and a poster',
      'Add, edit or delete locations, each with a name, optional address and map pin, Malaysia dates and opening hours, maximum stalls, and vendor intake: applications open, an applications-close time, an approvals-close time and a setup-start time',
      'Move the event through submit, approve, reject, pause, resume and archive',
      'Correct a live or paused event in place (title, summary, description, dates, poster and opening hours) without archiving it',
      'Preview the impact of changing a location before saving it',
      'Cancel a single location with a reason',
      'Invite a business to sell only at events from the vendor review page, which emails them a claim link',
    ],
    notes: [
      'Super Admins can always use this section; other staff only if their staff role includes the promotion campaign permission in Access Control.',
      'Submitting, approving or resuming needs a poster and at least one location; publishing or resuming needs an active location that has not ended, and active locations must stay within the event dates.',
      'Rejecting needs a reason of 10 to 500 characters.',
      'Event details can be edited while the event is a draft, rejected, live or paused, but not while it awaits approval or after it is archived. On a live or paused event the web address cannot change, the poster can be replaced but not removed, changes show to customers immediately, and each edit is recorded in the audit log.',
      'Application and approval deadlines must come before setup, and setup must come before the first opening; a location needs a maximum stall count before any stall there can be approved.',
      'Changing a location that already has stalls or reservations needs a change reason of at least 5 characters, and the preview shows what it would affect.',
      'Cancelling a location, archiving an event, or removing a stall cancels the uncollected reservations there and starts refunds: automatic for card, wallet and simulator payments before the event starts, otherwise queued for review.',
      'Every save checks you are editing the latest version; if someone else changed it, refresh and try again.',
      'The fee per item for event orders is set on Platform fees.',
      'An event-only vendor invitation cannot go to an email that already owns a vendor, and the invited owner must pass KYC before approval.',
    ],
    keywords: ['promotion campaign', 'create an event', 'new event', 'event location', 'publish an event', 'archive an event', 'cancel a location', 'event campaign', 'vendor fair', 'event vendor invite'],
    source:
      'app/admin/promotion-campaigns/page.tsx, app/api/admin/promotion-campaigns/{route,[id],[id]/locations,[id]/locations/[locationId],[id]/locations/[locationId]/cancel,[id]/locations/[locationId]/preview}/route.ts, lib/promotion-campaigns/validation.ts, lib/events/cancellations.ts, app/api/admin/vendors/event-invite/route.ts, transition_promotion_campaign, guard_event_location_allocation, cancel_event_reservations',
  },
  {
    name: 'event_registrations',
    title: 'Event Stalls',
    description:
      'Reviewing vendor stall applications for event locations: approving with a booth number, rejecting, requesting changes, changing an assigned booth, and removing a stall.',
    path: '/admin/event-registrations',
    role: 'super_admin',
    actions: [
      'Filter registrations by status and open one to see the stall description, image, items with prices and daily quantities, and pickup times',
      'Approve a pending registration by confirming a booth number',
      'Reject it, or request changes so the vendor can edit and resubmit',
      'Change the booth number of an approved stall',
      'Remove an approved stall from a location with a reason',
    ],
    notes: [
      'Same permission as event campaigns: Super Admins, or staff whose role includes the promotion campaign permission.',
      'Only pending registrations can be reviewed. Reject and request changes need a note of at least 10 characters.',
      'Approval needs a booth number and must happen before the location\'s approvals-close time; the location must have a maximum stall count that is not yet full, and two approved stalls at one location cannot share a booth number.',
      'The vendor\'s preferred booth number is only a preference; an application does not guarantee a booth.',
      'Changing an approved booth needs a reason of at least 5 characters and is not possible after the location has ended.',
      'Removing a stall cancels its uncollected reservations and starts refunds for those customers.',
    ],
    keywords: ['event registration', 'stall application', 'booth number', 'approve a stall', 'remove a stall', 'stall registration'],
    source:
      'app/admin/event-registrations/page.tsx, app/admin/event-registrations/[id]/page.tsx, app/api/admin/event-registrations/{route,[id],[id]/stall,[id]/remove}/route.ts, lib/validation/schemas.ts (campaignRegistrationReviewSchema), lib/promotion-campaigns/validation.ts (campaignStallChangeSchema), guard_event_booth_registration',
  },
  {
    name: 'event_promotions',
    title: 'Event Ads',
    description:
      'Reviewing vendor-paid event promotions (outside events vendors advertise on the home page), pausing or resuming paid ones, and setting the promotion price and daily capacity.',
    path: '/admin/event-promotions',
    role: 'admin_or_approver',
    actions: [
      'Filter promotions by status and open one to see its details, dates and image',
      'Approve, reject, or request changes; after approval the vendor pays to go live',
      'Pause or resume a paid promotion',
      'Change the cost per day and the maximum number of promotions running on the same day',
    ],
    notes: [
      'Reject and request changes need a note of at least 10 characters.',
      'Only a paid promotion can be paused or resumed.',
      'Current settings: RM 100 per day and at most 4 promotions on the same day. Cost per day can be RM 0 to RM 100,000 and the daily maximum 1 to 50.',
      'Vendors pay from their wallet earnings, or by card for the full amount when earnings are not enough; once paid, the vendor can no longer modify it.',
    ],
    keywords: ['event promotion', 'promoted event', 'promotion cost per day', 'pause a promotion', 'featured event promotion'],
    source:
      'app/admin/event-promotions/page.tsx, app/admin/event-promotions/[id]/page.tsx, app/api/admin/event-promotions/{route,[id]}/route.ts, app/api/admin/event-promotion-settings/route.ts, lib/validation/schemas.ts (eventPromotionReviewSchema, eventPromotionSettingsPatchSchema)',
  },
  {
    name: 'vendor_announcements',
    title: 'Announcements',
    description: 'Sending announcements to vendors, including invitations to join a vendor-fair event.',
    path: '/admin/announcements',
    role: 'super_admin',
    actions: [
      'Write an announcement with a title (3 to 160 characters) and message (10 to 5,000 characters)',
      'Optionally link it to an event so vendors can open that event from the announcement',
      'See announcements already sent',
    ],
    notes: [
      'Super Admins can always use this; other staff only if their role includes the vendor announcement permission.',
      'Vendors read announcements under Announcements in the vendor portal.',
    ],
    keywords: ['announcement', 'vendor announcement', 'message all vendors', 'event invitation announcement'],
    source: 'app/admin/announcements/page.tsx, app/api/admin/announcements/route.ts, lib/validation/schemas.ts (vendorAnnouncementCreateSchema)',
  },
  {
    name: 'orders',
    description:
      'Looking up customer orders, recording a fraud outcome on an order, and handling an event stock shortage that cancels reservations for one item on one date.',
    path: '/admin/orders',
    role: 'admin_or_approver',
    actions: [
      'Browse orders filtered by status (pending payment, paid, completed, cancelled, failed, refunded) and search by a complete order ID',
      'Open an order to see its items, payment and fulfilment details',
      'Record that an order was fraud, with a reason of at least 10 characters',
      'Event shortage: choose an event item, a pickup date and a reason, preview the affected reservations, then confirm to cancel them and start refunds',
    ],
    notes: [
      'Viewing orders needs the orders permission, which the admin role has by default; approvers need it granted. Event shortage uses the promotion campaign permission.',
      'Recording a fraud outcome needs a passkey-verified session.',
      'An event shortage needs a reason of at least 5 characters, and it only cancels reservations made up of that item and date that have not been collected; if the affected reservations change, refresh the preview.',
    ],
    keywords: ['admin orders', 'order lookup', 'find an order', 'event shortage', 'stock shortage', 'financial outcome', 'mark an order as fraud'],
    source: 'app/admin/orders/page.tsx, app/api/admin/orders/route.ts, app/api/admin/orders/event-shortage/route.ts, app/api/admin/orders/[orderId]/financial-outcome/route.ts, cancel_event_reservations',
  },
  {
    name: 'refund_review',
    title: 'Refunds',
    description: 'Reviewing customer refund requests: checking the pickup and fulfilment evidence, then approving or rejecting.',
    path: '/admin/refunds',
    role: 'super_admin',
    actions: [
      'See refund requests with the reason, amount and how it was paid',
      'Check the evidence for each item: whether it was collected, when, at which venue, and the pickup date and window',
      'Approve or reject a pending refund, with an optional note',
      'Add a manual payout reference (at least 5 characters) when the refund is paid outside an automatic method',
    ],
    notes: [
      'Super Admin only, and needs a passkey-verified session.',
      'Only pending refunds can be reviewed. If the pickup evidence changed since you opened it, refresh before deciding.',
      'Approving a refund for items that were already collected needs an explanation in the note.',
      'Customers refund the whole order, with one active request per order; approved refunds go back to the original payment method, with the wallet-paid part returned to the wallet, and the vendor\'s earnings for that order are reversed.',
    ],
    lifecycle: [
      { status: 'Pending', by: 'Customer', detail: 'The customer asked to refund the whole order. An order can have one active request at a time.' },
      { status: 'Approved', by: 'Super Admin', detail: 'Approved after checking the pickup evidence. The refund to the original payment method starts, with the wallet-paid part returned to the wallet.' },
      { status: 'Processed', by: 'System', detail: 'The payment provider completed the refund.' },
      { status: 'Failed', by: 'System', detail: 'The payment provider could not complete the refund.' },
      { status: 'Rejected', by: 'Super Admin', detail: 'Declined, with an optional note.' },
      { status: 'Simulated', by: 'System', detail: 'A refund of a test payment made with the payment simulator. No real money moved.' },
    ],
    keywords: ['refund request', 'approve a refund', 'reject a refund', 'refund review', 'refund evidence', 'manual refund'],
    source: 'app/admin/refunds/page.tsx, app/api/admin/refunds/route.ts, app/api/admin/refunds/[refundId]/route.ts, request_order_refund, sync_paid_order_vendor_settlement',
  },
  {
    name: 'event_exceptions',
    description:
      'Handling event order exception cases: missed pickups (pickup overdue), payments that could not be fulfilled, and refunds needing attention.',
    path: '/admin/reports/reconciliation',
    role: 'super_admin',
    actions: [
      'See open event exception cases, including which are overdue',
      'Claim a case and set a due date',
      'Resolve a case once its refund is complete or the pickup is verified',
      'Confirm a customer no-show on a pickup-overdue case with a verified explanation',
    ],
    notes: [
      'Super Admin only; shown on the reconciliation report page.',
      'Kinds: pickup overdue (a paid pickup passed its window without being scanned), payment unfulfillable, and refund attention.',
      'Confirming a no-show needs a note of at least 20 characters and keeps the sale; a refunded or verified-collected case is resolved automatically.',
      'If the case changed or its refund is not complete, refresh and review it again.',
    ],
    keywords: ['event exception', 'pickup overdue', 'no show', 'missed pickup', 'payment unfulfillable', 'refund attention'],
    source: 'app/admin/reports/reconciliation/page.tsx, app/api/admin/reconciliation/event-exceptions/[caseId]/route.ts, supabase/migrations/20261011194020_event_settlement_pickup_resolution.sql',
  },
  {
    name: 'system_settings',
    title: 'System Settings',
    description: 'Emergency platform switches: pausing new customer orders and pausing custom email delivery.',
    path: '/admin/system-settings',
    role: 'super_admin',
    actions: [
      'Pause or resume the creation of new customer orders, including event reservations',
      'Pause or resume custom email delivery; queued messages are kept and sent after resuming',
    ],
    notes: [
      'Super Admin only. Every change needs a reason of at least 10 characters and is audited.',
      'While new orders are paused, customers see that new orders are temporarily unavailable.',
    ],
    keywords: ['system settings', 'pause new orders', 'pause orders', 'pause email', 'emergency switch'],
    source: 'app/admin/system-settings/page.tsx, app/api/admin/system-settings/route.ts, lib/platform/operations-settings.ts, supabase/migrations/20261015062555_platform_operations_settings.sql',
  },
  {
    name: 'staff_notifications',
    title: 'Notifications',
    description: 'The staff notification inbox: wallet, support, account security and message notifications.',
    path: '/admin/notifications',
    role: 'admin_or_approver',
    actions: [
      'Open it from the bell in the admin header (View all)',
      'Filter by category: all, wallet, support, account and security, or messages',
      'Open a notification to go to the related page, and mark all as read',
    ],
    notes: [
      'The bell is shown to staff who can approve withdrawals.',
    ],
    keywords: ['staff notification', 'staff notifications', 'notification inbox', 'admin notifications'],
    source: 'app/admin/notifications/page.tsx, components/shared/notification-center.tsx, app/admin/layout.tsx',
  },
  {
    name: 'staff_sign_in_security',
    description:
      'How staff sign in: password, then an authenticator app code, then a passkey; registering a passkey device and recovering access.',
    path: '/admin/security',
    role: 'admin_or_approver',
    actions: [
      'Enter the 6-digit authenticator app code after your password',
      'Verify with your passkey (face, fingerprint or device PIN); a verified session lasts up to 12 hours',
      'Register a new device with a one-time enrollment code, or add another device from Security and devices after verifying',
      'Remove a device you no longer use, as long as at least one remains',
    ],
    notes: [
      'Every staff account needs both an authenticator app and a registered passkey before admin pages and data work.',
      'Enrollment codes are issued by an operator with the server-side enrollment script; they are single use and expire after 15 minutes.',
      'A passkey works only on the website address it was registered on, so localhost and the live site each need their own registration. Each account can hold up to 5 passkeys.',
      'Lost every device: an operator runs the enrollment script in recovery mode, which revokes the old passkeys and issues a new code.',
      'Lost the authenticator app: its factor is removed in the Supabase dashboard (Authentication, Users, MFA) and set up again.',
    ],
    keywords: ['staff login', 'passkey', 'authenticator app', 'enrollment code', 'two factor', 'staff verification', 'lost my passkey'],
    source: 'app/auth/staff-mfa/page.tsx, app/auth/staff-verification/page.tsx, components/admin/staff-passkey.tsx, lib/supabase/proxy.ts, lib/auth/staff-passkey-flow.ts, scripts/staff-passkey-enrollment.mjs, supabase/migrations/20261014194135_staff_passkey_authorization.sql',
  },
];

export function findCapability(name: string): AdminCapability | undefined {
  return CAPABILITY_REGISTRY.find((c) => c.name === name);
}

/**
 * Cheap deterministic pre-router, tried before the capability picker LLM
 * call — a hit saves one Gemini round trip per how-to question, which
 * matters on this project's free-tier request budget.
 *
 * Ties are resolved by the LONGEST matching phrase, not by registry order:
 * "dual approval threshold" (wallet_settings) has to beat "dual approval"
 * (withdrawals) for "who can change the dual approval threshold" to land in
 * the right section. Returns null whenever two sections match equally well,
 * so a genuinely ambiguous question falls through to the LLM picker rather
 * than being answered from the wrong section — a wrong-but-confident answer
 * about a permission-gated screen is worse than one extra API call.
 */
export function matchCapabilityByKeywords(question: string): AdminCapability | null {
  const normalized = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

  let best: AdminCapability | null = null;
  let bestLength = 0;
  let tied = false;

  for (const capability of CAPABILITY_REGISTRY) {
    let longest = 0;
    for (const keyword of capability.keywords) {
      if (normalized.includes(` ${keyword} `) && keyword.length > longest) longest = keyword.length;
    }
    if (longest === 0) continue;

    if (longest > bestLength) {
      best = capability;
      bestLength = longest;
      tied = false;
    } else if (longest === bestLength) {
      tied = true;
    }
  }

  return tied ? null : best;
}

/** Names + descriptions only — what the picker call is allowed to see. */
export function capabilityRegistryDescription(): string {
  return CAPABILITY_REGISTRY.map((c) => `- ${c.name}: ${c.description}`).join('\n');
}

/**
 * Grounding context for a broad "what can I do in here?" question.
 *
 * Deliberately a curated projection (human label, path, role) rather than a
 * dump of this file — the raw registry has internal slugs and `source`
 * paths on it, which is exactly the kind of internal detail the
 * NO_MATCH_ANSWER comment in orchestrate.ts warns about leaking. What this
 * returns is no more than the admin's own sidebar already shows them.
 */
/** The page name staff see: the sidebar label when set, otherwise the guide name in words. */
export function capabilityTitle(capability: AdminCapability): string {
  if (capability.title) return capability.title;
  const words = capability.name.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Workflows the how-to picker may choose, as "workflow:<slug>: summary" lines. */
export function workflowRegistryDescription(): string {
  return STAFF_WORKFLOWS.map((workflow) => `- workflow:${workflow.slug}: ${workflow.title}. ${workflow.summary}`).join('\n');
}

/** Every step of a workflow, in order, with page names: what the assistant answers from. */
export function workflowContext(workflow: StaffWorkflow): string {
  const pageName = (guide: string) => {
    const found = CAPABILITY_REGISTRY.find((c) => c.name === guide);
    return found ? capabilityTitle(found) : guide;
  };
  return [
    `WORKFLOW: ${workflow.title}`,
    workflow.summary,
    '## Steps, in order:',
    ...workflow.steps.map((step, index) => `- Step ${index + 1}, on the ${pageName(step.guide)} page (by ${step.by}): ${step.what}`),
  ].join('\n');
}

/** Whole-word keyword match for workflows, checked before the section fast path. */
export function matchWorkflowByKeywords(question: string): StaffWorkflow | null {
  const normalized = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  return STAFF_WORKFLOWS.find((workflow) => workflow.keywords.some((keyword) => normalized.includes(` ${keyword} `))) ?? null;
}

export function capabilityOverviewContext(): string {
  return [
    'SECTIONS OF THE ADMIN PANEL:',
    ...CAPABILITY_REGISTRY.map((c) => {
      const gate = c.role === 'super_admin' ? ' (Super Admin only)' : '';
      return `- ${capabilityTitle(c)}${gate}: ${c.actions[0]}`;
    }),
  ].join('\n');
}

/**
 * The grounding context handed to the phraser for one capability. Plain
 * text, no markdown — the assistant's UI renders its reply as-is.
 */
export function capabilityContext(capability: AdminCapability): string {
  const roleLine =
    capability.role === 'super_admin'
      ? 'Who can use it: Super Admin only.'
      : 'Who can use it: admin, approver, or super admin.';

  return [
    `SECTION: ${capabilityTitle(capability)}`,
    // Staff navigate by page name; the assistant is never given the address.
    `Where: the ${capabilityTitle(capability)} page`,
    roleLine,
    // Headings start with '## ' so the bank-account pattern in lib/chatbot/pii.ts
    // cannot read a line ending in "account" plus the next heading word as an
    // account number and block the whole how-to answer.
    '## What you can do here:',
    ...capability.actions.map((a) => `- ${a}`),
    ...(capability.notes?.length ? ['## Important:', ...capability.notes.map((n) => `- ${n}`)] : []),
    ...(capability.lifecycle?.length
      ? ['## Status lifecycle, in order:', ...capability.lifecycle.map((stage) => `- ${stage.status} (by ${stage.by}): ${stage.detail}`)]
      : []),
    ...workflowsForGuide(capability.name).map(({ workflow, index }) => {
      const pageName = (guide: string | undefined) => {
        const found = guide ? CAPABILITY_REGISTRY.find((c) => c.name === guide) : undefined;
        return found ? capabilityTitle(found) : undefined;
      };
      const before = pageName(workflow.steps[index - 1]?.guide);
      const after = pageName(workflow.steps[index + 1]?.guide);
      return `Part of the ${workflow.title} workflow, step ${index + 1} of ${workflow.steps.length}${before ? `; before this: ${before}` : ''}${after ? `; next: ${after}` : ''}.`;
    }),
  ].join('\n');
}
