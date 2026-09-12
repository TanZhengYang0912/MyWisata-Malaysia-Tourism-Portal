import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { moderateAccountText, moderateWalletReason } from "./moderation";

const originalKey = process.env.GOOGLE_AI_KEY;
const originalModel = process.env.GEMINI_MODEL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.GOOGLE_AI_KEY;
  else process.env.GOOGLE_AI_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalModel;
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function geminiResponse(payload: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("moderateAccountText", () => {
  it("sends the account context and accepts clean strict JSON", async () => {
    process.env.GOOGLE_AI_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: '{"flagged":false,"categories":[]}' }] } }] }),
    );

    await expect(moderateAccountText("Please review my account fairly.", "suspension_appeal")).resolves.toEqual({ flagged: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1beta/models/gemini-3.1-flash-lite:generateContent?key=test-key"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.contents[0].parts[0].text).toContain("suspension appeal");
  });

  it("uses GEMINI_MODEL when configured", async () => {
    process.env.GOOGLE_AI_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-custom-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: '{"flagged":false}' }] } }] }),
    );

    await moderateAccountText("A valid administrator reason.", "suspend_reason");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v1beta/models/gemini-custom-test:generateContent");
  });

  it("returns categories for flagged text", async () => {
    process.env.GOOGLE_AI_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: '{"flagged":true,"categories":["harassment"]}' }] } }] }),
    );

    await expect(moderateAccountText("Threatening content", "soft_delete_reason")).resolves.toEqual({ flagged: true, categories: ["harassment"] });
  });

  it.each([
    ["missing key", () => { delete process.env.GOOGLE_AI_KEY; }],
    ["non-2xx", () => {
      process.env.GOOGLE_AI_KEY = "test-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiResponse({ error: "quota" }, false, 429));
    }],
    ["transport failure", () => {
      process.env.GOOGLE_AI_KEY = "test-key";
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    }],
    ["malformed JSON", () => {
      process.env.GOOGLE_AI_KEY = "test-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiResponse({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }));
    }],
  ])("fails closed for %s", async (_label, setup) => {
    setup();
    await expect(moderateAccountText("A sufficiently long reason.", "unsuspend_reason")).resolves.toEqual({ error: "api_unavailable" });
  });
});

describe("moderateWalletReason", () => {
  it("requires relevant strict JSON for the selected Wallet category", async () => {
    process.env.GOOGLE_AI_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: '{"flagged":false,"relevant":true,"professional":true,"categories":[],"advisoryMessage":null}' }] } }] }),
    );

    await expect(moderateWalletReason(
      "The payout bank information does not match the verified account.",
      "reject",
      "bank_details_mismatch",
    )).resolves.toEqual({ flagged: false, relevant: true, professional: true, categories: [], advisoryMessage: null });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.contents[0].parts[0].text).toContain("bank_details_mismatch");
  });

  it("returns irrelevant and flagged results instead of treating them as clean", async () => {
    process.env.GOOGLE_AI_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: '{"flagged":false,"relevant":false,"professional":true,"categories":["unrelated"],"advisoryMessage":"State how the payout details failed verification."}' }] } }] }),
    );
    await expect(moderateWalletReason("I do not like this decision.", "hold", "risk_review_required"))
      .resolves.toEqual({ flagged: false, relevant: false, professional: true, categories: ["unrelated"], advisoryMessage: "State how the payout details failed verification." });

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: '{"flagged":true,"relevant":true,"professional":false,"categories":["harassment"],"advisoryMessage":null}' }] } }] }),
    );
    await expect(moderateWalletReason("You are an idiot and I will hurt you.", "reject", "other"))
      .resolves.toEqual({ flagged: true, relevant: true, professional: false, categories: ["harassment"], advisoryMessage: null });
  });

  it('fails closed when professionalism or advisory output is malformed', async () => {
    process.env.GOOGLE_AI_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: '{"flagged":false,"relevant":true,"professional":"yes","categories":[],"advisoryMessage":null}' }] } }] }),
    );
    await expect(moderateWalletReason("A valid reason for review.", "reject", "other"))
      .resolves.toEqual({ error: "api_unavailable" });

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      geminiResponse({ candidates: [{ content: { parts: [{ text: `${JSON.stringify({ flagged: false, relevant: false, professional: true, categories: [], advisoryMessage: "x".repeat(301) })}` }] } }] }),
    );
    await expect(moderateWalletReason("A valid reason for review.", "reject", "other"))
      .resolves.toEqual({ error: "api_unavailable" });
  });

  it.each([
    ["missing key", () => { delete process.env.GOOGLE_AI_KEY; }],
    ["malformed JSON", () => {
      process.env.GOOGLE_AI_KEY = "test-key";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(geminiResponse({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }));
    }],
  ])("fails closed for Wallet moderation when %s", async (_label, setup) => {
    setup();
    await expect(moderateWalletReason("The payout account needs review.", "hold", "risk_review_required"))
      .resolves.toEqual({ error: "api_unavailable" });
  });
});
