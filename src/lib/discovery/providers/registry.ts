import { allowDiscoveryFixture, exaEnabled } from "../flags";
import { loadDiscoveryPolicy } from "../policy";
import { createExaProvider } from "./exa";
import { createFeedProvider } from "./feeds";
import { createFixtureProvider } from "./fixture";
import { createPlaywrightProvider } from "./playwright";
import { createApifyProvider } from "./apify";
import { isSearchProvider } from "./contract";
import type { DiscoveryProvider } from "../types";

const extras = new Map<string, DiscoveryProvider>();

export function registerDiscoveryProvider(provider: DiscoveryProvider): void {
  extras.set(provider.id, provider);
}

export function clearDiscoveryProviderRegistry(): void {
  extras.clear();
}

export function createApifyExtensionPoint(): DiscoveryProvider {
  return createApifyProvider();
}

export function defaultDiscoveryProviders(): DiscoveryProvider[] {
  const policy = loadDiscoveryPolicy();
  const out: DiscoveryProvider[] = [];
  if (policy.providers.exa.enabled && exaEnabled()) out.push(createExaProvider());
  if (policy.providers.feeds.enabled) out.push(createFeedProvider());
  if (policy.providers.playwright_hydrate.enabled) out.push(createPlaywrightProvider());
  for (const provider of extras.values()) {
    if (!out.some((p) => p.id === provider.id)) out.push(provider);
  }
  return out;
}

export function providersForRun(override?: DiscoveryProvider[]): {
  providers: DiscoveryProvider[];
  live: boolean;
  usedFixture: boolean;
} {
  if (override) {
    return {
      providers: override,
      live: override.some((p) => p.id === "exa"),
      usedFixture: override.some((p) => p.id === "fixture"),
    };
  }
  const providers = defaultDiscoveryProviders();
  const hasSearch = providers.some((p) => isSearchProvider(p) && p.id !== "feeds") || providers.some((p) => p.id === "exa");
  const feedOnly = providers.some((p) => p.id === "feeds");
  if (hasSearch) {
    return { providers, live: providers.some((p) => p.id === "exa"), usedFixture: false };
  }
  if (feedOnly && providers.some((p) => p.id === "feeds")) {
    // feeds with no configured URLs still yield an empty live:false batch
  }
  if (!allowDiscoveryFixture()) {
    return { providers, live: false, usedFixture: false };
  }
  return {
    providers: [createFixtureProvider(), ...providers],
    live: false,
    usedFixture: true,
  };
}
