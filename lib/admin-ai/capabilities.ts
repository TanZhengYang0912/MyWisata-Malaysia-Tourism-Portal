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

export type AdminRole = 'super_admin' | 'admin_or_approver';

export interface AdminCapability {
  /** Stable slug the picker returns. */
  name: string;
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
    description: 'The admin Overview/dashboard page — where to see platform activity at a glance.',
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
    description:
      'Reviewing vendor applications: approving, rejecting, or requesting more information from a vendor; sending the approval email; suspending a vendor; linking a recommendation to a vendor.',
    path: '/admin/vendors',
    role: 'admin_or_approver',
    actions: [
      'Approve a vendor application — this also grants the applicant the vendor_owner role automatically',
      'Reject an application, with an optional rejection reason',
      'Request more information, which puts the application into a needs-information state',
      'Send the vendor approval email, either written yourself or started from an AI draft',
      'Suspend or unsuspend an existing vendor',
      'Link an approved recommendation to a vendor, or send a recommendation invite',
    ],
    notes: [
      'Approving is what activates the vendor account — until then nothing they set up is visible to travellers.',
    ],
    keywords: ['vendor application', 'approve a vendor', 'vendor approval', 'reject a vendor', 'suspend a vendor', 'approval email'],
    source:
      'app/api/admin/vendors/[id]/approve/route.ts, [id]/suspend, [id]/approval-email(+/draft), vendors/link-recommendation, vendors/recommendation-invite, lib/validation/vendor-schemas.ts',
  },
  {
    name: 'catalogue_review',
    description:
      'Reviewing vendor-submitted listings — outlets, products, and vouchers — that are waiting for approval before going live.',
    path: '/admin/catalogue',
    role: 'admin_or_approver',
    actions: [
      'See every outlet, product, and voucher currently in pending_review',
      'Approve an item, which sets it live/active',
      'Reject an item, which leaves it inactive',
      'Attach a review note explaining the decision',
    ],
    notes: [
      'Only items still in pending_review can be actioned — one already reviewed returns a conflict.',
      'Every decision is written to content_reviews and notifies the vendor.',
    ],
    keywords: ['catalogue', 'catalog', 'pending listing', 'approve a product', 'approve an outlet', 'approve a voucher', 'listing review'],
    source: 'app/api/admin/catalogue/reviews/route.ts, lib/validation/vendor-schemas.ts',
  },
  {
    name: 'user_management',
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
      'Super Admin only — this section is hidden from the admin and approver roles.',
      'Every action requires a reason of at least 10 characters.',
      'An account with a pending or processing withdrawal cannot be deleted this way.',
    ],
    keywords: ['user management', 'suspend a user', 'suspend an account', 'delete a user', 'delete an account', 'restore an account', 'unsuspend', 'bio restriction', 'manage users'],
    source:
      'app/api/admin/users/route.ts, users/[userId]/route.ts, lib/validation/user-management-schemas.ts, supabase/migrations/054_account_moderation_rpc.sql',
  },
  {
    name: 'kyc_review',
    description:
      'Reviewing customer KYC identity verification submissions and their uploaded ID documents.',
    path: '/admin/kyc',
    role: 'admin_or_approver',
    actions: [
      'Browse KYC submissions and open one to review it',
      'View the uploaded ID document images (front and back)',
      'Approve a submission, reject it, or request more information',
      'Attach a reason code to the decision',
    ],
    notes: ['KYC approval is what unlocks withdrawals for that customer.'],
    keywords: ['kyc', 'identity verification', 'id document', 'identity document'],
    source: 'app/api/admin/kyc/review/route.ts, kyc/submissions, kyc/documents/[submissionId]/[side], lib/validation/schemas.ts',
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
      'Requests at or above the configured dual-approval threshold need two different approvers — the first approval is recorded and waits for a second approver before any payout happens.',
      'The threshold itself is configurable in Wallet Settings.',
    ],
    keywords: ['withdrawal', 'payout request', 'approve a payout', 'dual approval', 'fraud override'],
    source:
      'app/api/admin/withdrawals/[id]/{approve,reject,hold,resume,fraud-override}/route.ts, lib/wallet/withdrawal-risk.ts',
  },
  {
    name: 'wallet_settings',
    description:
      'Configuring wallet and withdrawal policy — clearance days, minimum withdrawal, dual-approval threshold, escalation timers — and managing who holds the wallet approver role.',
    path: '/admin/wallet/settings',
    role: 'super_admin',
    actions: [
      'Change the clearance period (1–30 days)',
      'Change the minimum withdrawal amount',
      'Change the dual-approval threshold that decides which withdrawals need two approvers',
      'Change the escalation window (24–168 hours) and the hold escalation window (24–720 hours)',
      'Grant or revoke the wallet approver role for a user',
    ],
    notes: [
      'Super Admin only.',
      'Every settings change requires a reason of at least 10 characters and a reason category.',
    ],
    keywords: ['wallet setting', 'clearance period', 'clearance days', 'dual approval threshold', 'minimum withdrawal', 'wallet approver', 'escalation window'],
    source: 'app/api/admin/wallet-settings/route.ts, wallet-approvers/route.ts, lib/validation/schemas.ts',
  },
  {
    name: 'payout_reports',
    description: 'The payout report — platform-wide payout figures, and exporting them as CSV.',
    path: '/admin/reports/payouts',
    role: 'super_admin',
    actions: ['View the payout report for a chosen period', 'Export the report as a CSV file'],
    notes: [
      'Super Admin only.',
      'This report is platform-wide payouts — it is not specific to affiliate or recommendation earnings.',
    ],
    keywords: ['payout report', 'payout csv', 'export payouts'],
    source: 'app/api/admin/reports/payouts/route.ts, app/admin/reports/payouts/page.tsx, lib/admin/csv.ts',
  },
  {
    name: 'recommendations',
    description:
      'Reviewing customer-submitted vendor recommendations — approving, rejecting, or requesting changes — and clearing recommendation rewards.',
    path: '/admin/recommendations',
    role: 'admin_or_approver',
    actions: [
      'Browse submitted recommendations and open one for the full detail view',
      'Approve a recommendation',
      'Reject it, or request changes so the submitter can edit and resubmit',
      'Invite the recommended business to join, from the recommendation detail page',
      'Run recommendation reward clearing',
    ],
    notes: [
      'Rejecting or requesting changes requires a reason of at least 10 characters.',
      'Approving does not pay the recommender — the reward only activates once the vendor actually joins and the recommendation converts.',
    ],
    keywords: ['recommendation', 'recommended business', 'request changes'],
    source:
      'app/api/admin/recommendations/review/route.ts, recommendations/[id], recommendations/run-clearing, components/admin/recommendation-detail-view.tsx',
  },
  {
    name: 'support_tickets',
    description: 'Working the customer support ticket queue — reading, replying, and changing a ticket status or category.',
    path: '/admin/support',
    role: 'admin_or_approver',
    actions: [
      'Browse and filter the ticket queue (the sidebar badge counts tickets with an unread customer reply)',
      'Open a ticket and read the full conversation',
      'Reply to the customer',
      'Change a ticket status, or re-categorise it',
      'Review customer-safety moderation flags from the panel on this page',
    ],
    keywords: ['support ticket', 'ticket queue', 'reply to a customer', 'reply to a ticket', 'moderation flag'],
    source: 'app/api/admin/tickets/route.ts, tickets/[id], app/api/support/tickets/[id]/replies, components/admin/moderation-flags-panel.tsx',
  },
  {
    name: 'chat_reports',
    description:
      'Handling reports that users filed about vendor/customer chat conversations — resolving or dismissing them, and banning abusive reporters.',
    path: '/admin/chat-reports',
    role: 'admin_or_approver',
    actions: [
      'Review reported chat conversations and read the full thread',
      'Resolve or dismiss a report with a resolution reason: action taken, no violation, insufficient evidence, or spam/abuse',
      'Add an optional resolution note',
      'Ban a repeat false reporter from filing further reports, or lift that ban',
      'Adjust chat settings',
    ],
    notes: [
      'These are reports about chats between users and vendors — not the same thing as the chatbot oversight page.',
      'The ban applies to the person who filed the report, not the person reported.',
    ],
    keywords: ['chat report', 'reported chat', 'report ban', 'reported conversation', 'dismiss a report', 'resolve a report'],
    source: 'app/api/admin/chat-reports/route.ts, chat-reports/[reportId], report-bans/[userId], chat-settings',
  },
  {
    name: 'affiliate',
    description:
      'The affiliate admin section — commission stats, fraud flags and sweeps, commission tier rates, disabled affiliate links, and the affiliate report export.',
    path: '/admin/affiliate',
    role: 'admin_or_approver',
    actions: [
      'View affiliate stats and insights',
      'Review fraud flags and either confirm or dismiss each one',
      'Run a fraud sweep',
      'Run affiliate commission clearing',
      'Edit a commission tier — its rate percentage and minimum referrals',
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
    description:
      'The chatbot oversight page — chatbot answer/escalation stats, unanswered questions, and managing the customer FAQ knowledge base (add, edit, activate, AI-draft, reindex).',
    path: '/admin/chatbot',
    role: 'admin_or_approver',
    actions: [
      'See chatbot stats: questions asked, answer rate, escalation rate',
      'See the top unanswered questions, and answers customers marked unhelpful',
      'Add a knowledge base entry, or start one from an AI draft based on a failed question',
      'Edit an existing entry, and activate or deactivate entries (individually or in batch)',
      'Reindex the knowledge base so new or edited entries become searchable',
    ],
    notes: [
      'This manages the CUSTOMER-facing chatbot knowledge base, not this admin assistant.',
      'A newly saved entry is embedded automatically; Reindex is the bulk catch-up for anything that was missed.',
    ],
    keywords: ['chatbot', 'knowledge base', 'kb entry', 'faq entry', 'reindex', 'unanswered question'],
    source: 'app/api/admin/chatbot/{kb,kb/[id],kb/draft,reindex,stats}/route.ts, app/admin/chatbot/page.tsx',
  },
  {
    name: 'ai_assistant',
    description:
      'This assistant itself — what it can answer — and the staff conduct review panel that sits on the same page.',
    path: '/admin/ai-assistant',
    role: 'super_admin',
    actions: [
      'Ask questions about platform data: vendors, products, KYC, orders, withdrawals, recommendations, tickets, and affiliates',
      'Ask how to perform an admin task, or what a section of the admin panel is for',
      'Review staff conduct flags — admin messages caught containing profanity or slurs — uncensored, with who sent it and to whom',
      'Open the message log behind a conduct flag, and mark a flag reviewed',
    ],
    notes: [
      'Super Admin only, both this page and the conduct panel.',
      'Data answers only ever come from pre-registered aggregate queries — the assistant never returns a customer’s personal data.',
    ],
    keywords: ['ai assistant', 'staff conduct', 'conduct flag', 'this assistant'],
    source: 'app/api/admin-ai/ask/route.ts, lib/admin-ai/queries.ts, app/api/admin/conduct-flags/route.ts, components/admin/staff-conduct-panel.tsx',
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
    notes: ['This page is not in the admin sidebar — reach it directly at /admin/rewards.'],
    keywords: ['clear earnings', 'clearing earnings', 'rewards clearing', 'pending earnings clearing'],
    source: 'app/admin/rewards/page.tsx, app/api/admin/clear-earnings/route.ts',
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
export function capabilityOverviewContext(): string {
  return [
    'SECTIONS OF THE ADMIN PANEL:',
    ...CAPABILITY_REGISTRY.map((c) => {
      const gate = c.role === 'super_admin' ? ' (Super Admin only)' : '';
      return `- ${c.path}${gate}: ${c.actions[0]}`;
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
    `SECTION: ${capability.name}`,
    `Where: ${capability.path}`,
    roleLine,
    'What you can do here:',
    ...capability.actions.map((a) => `- ${a}`),
    ...(capability.notes?.length ? ['Important:', ...capability.notes.map((n) => `- ${n}`)] : []),
  ].join('\n');
}
