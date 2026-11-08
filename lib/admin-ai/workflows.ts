// Staff Help workflows: activities that move across several admin pages.
// Each step points at a Staff Help guide by its registry name, so a step's
// detail is never written twice and a test fails if a guide disappears.
// A page that runs a whole activity on its own (Withdrawals, Refunds, KYC)
// documents that as its guide's `lifecycle` instead. Plain English, no em
// dashes; every fact here is also stated in the linked guide.

export interface StaffWorkflowStep {
  /** CAPABILITY_REGISTRY name of the page this step happens on. */
  guide: string;
  /** Who acts at this step. */
  by: string;
  /** What happens at this step. */
  what: string;
}

export interface StaffWorkflow {
  slug: string;
  title: string;
  summary: string;
  steps: StaffWorkflowStep[];
}

export const STAFF_WORKFLOWS: StaffWorkflow[] = [
  {
    slug: 'event-lifecycle',
    title: 'Event lifecycle',
    summary: 'From creating an event to settling its stall sales: the pages involved, in order, and who acts at each step.',
    steps: [
      {
        guide: 'event_campaigns',
        by: 'Super Admin, or staff with the promotion campaign permission',
        what: 'Create the event and its locations (dates, opening hours, maximum stalls, and the application and approval deadlines), then submit and approve it. It needs a poster and an active location. Once approved it is live, and it can be paused, resumed or archived.',
      },
      {
        guide: 'event_registrations',
        by: 'Vendors apply, then the same staff review',
        what: 'Vendors apply for a stall at a location while applications are open. Approve each pending application with a booth number before the location\'s approvals close, or request changes or reject it with a note.',
      },
      {
        guide: 'orders',
        by: 'Customers and vendors, with staff for shortages',
        what: 'Customers reserve and pay for stall items with a pickup date, and vendors scan the pickup on the day. If an item runs short, use event shortage on Orders to cancel the affected reservations and start refunds.',
      },
      {
        guide: 'refund_review',
        by: 'Super Admin',
        what: 'Customers can ask to refund a whole order. Review pending requests against the pickup evidence. Cancelling a location, removing a stall or an event shortage starts refunds without a request.',
      },
      {
        guide: 'event_exceptions',
        by: 'Super Admin',
        what: 'Work the exception cases on Order Breakdown: pickups not scanned in their window, payments that cannot be fulfilled, and refunds that need attention. Resolve each case, or confirm a no-show to keep the sale.',
      },
      {
        guide: 'reconciliation',
        by: 'Super Admin',
        what: 'Each month, see the settled event orders with the platform fee and the vendor\'s share. The fee per event item is set on Platform Fees.',
      },
    ],
  },
];

export function findWorkflow(slug: string): StaffWorkflow | undefined {
  return STAFF_WORKFLOWS.find((workflow) => workflow.slug === slug);
}

/** Every workflow a guide takes part in, with its 0-based step position. */
export function workflowsForGuide(guide: string): { workflow: StaffWorkflow; index: number }[] {
  return STAFF_WORKFLOWS.flatMap((workflow) => workflow.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.guide === guide)
    .map(({ index }) => ({ workflow, index })));
}
