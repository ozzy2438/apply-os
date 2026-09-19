import { loadCanonicalBundle } from "@/lib/canonical/load";
import type { CanonicalProfile, DecisionPolicy } from "@/lib/canonical/types";
import { loadDiscoveryPolicy } from "./policy";
import type { DiscoveryPolicyDoc, SearchQuery } from "./types";

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))];
}

function locationNeedles(profile: CanonicalProfile, includeAustraliaRemote: boolean): string[] {
  const loc = profile.constraints.locations;
  const out = [
    loc.base,
    ...(loc.preferred ?? []),
    ...(loc.acceptable ?? []),
    "Melbourne",
    "Victoria",
  ];
  if (includeAustraliaRemote) {
    out.push("Remote within Australia", "Australia remote", "remote Australia");
  }
  return unique(out);
}

function workModes(profile: CanonicalProfile): string[] {
  return unique([
    ...(profile.constraints.work_modes.preferred ?? []),
    ...(profile.constraints.work_modes.acceptable ?? []),
  ]);
}

export function buildSearchQueries(input?: {
  profile?: CanonicalProfile;
  policy?: DecisionPolicy;
  discovery?: DiscoveryPolicyDoc;
  freshnessDays?: number;
}): SearchQuery[] {
  const bundle = input?.profile && input.policy ? null : loadCanonicalBundle();
  const profile = input?.profile ?? bundle!.profile;
  const policy = input?.policy ?? bundle!.policy;
  const discovery = input?.discovery ?? loadDiscoveryPolicy();
  const freshnessDays = input?.freshnessDays ?? discovery.freshness_days;
  const includeAustraliaRemote = discovery.include_australia_remote;
  const locations = locationNeedles(profile, includeAustraliaRemote);
  const modes = workModes(profile);
  const enabled = policy.active_discovery_targets.filter((t) => t.enabled_for_discovery);

  return enabled.map((target) => {
    const family = profile.role_targets.find((r) => r.role_family_id === target.role_family_id);
    const titles = family?.acceptable_titles ?? [target.role_family];
    const avoidTitles = family?.avoid_titles ?? [];
    const titleClause = titles.slice(0, 6).map((t) => `"${t}"`).join(" OR ");
    const locationClause = [
      "Melbourne",
      "Victoria",
      includeAustraliaRemote ? `"Australia remote"` : null,
      includeAustraliaRemote ? `"remote Australia"` : null,
      "hybrid",
    ]
      .filter(Boolean)
      .join(" OR ");
    const avoidClause = avoidTitles.map((t) => `-"${t}"`).join(" ");
    const modeClause = modes.length ? modes.join(" OR ") : "hybrid OR remote";
    const text = [
      `(${titleClause})`,
      `(${locationClause})`,
      `(${modeClause})`,
      "(jobs OR careers OR greenhouse OR lever OR ashby OR workable)",
      avoidClause,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      id: `q-${target.role_family_id}`,
      roleFamilyId: target.role_family_id,
      roleFamily: target.role_family,
      titles,
      avoidTitles,
      locations,
      workModes: modes,
      freshnessDays,
      includeAustraliaRemote,
      text,
      configVersion: discovery.config_version,
      limit: discovery.max_results_per_query,
    };
  });
}
