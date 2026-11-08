import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261106014314_chat_thread_summaries.sql"), "utf8");

describe("chat thread summaries migration", () => {
  it("lets only the service role run both functions", () => {
    for (const signature of ["get_chat_thread_summaries(uuid, uuid[])", "mark_chat_thread_read(uuid, uuid)"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
    }
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
  });

  it("scopes rows to the customer's own threads or exactly the given outlets", () => {
    expect(sql).toMatch(/WHEN p_outlet_ids IS NULL THEN t\.customer_id = p_user_id\s+ELSE t\.outlet_id = ANY \(p_outlet_ids\)/);
  });

  it("counts unread as the counterpart's messages without the viewer's read row", () => {
    expect(sql).toContain("CASE WHEN p_outlet_ids IS NULL THEN m.sender_id <> t.customer_id ELSE m.sender_id = t.customer_id END");
    expect(sql).toMatch(/r\.message_id = m\.id AND r\.user_id = p_user_id/);
  });

  it("marks read idempotently without loading message ids in the app", () => {
    expect(sql).toMatch(/INSERT INTO public\.chat_message_reads \(message_id, user_id\)\s+SELECT m\.id, p_user_id/);
    expect(sql).toContain("ON CONFLICT (message_id, user_id) DO NOTHING");
  });
});
