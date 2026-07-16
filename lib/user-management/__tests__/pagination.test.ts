import { describe, expect, it } from "vitest";
import { parseUserManagementFilters } from "@/lib/user-management/filters";

describe("user management filters", () => {
  it("defaults to page 1 and 15 rows", () => {
    expect(parseUserManagementFilters(new URLSearchParams())).toMatchObject({ page: 1, pageSize: 15 });
  });

  it("accepts supported page sizes and clamps invalid pages", () => {
    expect(parseUserManagementFilters(new URLSearchParams("page=0&pageSize=50"))).toMatchObject({ page: 1, pageSize: 50 });
  });

  it("falls back when the page size is unsupported", () => {
    expect(parseUserManagementFilters(new URLSearchParams("pageSize=20")).pageSize).toBe(15);
  });
});
