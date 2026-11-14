import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type Row } from "@/lib/events/__tests__/event-staff-fake-db";
import { verifyEventStaffLinkToken } from "@/lib/events/event-staff-link-token";

const VENDOR_ID = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN_ID = "77777777-7777-4777-8777-777777777777";
const LIVE = { ends_at: "2999-01-01T00:00:00Z" };

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { GET, POST } from "../route";

const params = { params: Promise.resolve({ vendorId: VENDOR_ID, campaignId: CAMPAIGN_ID }) };

function setup(seed: Record<string, Row[]> = {}, options: Parameters<typeof makeFakeDb>[1] = {}) {
  const fake = makeFakeDb({
    promotion_campaign_vendors: [{ id: "r1", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, status: "approved" }],
    promotion_campaigns: [{ id: CAMPAIGN_ID, ...LIVE }],
    event_staff_links: [],
    event_staff_members: [],
    ...seed,
  }, options);
  mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { userId: "owner-1", serviceDb: fake.db } });
  return fake;
}

const post = (body: unknown) => POST(new Request("http://localhost/x", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}), params);

describe("owner event staff link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("names the member's user foreign key, since removed_by also points at users", async () => {
    const fake = setup();
    const columns: string[] = [];
    const from = fake.db.from.bind(fake.db);
    fake.db.from = (table: string) => {
      const query = from(table);
      if (table !== "event_staff_members") return query;
      const select = query.select as (value?: string) => unknown;
      (query as unknown as { select: (value?: string) => unknown }).select = (value?: string) => { columns.push(value ?? ""); return select(value); };
      return query;
    };
    await GET(new Request("http://localhost/x"), params);
    // PostgREST rejects an ambiguous users(...) embed (PGRST201) when a table has two FKs to users.
    expect(columns.join()).toContain("users!event_staff_members_user_id_fkey(email)");
  });

  it("is owner-only and open to event vendors", async () => {
    setup();
    await GET(new Request("http://localhost/x"), params);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
  });

  it("returns 404 when the vendor has no approved registration in the event", async () => {
    setup({ promotion_campaign_vendors: [{ id: "r1", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, status: "pending" }] });
    const response = await GET(new Request("http://localhost/x"), params);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "NOT_PARTICIPATING" } });
  });

  it("lists the active link and active members", async () => {
    setup({
      event_staff_links: [{ id: "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, revoked_at: null }],
      event_staff_members: [
        { id: "m1", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, display_name: "Amin", joined_at: "2026-11-20T01:00:00Z", removed_at: null, users: { email: "amin@example.test" } },
        { id: "m2", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, display_name: "Gone", joined_at: "2026-11-19T01:00:00Z", removed_at: "2026-11-19T02:00:00Z", users: { email: "gone@example.test" } },
      ],
    });
    const response = await GET(new Request("http://localhost/x"), params);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(verifyEventStaffLinkToken(body.data.link.token)).toEqual({ linkId: "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77" });
    expect(body.data.link.expiresAt).toBe(LIVE.ends_at);
    expect(body.data.members).toEqual([{ id: "m1", displayName: "Amin", email: "amin@example.test", joinedAt: "2026-11-20T01:00:00Z" }]);
  });

  it("returns a null link before one is created", async () => {
    setup();
    const body = await (await GET(new Request("http://localhost/x"), params)).json();
    expect(body.data).toEqual({ link: null, members: [] });
  });

  it("creates a link once and returns the same one again without writing", async () => {
    const fake = setup();
    const first = await post({});
    expect(first.status).toBe(200);
    const created = fake.writes.filter((write) => write.table === "event_staff_links");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ op: "insert", values: { vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, created_by: "owner-1" } });
    expect(fake.writes.find((write) => write.table === "audit_logs")).toMatchObject({ values: { action: "event_staff.link_created", actor_id: "owner-1" } });

    const existing = setup({ event_staff_links: [{ id: "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, revoked_at: null }] });
    const again = await post({});
    expect(verifyEventStaffLinkToken((await again.json()).data.link.token)).toEqual({ linkId: "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77" });
    expect(existing.writes).toEqual([]);
  });

  it("rotates by revoking the active link and creating a new one", async () => {
    const fake = setup({ event_staff_links: [{ id: "5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, revoked_at: null }] });
    const response = await post({ rotate: true });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(fake.writes.map((write) => [write.table, write.op])).toEqual([
      ["event_staff_links", "update"], ["event_staff_links", "insert"], ["audit_logs", "insert"],
    ]);
    expect(fake.writes[0].values).toMatchObject({ revoked_at: expect.any(String) });
    expect(verifyEventStaffLinkToken(body.data.link.token)?.linkId).not.toBe("5f2c9a41-7e0b-4c1d-9a2e-3b8d6f1c0e77");
    expect(fake.writes[2].values).toMatchObject({ action: "event_staff.link_rotated" });
  });

  it("answers a concurrent create with the link that won", async () => {
    // The other request's row lands between our read and our insert.
    const links: Row[] = [];
    const fake = setup({ event_staff_links: links }, { failWrites: ["event_staff_links"], failCode: "23505" });
    const from = fake.db.from.bind(fake.db);
    fake.db.from = (table: string) => {
      const query = from(table);
      if (table !== "event_staff_links") return query;
      const insert = query.insert;
      query.insert = (values: Parameters<typeof insert>[0]) => {
        links.push({ id: "99999999-9999-4999-8999-999999999999", vendor_id: VENDOR_ID, campaign_id: CAMPAIGN_ID, revoked_at: null });
        return insert(values);
      };
      return query;
    };
    const response = await post({});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(verifyEventStaffLinkToken(body.data.link.token)?.linkId).toBe("99999999-9999-4999-8999-999999999999");
    expect(fake.writes.some((write) => write.table === "audit_logs")).toBe(false);
  });

  it("refuses to create a link after the event ended", async () => {
    setup({ promotion_campaigns: [{ id: CAMPAIGN_ID, ends_at: "2000-01-01T00:00:00Z" }] });
    const response = await post({});
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "EVENT_ENDED" } });
  });

  it("rejects unknown body fields", async () => {
    setup();
    expect((await post({ rotate: true, extra: 1 })).status).toBeGreaterThanOrEqual(400);
  });
});
