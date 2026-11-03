import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callGemini: vi.fn() }));
vi.mock("@/lib/admin-ai/gemini", () => ({ callGemini: mocks.callGemini }));

const { generateTripNameSuggestions } = await import("../trip-name-suggestions.server");

describe("generateTripNameSuggestions input language", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks the model and validates its title in the language of the idea", async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ suggestions: ["沙巴美食之旅", "探索沙巴", "沙巴假期"] }));

    const result = await generateTripNameSuggestions({
      idea: "沙巴美食之旅",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      duration: { days: 3, nights: 2 },
      locale: "en",
    });

    expect(mocks.callGemini).toHaveBeenCalledWith(expect.stringContaining("requested locale"), expect.stringContaining('"locale":"zh-CN"'), expect.any(Object));
    expect(result).toEqual({ suggestions: ["沙巴美食之旅", "探索沙巴", "沙巴假期"], aiAvailable: true });
  });

  it("uses same-language fallback when the provider is unavailable", async () => {
    mocks.callGemini.mockRejectedValue(new Error("offline"));

    const result = await generateTripNameSuggestions({
      idea: "Percutian dengan keluarga",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      duration: { days: 3, nights: 2 },
      locale: "en",
    });

    expect(result.aiAvailable).toBe(false);
    expect(result.suggestions).toEqual([
      "Percutian dengan keluarga 3 Hari 2 Malam",
      "Percutian Percutian dengan keluarga",
      "Terokai Percutian dengan keluarga",
    ]);
  });
});
