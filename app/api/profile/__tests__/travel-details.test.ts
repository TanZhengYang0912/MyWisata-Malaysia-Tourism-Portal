import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), from: vi.fn(), rpc: vi.fn(), account: vi.fn(), result: { data: null as unknown, error: null as unknown, count: 0 },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.auth }, from: mocks.from, rpc: mocks.rpc }) }));
import { GET as getPersonal, PUT as putPersonal, DELETE as clearPersonal } from "../personal-details/route";
import { GET as list, POST as create } from "../travellers/route";
import { GET as getOne, PUT as update, DELETE as remove } from "../travellers/[id]/route";
import { EMPTY_PERSONAL_DETAILS, EMPTY_TRAVELLER, travelDetailsToRow } from "@/lib/profile/travel-details";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id }) };
const row = { ...travelDetailsToRow({ ...EMPTY_PERSONAL_DETAILS, legalName: "Aina" }), id, user_id: owner, contact_phone: null, relationship: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
function request(body?: unknown, query = "") {
  return new Request(`https://test.local/api/profile/travellers${query}`, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
}
function chain() {
  const result = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(), upsert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    single: vi.fn(async () => mocks.result), maybeSingle: vi.fn(async () => mocks.result), range: vi.fn(async () => mocks.result),
    then: (resolve: (value: typeof mocks.result) => unknown) => Promise.resolve(mocks.result).then(resolve),
  };
  return result;
}
let dataQuery: ReturnType<typeof chain>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ data: { user: { id: owner, is_anonymous: false } }, error: null });
  mocks.account.mockResolvedValue({ data: { status: "active" }, error: null });
  mocks.result = { data: null, error: null, count: 0 };
  mocks.rpc.mockImplementation(async (name: string) => name === "save_saved_traveller_if_changed"
    ? { data: [{ changed: true }], error: null } : { data: true, error: null });
  dataQuery = chain();
  mocks.from.mockImplementation((table: string) => table === "users"
    ? { select: () => ({ eq: () => ({ maybeSingle: mocks.account }) }) } : dataQuery);
});

describe("private travel detail API boundaries", () => {
  it.each([null, { id: owner, is_anonymous: true }])("rejects guests and anonymous sessions", async (user) => {
    mocks.auth.mockResolvedValue({ data: { user }, error: null });
    const response = await getPersonal();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["suspended", "deleted"])("blocks %s accounts", async (status) => {
    mocks.account.mockResolvedValue({ data: { status }, error: null });
    expect((await create(request({ ...EMPTY_TRAVELLER, legalName: "Aina" }))).status).toBe(403);
    expect(dataQuery.insert).not.toHaveBeenCalled();
  });
  it("returns an empty optional profile and reads only the signed-in owner", async () => {
    const response = await getPersonal();
    expect((await response.json()).data).toEqual(EMPTY_PERSONAL_DETAILS);
    expect(dataQuery.eq).toHaveBeenCalledWith("user_id", owner);
  });
  it("saves explicit nulls and never accepts a client-selected owner", async () => {
    mocks.result.data = row;
    expect((await putPersonal(request(EMPTY_PERSONAL_DETAILS))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("save_personal_travel_details_if_changed", expect.objectContaining({ p_legal_name: null, p_emergency_contact_phone: null }));
    expect((await create(request({ ...EMPTY_TRAVELLER, legalName: "Aina", user_id: id }))).status).toBe(422);
    expect(dataQuery.insert).not.toHaveBeenCalled();
  });
  it("creates a traveller using server ownership and a private DTO", async () => {
    mocks.result.data = row;
    const response = await create(request({ ...EMPTY_TRAVELLER, legalName: "Aina" }));
    expect(response.status).toBe(201);
    expect(dataQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: owner, legal_name: "Aina" }));
    expect((await response.json()).data).not.toHaveProperty("user_id");
  });
  it("bounds list reads and reports the owner's count", async () => {
    mocks.result = { data: [row], error: null, count: 26 };
    const response = await list(request(undefined, "?page=2"));
    expect(dataQuery.eq).toHaveBeenCalledWith("user_id", owner);
    expect(dataQuery.range).toHaveBeenCalledWith(25, 49);
    expect((await response.json()).data).toMatchObject({ page: 2, pageSize: 25, total: 26, pages: 2 });
    expect((await list(request(undefined, "?pageSize=10000"))).status).toBe(422);
  });
  it("scopes single-record reads, edits and deletes to both ID and owner", async () => {
    mocks.result.data = row;
    expect((await getOne(request(), context)).status).toBe(200);
    expect((await update(request({ ...EMPTY_TRAVELLER, legalName: "Updated Name" }), context)).status).toBe(200);
    expect((await remove(request(), context)).status).toBe(200);
    expect(dataQuery.eq).toHaveBeenCalledWith("id", id);
    expect(dataQuery.eq).toHaveBeenCalledWith("user_id", owner);
    expect(mocks.rpc).toHaveBeenCalledWith("save_saved_traveller_if_changed", expect.objectContaining({ p_traveller_id: id, p_legal_name: "Updated Name", p_emergency_contact_phone: null }));
  });
  it("gives the same not-found response for unavailable and foreign records", async () => {
    for (const response of [await getOne(request(), context), await update(request({ ...EMPTY_TRAVELLER, legalName: "Aina" }), context), await remove(request(), context)]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
  it("rejects oversized data before inserting and hides database failure details", async () => {
    expect((await create(request({ ...EMPTY_TRAVELLER, legalName: "x".repeat(9000) }))).status).toBe(413);
    expect(dataQuery.insert).not.toHaveBeenCalled();
    mocks.result.error = { message: "database internal private-secret-path", code: "42P01" };
    const response = await getPersonal();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private-secret-path");
  });
  it("clears only the current owner's private profile", async () => {
    const response = await clearPersonal();
    expect(response.status).toBe(200);
    expect(dataQuery.delete).toHaveBeenCalled();
    expect(dataQuery.eq).toHaveBeenCalledWith("user_id", owner);
  });
});
