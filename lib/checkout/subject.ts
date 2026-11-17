import 'server-only';
import { checkoutContactSchema } from './contact';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { CUSTOMER_CAPABILITY } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';
import { guestPrivateResponse, isSameOriginMutation, reserveGuestRateLimit, resolveGuestSession } from './guest-session';

export type CheckoutSubject = { kind: 'account'; userId: string } | { kind: 'guest'; guestSubjectId: string };
export type CheckoutContact = { email: string; name: string | null; phone: string | null };
export type CheckoutBuyer = { subject: CheckoutSubject; contact: CheckoutContact };


export async function resolveCheckoutSubject(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (user) {
    const failure = customerCapabilityFailure(CUSTOMER_CAPABILITY.CHECKOUT,
      await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.CHECKOUT), 'Email verification is required before checkout');
    if (failure) return { ok: false as const, response: failure };
    return { ok: true as const, db, subject: { kind: 'account' as const, userId: user.id }, user };
  }
  // Invalid presented account credentials must never become guest authority.
  if (error && error.name !== 'AuthSessionMissingError') return { ok: false as const, response: guestPrivateResponse(null, 401) };
  if (!isSameOriginMutation(request)) return { ok: false as const, response: guestPrivateResponse(null, 403) };
  const guest = await resolveGuestSession(request);
  if (!guest) return { ok: false as const, response: guestPrivateResponse(null, 401) };
  if (!await reserveGuestRateLimit(`checkout:${guest.guestSubjectId}`, 20, 900)) return { ok: false as const, response: guestPrivateResponse(null, 429) };
  return { ok: true as const, db: createServiceClient(), subject: { kind: 'guest' as const, guestSubjectId: guest.guestSubjectId }, user: null };
}
export async function resolveCheckoutContact(context: Awaited<ReturnType<typeof resolveCheckoutSubject>>, input: unknown): Promise<CheckoutContact | null> {
  if (!context.ok) return null;
  if (context.subject.kind === 'guest') {
    const parsed = checkoutContactSchema.safeParse(input);
    return parsed.success ? { email: parsed.data.email, name: parsed.data.name ?? null, phone: parsed.data.phone ?? null } : null;
  }
  // A signed-in buyer may book under another name or email; it is stored on this order only, never on the profile.
  const user = context.user;
  const submitted = (input ?? {}) as { email?: string; name?: string | null; phone?: string | null };
  const parsed = checkoutContactSchema.safeParse({ email: submitted.email ?? user?.email, name: submitted.name ?? (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null), phone: submitted.phone ?? (user?.phone || null) });
  return parsed.success ? { email: parsed.data.email, name: parsed.data.name ?? null, phone: parsed.data.phone ?? null } : null;
}
