export type DiscoveryQuery = {
  q: string;
  state: string | null;
  category: string | null;
  priceMax: number | null;
  freeOnly: boolean;
  bookableOnly: boolean;
  hiddenGemOnly: boolean;
};

const PRICE_MAX = 10_000;

function readTrimmed(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim() ?? "";
  return value || null;
}

function readPriceMax(params: URLSearchParams): number | null {
  const raw = params.get("priceMax")?.trim() ?? "";
  if (!raw) return null;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= PRICE_MAX ? value : null;
}

export function parseDiscoveryQuery(params: URLSearchParams): DiscoveryQuery {
  return {
    q: readTrimmed(params, "q") ?? "",
    state: readTrimmed(params, "state"),
    category: readTrimmed(params, "category"),
    priceMax: readPriceMax(params),
    freeOnly: params.get("free") === "1",
    bookableOnly: params.get("bookable") === "1",
    hiddenGemOnly: params.get("hiddenGem") === "1",
  };
}

export function serializeDiscoveryQuery(query: DiscoveryQuery): URLSearchParams {
  const params = new URLSearchParams();
  const q = query.q.trim();
  const state = query.state?.trim() ?? "";
  const category = query.category?.trim() ?? "";

  if (q) params.set("q", q);
  if (state) params.set("state", state);
  if (category) params.set("category", category);
  if (query.priceMax !== null && Number.isFinite(query.priceMax) && query.priceMax >= 0 && query.priceMax <= PRICE_MAX) {
    params.set("priceMax", String(query.priceMax));
  }
  if (query.freeOnly) params.set("free", "1");
  if (query.bookableOnly) params.set("bookable", "1");
  if (query.hiddenGemOnly) params.set("hiddenGem", "1");

  return params;
}
