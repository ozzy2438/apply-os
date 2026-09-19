import type { DiscoveryProvider } from "../types";

export { type DiscoveryProvider } from "../types";

export const APIFY_NOT_ENABLED = "APIFY_PROVIDER_NOT_ENABLED";

export function isSearchProvider(provider: DiscoveryProvider): boolean {
  return provider.id !== "playwright";
}
