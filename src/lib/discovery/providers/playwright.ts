import { playwrightExtractUrl } from "@/lib/browser/playwright";
import { liveBrowserAllowed } from "@/lib/browser/flags";
import { DISCOVERY_CAPABILITIES, type DiscoveryBatch, type DiscoveryProvider, type RawDiscoveryItem, type RawJobDocument } from "../types";

const RESTRICTED =
  /captcha|access denied|please (log|sign) in|authentication required|verify you are human|unusual traffic/i;

export function createPlaywrightProvider(): DiscoveryProvider {
  return {
    id: "playwright",
    async discover(): Promise<DiscoveryBatch> {
      return {
        providerId: "playwright",
        live: liveBrowserAllowed(),
        items: [],
        nextCursor: null,
      };
    },
    async hydrate(item: RawDiscoveryItem): Promise<RawJobDocument> {
      void DISCOVERY_CAPABILITIES.automaticApplication;
      if (!liveBrowserAllowed()) {
        throw new Error("PLAYWRIGHT_HYDRATE_DISABLED");
      }
      const extracted = await playwrightExtractUrl(item.url);
      if (!extracted.ok) throw new Error(extracted.error);
      if (RESTRICTED.test(`${extracted.title}\n${extracted.text}`)) {
        throw new Error("PLAYWRIGHT_RESTRICTED_PAGE");
      }
      return {
        ...item,
        title: item.title || extracted.title || null,
        snippet: item.snippet || extracted.text.slice(0, 400),
        description: extracted.text.slice(0, 20000),
        hydrated: true,
        hydrateProviderId: "playwright",
        raw: { ...item.raw, snapshotHash: extracted.snapshotHash, finalUrl: extracted.finalUrl },
      };
    },
  };
}
