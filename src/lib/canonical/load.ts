import { readFileSync } from "node:fs";
import path from "node:path";
import { assertCandidateProfileIntegrity } from "./validate";
import type { CanonicalProfile, DecisionPolicy } from "./types";

type Bundle = {
  profile: CanonicalProfile;
  policy: DecisionPolicy;
  schema: Record<string, unknown>;
};

let cached: Bundle | null = null;

function dataPath(name: string): string {
  return path.join(process.cwd(), "data", name);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(dataPath(name), "utf8")) as T;
}

export function loadCanonicalBundle(): Bundle {
  if (cached) return cached;
  const profile = readJson<CanonicalProfile>("candidate-profile.json");
  const policy = readJson<DecisionPolicy>("decision-policy.json");
  const schema = readJson<Record<string, unknown>>("candidate-profile.schema.json");
  assertCandidateProfileIntegrity(profile);
  if (profile.schema_version !== "1.1.0") throw new Error("candidate-profile.json is not 1.1.0");
  if (policy.policy_version !== "1.1.0") throw new Error("decision-policy.json is not 1.1.0");
  cached = { profile, policy, schema };
  return cached;
}

export function loadCanonicalProfile(): CanonicalProfile {
  return loadCanonicalBundle().profile;
}

export function loadDecisionPolicy(): DecisionPolicy {
  return loadCanonicalBundle().policy;
}

export function loadCandidateProfileSchema(): Record<string, unknown> {
  return loadCanonicalBundle().schema;
}

export function resetCanonicalCache(): void {
  cached = null;
}
