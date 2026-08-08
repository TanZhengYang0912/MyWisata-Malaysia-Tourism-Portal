// P4 — Member 4: send a vendor approval (welcome) email.
// POST /api/admin/vendors/[id]/approval-email — body { email, subject,
// body }. Gated on super_admin/approver. Requires the vendor to be
// currently `approved` (vendors.status is never touched by this route —
// see lib/vendors/approval-draft.ts's header and the migration comment for
// why: status is load-bearing in ~12 other places, from RLS policies down
// to the customer-facing vendor page). Once sent, `approval_email_sent_at`
// marks the vendor "Welcomed" — a UI-only bucket on app/admin/vendors/page.tsx
// computed from this column, not a new status value.
//
// Ordering deliberately differs from app/api/admin/vendors/[id]/approve/route.ts's
// "DB write, then fire-and-forget notification": here the DB column IS the
// "email was sent" record, not a side-effect of an already-committed state
// change, so the email is sent FIRST — only a successful send earns the
// "Welcomed" transition. A failed send leaves the vendor in "Approved" so
// the admin can just retry, rather than silently recording a send that
// never happened.

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { sendCustomVendorEmail } from '@/lib/email/sender';
import { recordAudit } from '@/lib/audit';

const schema = z
  .object({
    email: z.string().trim().email().max(255),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: vendorId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can send an approval email', 403);
  }

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  const { data: vendor, error } = await service
    .from('vendors')
    .select('id, status, approval_email_sent_at')
    .eq('id', vendorId)
    .maybeSingle();
  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (!vendor) return apiFail('NOT_FOUND', 'Vendor not found', 404);
  if (vendor.status !== 'approved') {
    return apiFail('VENDOR_NOT_APPROVED', 'Only approved vendors can be sent an approval email', 409);
  }
  if (vendor.approval_email_sent_at) {
    return apiFail('ALREADY_SENT', 'An approval email has already been sent to this vendor', 409);
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const dashboardUrl = `${origin}/vendor/dashboard`;
  const finalBody = `${parsed.data.body}\n\nVisit your vendor dashboard: ${dashboardUrl}`;

  try {
    await sendCustomVendorEmail({ to: parsed.data.email, subject: parsed.data.subject, body: finalBody });
  } catch (emailError) {
    console.error('[vendor-approval-email] send failed:', emailError);
    return apiFail('EMAIL_SEND_FAILED', 'Could not send the approval email. Please try again.', 502);
  }

  const sentAt = new Date().toISOString();
  const { error: updateError } = await service
    .from('vendors')
    .update({ approval_email_sent_at: sentAt, approval_email_subject: parsed.data.subject, approval_email_body: finalBody })
    .eq('id', vendorId);
  if (updateError) return apiFail('DB_ERROR', updateError.message, 500);

  await recordAudit({
    action: 'vendor.approval_email_sent',
    entityType: 'vendor',
    entityId: vendorId,
    afterData: { approval_email_sent_at: sentAt },
  });

  return apiOk({ id: vendorId, approvalEmailSentAt: sentAt });
}
