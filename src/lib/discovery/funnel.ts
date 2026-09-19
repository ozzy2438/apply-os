import { randomUUID } from "node:crypto";
import { normalizeJobPosting } from "@/lib/ingest/normalize";
import { loadCanonicalBundle } from "@/lib/canonical/load";
import { mapCanonicalToRules } from "@/lib/canonical/map";
import { triageJob } from "@/lib/policy/triage";
import { ingestCanonical } from "@/lib/ingest/pipeline";
import { getProfile } from "@/lib/db/store";
import { getCanonicalJob } from "@/lib/db/store-extended";
import { nowIso } from "@/lib/time";
import { cheapFilterItem } from "./cheap-filter";
import { clusterDiscoveryJobs } from "./dedupe";
import { runDiscoveryHardFilters } from "./hard-filters";
import { withinFreshnessWindow } from "./freshness";
import { normalizeDiscoveryItem, rawTextFromNormalized } from "./normalize";
import { loadDiscoveryPolicy } from "./policy";
import { buildSearchQueries } from "./queries";
import { DISCOVERY_CAPABILITIES, type DiscoveryCluster, type DiscoveryProvider, type DiscoveryRunResult, type RawDiscoveryItem, type SearchQuery } from "./types";

export type FunnelOptions = {
  providers: DiscoveryProvider[];
  queries?: SearchQuery[];
  now?: Date;
  live: boolean;
  usedFixture: boolean;
  hydrate?: boolean;
  ingestDeepReview?: boolean;
  persist?: boolean;
};

function toPosting(cluster: DiscoveryCluster, nowIsoTs: string) {
  const primary = cluster.members[0]!;
  const merged = {
    title: cluster.title,
    company: cluster.company,
    location: cluster.location,
    salaryText: cluster.members.map((m) => m.salaryText).find(Boolean) ?? null,
    postedAt: cluster.postedAt,
    snippet: cluster.snippet,
    description: cluster.description,
    workMode: cluster.members.map((m) => m.workMode).find(Boolean) ?? null,
    employmentType: cluster.members.map((m) => m.employmentType).find(Boolean) ?? null,
  };
  return normalizeJobPosting({
    id: cluster.clusterId,
    rawText: rawTextFromNormalized(merged),
    url: cluster.canonicalUrl ?? cluster.sourceUrls[0] ?? primary.sourceUrl,
    sourceType: "job_posting",
    createdAt: nowIsoTs,
  });
}

function bodyLength(cluster: DiscoveryCluster): number {
  return (cluster.description || cluster.snippet || "").length;
}

async function hydrateCluster(
  cluster: DiscoveryCluster,
  providers: DiscoveryProvider[],
  minChars: number,
): Promise<{ cluster: DiscoveryCluster; called: boolean }> {
  if (cluster.triageBucket !== "DEEP_REVIEW") return { cluster, called: false };
  if (bodyLength(cluster) >= minChars) return { cluster, called: false };
  const hydrator =
    providers.find((p) => p.hydrate && cluster.providers.includes(p.id)) ??
    providers.find((p) => p.id === "playwright" && p.hydrate);
  if (!hydrator?.hydrate) return { cluster: { ...cluster, hydrateAttempted: false }, called: false };

  const seed: RawDiscoveryItem = {
    providerId: cluster.providers[0] ?? hydrator.id,
    live: cluster.live,
    url: cluster.canonicalUrl ?? cluster.sourceUrls[0]!,
    title: cluster.title,
    company: cluster.company,
    location: cluster.location,
    snippet: cluster.snippet,
    publishedAt: cluster.postedAt,
    author: cluster.company,
    externalId: cluster.members[0]?.externalId ?? null,
    raw: { clusterId: cluster.clusterId },
  };
  try {
    const doc = await hydrator.hydrate(seed);
    const normalized = normalizeDiscoveryItem(doc, null, cluster.discoveredAt);
    return {
      called: true,
      cluster: {
        ...cluster,
        hydrateAttempted: true,
        hydrated: true,
        description: normalized.description ?? cluster.description,
        snippet: normalized.snippet ?? cluster.snippet,
        title: cluster.title ?? normalized.title,
        company: cluster.company ?? normalized.company,
        location: cluster.location ?? normalized.location,
        contentHash: normalized.contentHash,
        members: [...cluster.members, normalized],
      },
    };
  } catch {
    return { called: true, cluster: { ...cluster, hydrateAttempted: true } };
  }
}

export async function runDiscoveryFunnel(opts: FunnelOptions): Promise<DiscoveryRunResult> {
  void DISCOVERY_CAPABILITIES;
  const discoveryPolicy = loadDiscoveryPolicy();
  const { profile, policy } = loadCanonicalBundle();
  const now = opts.now ?? new Date();
  const discoveredAt = now.toISOString();
  const queries = opts.queries ?? buildSearchQueries({ profile, policy, discovery: discoveryPolicy });
  const providerErrors: Array<{ providerId: string; error: string }> = [];
  const rawItems: Array<{ item: RawDiscoveryItem; query: SearchQuery | null }> = [];

  for (const provider of opts.providers) {
    if (provider.id === "playwright") continue;
    const searchQueries =
      provider.id === "exa" && queries.length
        ? queries
        : queries.length
          ? [queries[0]!]
          : [
              {
                id: "q-empty",
                roleFamilyId: "none",
                roleFamily: "none",
                titles: [],
                avoidTitles: [],
                locations: [],
                workModes: [],
                freshnessDays: discoveryPolicy.freshness_days,
                includeAustraliaRemote: true,
                text: "",
                configVersion: discoveryPolicy.config_version,
                limit: discoveryPolicy.max_results_per_query,
              },
            ];
    let failed = false;
    for (const query of searchQueries) {
      if (failed) break;
      try {
        const batch = await provider.discover(query);
        if (batch.error) providerErrors.push({ providerId: provider.id, error: batch.error });
        for (const item of batch.items) rawItems.push({ item, query: query.id === "q-empty" ? null : query });
      } catch (error) {
        failed = true;
        providerErrors.push({
          providerId: provider.id,
          error: error instanceof Error ? error.message : "provider failed",
        });
      }
    }
  }

  let stale = 0;
  let cheapFiltered = 0;
  const normalized = [];
  for (const row of rawItems) {
    const job = normalizeDiscoveryItem(row.item, row.query, discoveredAt);
    if (!withinFreshnessWindow(job.postedAt, row.query?.freshnessDays ?? discoveryPolicy.freshness_days, now)) {
      stale += 1;
      continue;
    }
    const cheap = cheapFilterItem(job, queries, {
      dropUnusable: discoveryPolicy.cheap_filter.drop_unusable,
      avoidTitleDrop: discoveryPolicy.cheap_filter.avoid_title_drop,
    });
    if (cheap !== "keep") {
      cheapFiltered += 1;
      continue;
    }
    normalized.push(job);
  }

  const clusters = clusterDiscoveryJobs(normalized);
  const rules = mapCanonicalToRules(profile);
  let hydrateCalls = 0;
  let jevCalls = 0;
  let ingestCalls = 0;
  let deepReview = 0;
  let shortlist = 0;
  let hardReject = 0;
  let lowPriorityArchive = 0;
  let humanReview = 0;

  const completed: DiscoveryCluster[] = [];
  for (const cluster of clusters) {
    let current = cluster;
    current.job = toPosting(current, nowIso(now));
    const deterministic = runDiscoveryHardFilters({
      job: current.job,
      profile: rules,
      duplicateStatus: "UNIQUE",
      now,
    });
    const triage = triageJob({
      job: current.job,
      rules,
      profile,
      policy,
      deterministic,
    });
    current.triageBucket = triage.bucket;
    current.triageReasons = triage.reasons;
    current.stage = "TRIAGED";

    if (opts.hydrate !== false && triage.bucket === "DEEP_REVIEW") {
      const hydrated = await hydrateCluster(current, opts.providers, discoveryPolicy.hydrate_min_chars);
      if (hydrated.called) hydrateCalls += 1;
      current = hydrated.cluster;
      if (hydrated.called && current.description) {
        current.job = toPosting(current, nowIso(now));
        const again = runDiscoveryHardFilters({
          job: current.job,
          profile: rules,
          duplicateStatus: "UNIQUE",
          now,
        });
        const retried = triageJob({ job: current.job, rules, profile, policy, deterministic: again });
        current.triageBucket = retried.bucket;
        current.triageReasons = retried.reasons;
      }
    }

    if (current.triageBucket === "HARD_REJECT") {
      hardReject += 1;
      current.terminalReason = current.triageReasons.join(" ");
    } else if (current.triageBucket === "LOW_PRIORITY_ARCHIVE") {
      lowPriorityArchive += 1;
      current.terminalReason = current.triageReasons.join(" ");
    } else if (current.triageBucket === "HUMAN_REVIEW") {
      humanReview += 1;
    } else if (current.triageBucket === "DEEP_REVIEW") {
      deepReview += 1;
      current.stage = "DEEP_REVIEW";
      if (opts.ingestDeepReview) {
        const existing = await getCanonicalJob(current.clusterId);
        if (!existing) {
          const jevProfile = await getProfile();
          const posting = current.job;
          if (jevProfile && posting) {
            ingestCalls += 1;
            const ingested = await ingestCanonical({
              rawText: posting.descriptionRaw,
              url: posting.sourceUrl,
              sourceType: "job_posting",
              profile: jevProfile,
              existingId: current.clusterId,
            });
            current.opportunityId = ingested.opportunityId;
            current.jevRan = ingested.evaluation.triage === "DEEP_REVIEW" && Boolean(ingested.evaluation.jevModelVersion);
            if (current.jevRan) jevCalls += 1;
            if (ingested.evaluation.finalDecision === "APPLY_CANDIDATE") {
              current.stage = "SHORTLIST";
              shortlist += 1;
            }
            current.triageReasons = ingested.evaluation.explanationReasons;
          }
        } else {
          current.opportunityId = existing.id;
        }
      }
    }
    completed.push(current);
  }

  const liveDiscovery = opts.live ? "RUN" : "NOT_RUN";
  const status: DiscoveryRunResult["status"] =
    completed.length === 0 && providerErrors.length ? "partial" : completed.length === 0 ? "empty" : providerErrors.length ? "partial" : "ok";

  return {
    runId: randomUUID(),
    live: opts.live,
    usedFixture: opts.usedFixture,
    status,
    configVersion: discoveryPolicy.config_version,
    candidateProfileVersion: profile.schema_version,
    decisionPolicyVersion: policy.policy_version,
    queries,
    providerIds: opts.providers.map((p) => p.id),
    providerErrors,
    clusters: completed,
    expensive: { hydrateCalls, jevCalls, ingestCalls },
    counts: {
      discovered: rawItems.length,
      normalized: normalized.length,
      stale,
      cheapFiltered,
      clusters: completed.length,
      triaged: completed.length,
      deepReview,
      shortlist,
      hardReject,
      lowPriorityArchive,
      humanReview,
    },
    liveDiscovery,
  };
}
