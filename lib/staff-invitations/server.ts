import "server-only";

import { createHash, randomBytes } from "node:crypto";

type StaffInvitationEnvironment = Readonly<Record<string, string | undefined>>;

export function normalizeStaffInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createStaffInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashStaffInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function staffInvitationOrigin(env: StaffInvitationEnvironment = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    throw new Error("NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL is required for staff invitations");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Staff invitation site URL must be a valid origin");
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Staff invitation site URL must contain only an origin");
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("Staff invitation origin must use HTTPS outside localhost");
  }

  return url.origin;
}

export function buildStaffInvitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/staff-invitations/${encodeURIComponent(token)}`;
}
