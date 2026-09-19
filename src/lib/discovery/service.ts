import { insertAudit } from "@/lib/db/store-extended";
import { ensureTodayBriefing } from "@/lib/briefing-service";
import { POLICY_VERSION } from "@/lib/policy/version";
import { isDemoMode } from "@/lib/jev/client";
import { DISCOVERY_CAPABILITIES } from "./types";
import { discoveryEnabled } from "./flags";
import { runDiscoveryFunnel } from "./funnel";
import { saveDiscoveryRun } from "./persist";
import { providersForRun } from "./providers/registry";
import { buildSearchQueries } from "./queries";
import type { DiscoveryProvider, DiscoveryRunResult } from "./types";

export { DISCOVERY_CAPABILITIES };

export async function runProviderDiscovery(input?: {
  providers?: DiscoveryProvider[];
  freshnessDays?: number;
  now?: Date;
  hydrate?: boolean;
  ingestDeepReview?: boolean;
  persist?: boolean;
  refreshDesk?: boolean;
}): Promise<DiscoveryRunResult> {
  if (!discoveryEnabled()) {
    return {
      runId: "disabled",
      live: false,
      usedFixture: false,
      status: "disabled",
      configVersion: "1.0.0",
      candidateProfileVersion: "",
      decisionPolicyVersion: "",
      queries: [],
      providerIds: [],
      providerErrors: [],
      clusters: [],
      expensive: { hydrateCalls: 0, jevCalls: 0, ingestCalls: 0 },
      counts: {
        discovered: 0,
        normalized: 0,
        stale: 0,
        cheapFiltered: 0,
        clusters: 0,
        triaged: 0,
        deepReview: 0,
        shortlist: 0,
        hardReject: 0,
        lowPriorityArchive: 0,
        humanReview: 0,
      },
      liveDiscovery: "NOT_RUN",
    };
  }

  const selected = providersForRun(input?.providers);
  const queries = buildSearchQueries({ freshnessDays: input?.freshnessDays });
  const result = await runDiscoveryFunnel({
    providers: selected.providers,
    queries,
    now: input?.now,
    live: selected.live,
    usedFixture: selected.usedFixture,
    hydrate: input?.hydrate,
    ingestDeepReview: input?.ingestDeepReview !== false,
    persist: input?.persist !== false,
  });

  if (input?.persist !== false && result.runId !== "disabled") {
    await saveDiscoveryRun(result);
    await insertAudit({
      userId: "default",
      jobId: null,
      eventType: "DISCOVERY_RUN",
      profileVersion: null,
      policyVersion: POLICY_VERSION,
      modelProvider: isDemoMode() || !result.live ? "DEMO" : "JEV",
      modelVersion: result.configVersion,
      inputHash: result.runId,
      observationVersion: null,
      decisionSummary: {
        live: result.live,
        usedFixture: result.usedFixture,
        liveDiscovery: result.liveDiscovery,
        counts: result.counts,
        providerIds: result.providerIds,
        capabilities: DISCOVERY_CAPABILITIES,
      },
      policyResult: {
        queries: result.queries.map((q) => q.id),
        candidateProfileVersion: result.candidateProfileVersion,
        decisionPolicyVersion: result.decisionPolicyVersion,
      },
      executionResult: { providerErrors: result.providerErrors, expensive: result.expensive },
    });
    for (const cluster of result.clusters) {
      await insertAudit({
        userId: "default",
        jobId: cluster.opportunityId,
        eventType: "DISCOVERY_ITEM_TRIAGED",
        profileVersion: null,
        policyVersion: POLICY_VERSION,
        modelProvider: result.live ? "JEV" : "DEMO",
        modelVersion: result.configVersion,
        inputHash: cluster.contentHash,
        observationVersion: null,
        decisionSummary: {
          clusterId: cluster.clusterId,
          stage: cluster.stage,
          triage: cluster.triageBucket,
          live: cluster.live,
          providers: cluster.providers,
          sourceUrls: cluster.sourceUrls,
        },
        policyResult: { reasons: cluster.triageReasons },
        executionResult: { hydrated: cluster.hydrated, jevRan: cluster.jevRan },
      });
      if (cluster.hydrated) {
        await insertAudit({
          userId: "default",
          jobId: cluster.opportunityId,
          eventType: "DISCOVERY_HYDRATED",
          profileVersion: null,
          policyVersion: POLICY_VERSION,
          modelProvider: result.live ? "JEV" : "DEMO",
          modelVersion: "playwright",
          inputHash: cluster.contentHash,
          observationVersion: null,
          decisionSummary: { clusterId: cluster.clusterId, url: cluster.canonicalUrl },
          policyResult: {},
          executionResult: { hydrateAttempted: cluster.hydrateAttempted },
        });
      }
    }
  }

  if (input?.refreshDesk !== false && result.counts.shortlist > 0) {
    await ensureTodayBriefing(true);
  }

  return result;
}
