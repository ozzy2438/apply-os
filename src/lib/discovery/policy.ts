import { readFileSync } from "node:fs";
import path from "node:path";
import type { DiscoveryPolicyDoc } from "./types";

let cached: DiscoveryPolicyDoc | null = null;

export function loadDiscoveryPolicy(): DiscoveryPolicyDoc {
  if (cached) return cached;
  const file = path.join(process.cwd(), "data", "discovery-policy.json");
  cached = JSON.parse(readFileSync(file, "utf8")) as DiscoveryPolicyDoc;
  return cached;
}

export function resetDiscoveryPolicyCache(): void {
  cached = null;
}

export function discoveryFreshnessDays(override?: number): number {
  if (override != null && Number.isFinite(override) && override > 0) return Math.floor(override);
  return loadDiscoveryPolicy().freshness_days;
}
