import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/admin/csv";

describe("csvCell", () => {
  it("quotes cells containing commas, quotes, or newlines", () => {
    expect(csvCell("stripe_connect")).toBe("stripe_connect");
    expect(csvCell("customer@example.com")).toBe("customer@example.com");
    expect(csvCell("Smith, Aisha")).toBe('"Smith, Aisha"');
    expect(csvCell('say "hello"')).toBe('"say ""hello"""');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
  });
});
