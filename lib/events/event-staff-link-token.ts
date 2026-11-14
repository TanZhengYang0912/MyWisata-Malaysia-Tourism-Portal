import { createHmac, timingSafeEqual } from "node:crypto";

// Staff link for one vendor × event: `esl1.<linkId>.<mac>`. Only the link row
// id is signed, so nothing secret is stored and the owner can re-copy the
// link at any time. The `esl1.` prefix is part of the MAC input, which keeps
// it distinct from other tokens sharing the fallback secret.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSecret() {
  return process.env.EVENT_STAFF_LINK_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "mylawatan-event-staff-link-signing-secret-dev";
}

function mac(linkId: string, secret: string) {
  return createHmac("sha256", secret).update(`esl1.${linkId}`).digest();
}

export function signEventStaffLinkToken(linkId: string, secret = getSecret()) {
  return `esl1.${linkId}.${mac(linkId, secret).toString("base64url")}`;
}

export function verifyEventStaffLinkToken(token: string, secret = getSecret()): { linkId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "esl1" || !UUID.test(parts[1])) return null;
  const expected = mac(parts[1], secret);
  const received = Buffer.from(parts[2], "base64url");
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return null;
  return { linkId: parts[1] };
}
