import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../20261117160000_support_chat_ticket_idempotency.sql", import.meta.url), "utf8");

describe("support chat ticket idempotency migration", () => {
  it("stores the originating chatbot message and enforces one ticket per handoff", () => {
    expect(migration).toContain("ADD COLUMN chatbot_message_id uuid REFERENCES public.chatbot_messages(id) ON DELETE SET NULL");
    expect(migration).toMatch(/CREATE UNIQUE INDEX support_tickets_chatbot_message_id_unique[\s\S]*?WHERE chatbot_message_id IS NOT NULL/);
  });
});
