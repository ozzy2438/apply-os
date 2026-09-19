export { DISCOVERY_CAPABILITIES, FUNNEL_STAGES } from "./types";
export type {
  DiscoveryProvider,
  DiscoveryBatch,
  DiscoveryRunResult,
  RawDiscoveryItem,
  SearchQuery,
} from "./types";
export { discoveryEnabled, discoveryModeLabel, exaEnabled } from "./flags";
export { buildSearchQueries } from "./queries";
export { runDiscoveryFunnel } from "./funnel";
export { runProviderDiscovery } from "./service";
export { providersForRun, registerDiscoveryProvider, createApifyExtensionPoint } from "./providers/registry";
export { createFixtureProvider, createFailingProvider } from "./providers/fixture";
export { createExaProvider } from "./providers/exa";
export { normalizeExaResult } from "./normalize";
export { clusterDiscoveryJobs } from "./dedupe";
export { withinFreshnessWindow } from "./freshness";
export { deskDiscoveryFacts } from "./desk";
export { latestDiscoveryRun, listDiscoveryItems, discoveryFactsForJob } from "./persist";
