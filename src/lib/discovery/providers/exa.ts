import { normalizeExaResult, type ExaSearchHit } from "../normalize";
import { exaApiKey } from "../flags";
import type { DiscoveryBatch, DiscoveryProvider, SearchQuery } from "../types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";

type FetchLike = typeof fetch;

export function createExaProvider(fetchImpl: FetchLike = fetch): DiscoveryProvider {
  return {
    id: "exa",
    async discover(query: SearchQuery): Promise<DiscoveryBatch> {
      const key = exaApiKey();
      if (!key) {
        return {
          providerId: "exa",
          live: false,
          items: [],
          nextCursor: null,
          error: "EXA_API_KEY missing",
        };
      }
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - query.freshnessDays);
      const response = await fetchImpl(EXA_SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
        },
        body: JSON.stringify({
          query: query.text,
          type: "auto",
          numResults: query.limit,
          startPublishedDate: start.toISOString(),
          contents: {
            highlights: { maxCharacters: 400, numSentences: 2 },
          },
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return {
          providerId: "exa",
          live: true,
          items: [],
          nextCursor: null,
          error: `Exa search failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
        };
      }
      const payload = (await response.json()) as { results?: ExaSearchHit[] };
      const items = (payload.results ?? [])
        .map((hit) => normalizeExaResult(hit, true))
        .filter((row): row is NonNullable<typeof row> => row !== null);
      return {
        providerId: "exa",
        live: true,
        items,
        nextCursor: null,
      };
    },
  };
}
