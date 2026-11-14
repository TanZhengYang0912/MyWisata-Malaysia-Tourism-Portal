import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type Row } from "@/lib/events/__tests__/event-staff-fake-db";
import { signEventStaffLinkToken } from "@/lib/events/event-staff-link-token";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "77777777-7777-4777-8777-777777777777";
const LINK_ID = "88888888-8888-4888-8888-888888888888";
const LOCATION_ID = "33333333-3333-4333-8333-333333333333";
const TOKEN = signEventStaffLinkToken(LINK_ID);
const LIVE = "2999-01-01T00:00:00Z";

const mocks = vi.hoisted(() => ({
  service: null as unknown,
  getUser: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => mocks.service }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser, signInWithOtp: mocks.signInWithOtp, verifyOtp: mocks.verifyOtp } }),
}));

import { GET as getLink } from "../links/[token]/route";
import { POST as sendCode } from "../auth/email/send/route";
import { POST as verifyCode } from "../auth/email/verify/route";
import { POST as join } from "../join/route";
import { GET as assignments } from "../assignments/route";

function link(overrides: Row = {}): Row {
  return {
    id: LINK_ID, vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, revoked_at: null,
    vendors: { name: "Kopi Stall", status: "approved" },
    promotion_campaigns: { title: "Night Market", ends_at: LIVE },
    ...overrides,
  };
}

function setup(seed: Record<string, Row[]> = {}) {
  const fake = makeFakeDb({
    event_staff_links: [link()],
    promotion_campaign_vendors: [{ id: "r1", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, status: "approved", location: { id: LOCATION_ID, name: "Hall A", starts_on: "2026-11-13", ends_on: "2026-11-15", status: "active" } }],
    event_staff_members: [],
    ...seed,
  });
  (fake.db as unknown as { rpc: unknown }).rpc = mocks.rpc;
  mocks.service = fake.db;
  return fake;
}

const post = (body: unknown) => new Request("http://localhost/x", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const tokenParams = (token: string) => ({ params: Promise.resolve({ token }) });
const signedIn = (user: Row = {}) => mocks.getUser.mockResolvedValue({
  data: { user: { id: "staff-1", email: "staff@example.com", email_confirmed_at: "2026-11-13T00:00:00Z", ...user } },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: null } });
});

describe("GET /api/event-staff/links/[token]", () => {
  it("shows only the vendor, event and expiry for a live link", async () => {
    setup();
    const response = await getLink(new Request("http://localhost/x"), tokenParams(TOKEN));
    await expect(response.json()).resolves.toEqual({ data: { vendorName: "Kopi Stall", campaignTitle: "Night Market", expiresAt: LIVE }, error: null });
  });

  it.each([
    ["a forged token", {}, `esl1.${LINK_ID}.AAAA`],
    ["a revoked link", { event_staff_links: [link({ revoked_at: "2026-01-01T00:00:00Z" })] }, TOKEN],
    ["an ended event", { event_staff_links: [link({ promotion_campaigns: { title: "Night Market", ends_at: "2000-01-01T00:00:00Z" } })] }, TOKEN],
    ["an unapproved vendor", { event_staff_links: [link({ vendors: { name: "Kopi Stall", status: "suspended" } })] }, TOKEN],
    ["a vendor without an approved registration", { promotion_campaign_vendors: [] }, TOKEN],
  ])("answers %s with the same 404", async (_label, seed, token) => {
    setup(seed as Record<string, Row[]>);
    const response = await getLink(new Request("http://localhost/x"), tokenParams(token));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ data: null, error: { code: "LINK_INVALID", message: "This link is invalid or has expired" } });
  });
});

describe("POST /api/event-staff/auth/email/send", () => {
  const body = { token: TOKEN, email: " Staff@Example.com ", displayName: "Aina", captchaToken: "proof" };

  it("sends a code that creates a new user named as typed", async () => {
    setup();
    const response = await sendCode(post(body));
    expect(response.status).toBe(200);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "staff@example.com",
      options: { shouldCreateUser: true, captchaToken: "proof", data: { full_name: "Aina", preferred_locale: "en" } },
    });
  });

  it("never creates a second account for an existing email", async () => {
    setup();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await sendCode(post(body));
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: "staff@example.com", options: { shouldCreateUser: false, captchaToken: "proof" } });
  });

  it("sends nothing for an invalid link", async () => {
    setup({ event_staff_links: [] });
    expect((await sendCode(post(body))).status).toBe(404);
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "captcha_failed" }, 403, "HUMAN_VERIFICATION_FAILED"],
    [{ status: 429 }, 429, "OTP_RATE_LIMITED"],
    [{ code: "other" }, 502, "OTP_SEND_FAILED"],
  ])("maps a Supabase send error %o", async (error, status, code) => {
    setup();
    mocks.signInWithOtp.mockResolvedValue({ error });
    const response = await sendCode(post(body));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });
});

describe("POST /api/event-staff/auth/email/verify", () => {
  it("verifies the typed email's code for a live link", async () => {
    setup();
    const response = await verifyCode(post({ token: TOKEN, email: "Staff@example.com", code: "123456" }));
    expect(response.status).toBe(200);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "staff@example.com", token: "123456", type: "email" });
  });

  it("rejects a bad code", async () => {
    setup();
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "bad" } });
    const response = await verifyCode(post({ token: TOKEN, email: "staff@example.com", code: "000000" }));
    expect(response.status).toBe(422);
  });

  it("checks the link before the code", async () => {
    setup({ event_staff_links: [] });
    expect((await verifyCode(post({ token: TOKEN, email: "staff@example.com", code: "123456" }))).status).toBe(404);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("POST /api/event-staff/join", () => {
  it("requires a session", async () => {
    setup();
    expect((await join(post({ token: TOKEN, displayName: "Aina" }))).status).toBe(401);
  });

  it("requires a confirmed email", async () => {
    setup();
    signedIn({ email_confirmed_at: null });
    const response = await join(post({ token: TOKEN, displayName: "Aina" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EMAIL_UNVERIFIED" } });
  });

  it("joins once, however many times it is submitted", async () => {
    const fake = setup();
    signedIn();
    const first = await join(post({ token: TOKEN, displayName: "Aina" }));
    const second = await join(post({ token: TOKEN, displayName: "Someone else" }));
    expect(first.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ data: { vendorId: VENDOR_ID, campaignId: CAMPAIGN_ID }, error: null });
    expect(fake.writes.filter((write) => write.table === "event_staff_members")).toHaveLength(1);
    expect(fake.writes.filter((write) => write.table === "audit_logs")).toHaveLength(1);
    expect(fake.writes[0].values).toMatchObject({ vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, user_id: "staff-1", display_name: "Aina", joined_via: LINK_ID });
  });

  it("refuses a removed member, even through a new link", async () => {
    const fake = setup({ event_staff_members: [{ id: "m1", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, user_id: "staff-1", removed_at: "2026-11-13T00:00:00Z" }] });
    signedIn();
    const response = await join(post({ token: TOKEN, displayName: "Aina" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MEMBER_REMOVED" } });
    expect(fake.writes).toHaveLength(0);
  });

  it("refuses a revoked link", async () => {
    setup({ event_staff_links: [link({ revoked_at: "2026-01-01T00:00:00Z" })] });
    signedIn();
    expect((await join(post({ token: TOKEN, displayName: "Aina" }))).status).toBe(404);
  });
});

describe("GET /api/event-staff/assignments", () => {
  it("requires a session", async () => {
    setup();
    expect((await assignments()).status).toBe(401);
  });

  it("lists live memberships with their approved active locations", async () => {
    const OTHER = "99999999-9999-4999-8999-999999999999";
    setup({
      event_staff_members: [
        { id: "m1", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, user_id: "staff-1", removed_at: null, vendors: { name: "Kopi Stall", status: "approved" }, promotion_campaigns: { title: "Night Market", ends_at: LIVE } },
        { id: "m2", vendor_id: VENDOR_ID, campaign_id: OTHER, user_id: "staff-1", removed_at: null, vendors: { name: "Kopi Stall", status: "approved" }, promotion_campaigns: { title: "Old Fair", ends_at: "2000-01-01T00:00:00Z" } },
        { id: "m3", vendor_id: VENDOR_ID, campaign_id: OTHER, user_id: "staff-1", removed_at: "2026-11-13T00:00:00Z", vendors: { name: "Kopi Stall", status: "approved" }, promotion_campaigns: { title: "Removed", ends_at: LIVE } },
      ],
    });
    signedIn();
    const response = await assignments();
    await expect(response.json()).resolves.toEqual({
      data: [{
        vendorId: VENDOR_ID, vendorName: "Kopi Stall", campaignId: CAMPAIGN_ID, campaignTitle: "Night Market", expiresAt: LIVE,
        locations: [{ id: LOCATION_ID, name: "Hall A", startsOn: "2026-11-13", endsOn: "2026-11-15" }],
      }],
      error: null,
    });
  });
});
