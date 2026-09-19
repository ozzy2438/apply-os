import type { EmploymentType, TriageBucket, WorkplaceType } from "@/lib/domain/enums";
import type { JobPosting } from "@/lib/domain/schemas";

export const FUNNEL_STAGES = [
  "DISCOVERED",
  "NORMALIZED",
  "DEDUPED",
  "TRIAGED",
  "DEEP_REVIEW",
  "SHORTLIST",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const DISCOVERY_CAPABILITIES = {
  automaticApplication: false,
  outboundMessage: false,
  resumeUpload: false,
  autonomousApplicant: false,
} as const;

export type SearchQuery = {
  id: string;
  roleFamilyId: string;
  roleFamily: string;
  titles: string[];
  avoidTitles: string[];
  locations: string[];
  workModes: string[];
  freshnessDays: number;
  includeAustraliaRemote: boolean;
  text: string;
  configVersion: string;
  limit: number;
};

export type SourceProvenance = {
  providerId: string;
  sourceUrl: string;
  canonicalUrl: string | null;
  externalId: string | null;
  discoveredAt: string;
  queryId: string | null;
};

export type RawDiscoveryItem = {
  providerId: string;
  live: boolean;
  url: string;
  title: string | null;
  company: string | null;
  location: string | null;
  snippet: string | null;
  publishedAt: string | null;
  author: string | null;
  externalId: string | null;
  raw: Record<string, unknown>;
};

export type RawJobDocument = RawDiscoveryItem & {
  description: string | null;
  hydrated: boolean;
  hydrateProviderId?: string;
};

export type DiscoveryBatch = {
  providerId: string;
  live: boolean;
  items: RawDiscoveryItem[];
  nextCursor: string | null;
  error?: string;
};

export type NormalizedDiscoveryJob = {
  providerId: string;
  live: boolean;
  sourceUrl: string;
  canonicalUrl: string | null;
  externalId: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  workMode: WorkplaceType | null;
  employmentType: EmploymentType | null;
  salaryText: string | null;
  postedAt: string | null;
  discoveredAt: string;
  snippet: string | null;
  description: string | null;
  hydrated: boolean;
  contentHash: string;
  provenance: SourceProvenance[];
  queryId: string | null;
};

export type DiscoveryProvider = {
  id: string;
  discover(query: SearchQuery, cursor?: string): Promise<DiscoveryBatch>;
  hydrate?(item: RawDiscoveryItem): Promise<RawJobDocument>;
};

export type DiscoveryCluster = {
  clusterId: string;
  stage: FunnelStage;
  live: boolean;
  title: string | null;
  company: string | null;
  location: string | null;
  canonicalUrl: string | null;
  sourceUrls: string[];
  providers: string[];
  contentHash: string;
  postedAt: string | null;
  discoveredAt: string;
  snippet: string | null;
  description: string | null;
  hydrated: boolean;
  hydrateAttempted: boolean;
  triageBucket: TriageBucket | null;
  triageReasons: string[];
  opportunityId: string | null;
  jevRan: boolean;
  terminalReason: string | null;
  members: NormalizedDiscoveryJob[];
  job: JobPosting | null;
};

export type DiscoveryRunResult = {
  runId: string;
  live: boolean;
  usedFixture: boolean;
  status: "ok" | "partial" | "empty" | "disabled";
  configVersion: string;
  candidateProfileVersion: string;
  decisionPolicyVersion: string;
  queries: SearchQuery[];
  providerIds: string[];
  providerErrors: Array<{ providerId: string; error: string }>;
  clusters: DiscoveryCluster[];
  expensive: {
    hydrateCalls: number;
    jevCalls: number;
    ingestCalls: number;
  };
  counts: {
    discovered: number;
    normalized: number;
    stale: number;
    cheapFiltered: number;
    clusters: number;
    triaged: number;
    deepReview: number;
    shortlist: number;
    hardReject: number;
    lowPriorityArchive: number;
    humanReview: number;
  };
  liveDiscovery: "RUN" | "NOT_RUN";
};

export type DiscoveryPolicyDoc = {
  config_version: string;
  freshness_days: number;
  hydrate_min_chars: number;
  max_results_per_query: number;
  include_australia_remote: boolean;
  cheap_filter: {
    drop_unusable: boolean;
    avoid_title_drop: boolean;
  };
  providers: {
    exa: { enabled: boolean; role: string };
    feeds: { enabled: boolean; role: string };
    playwright_hydrate: { enabled: boolean; role: string };
    apify: { enabled: boolean; role: string };
  };
};
