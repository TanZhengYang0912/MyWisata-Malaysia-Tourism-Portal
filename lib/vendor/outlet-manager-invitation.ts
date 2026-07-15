import { createHash } from "node:crypto";

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildOutletManagerInvitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/outlet-manager-invitations/${encodeURIComponent(token)}`;
}
