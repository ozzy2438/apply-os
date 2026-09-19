import { afterEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { resetDriverForTests, sqliteDriver } from "@/lib/db/driver";
import { saveProfile, getBriefing } from "@/lib/db/store";
import { replaceEvidence, saveCandidateRules, listCanonicalJobs, latestJobEvaluationV2 } from "@/lib/db/store-extended";
import { DEFAULT_CANDIDATE_PROFILE } from "@/lib/domain/defaults";
import { evidenceFromBullets } from "@/lib/policy/evidence";
import { SAMPLE_BULLETS, SAMPLE_CONSTRAINTS, SAMPLE_GOALS, SAMPLE_WEIGHTS } from "@/lib/seed/fixtures";
import { briefingDate } from "@/lib/jev/briefing";
import { loadCanonicalProfile } from "@/lib/canonical/load";
import { retrieveRelevantEvidence } from "@/lib/canonical/retrieve";
import { isApplicationExcludedProject } from "@/lib/canonical/claims";
import { buildResumeContext } from "@/lib/resume/context";
import { makePlan } from "@/lib/resume/planner";
import { loadResumePolicy } from "@/lib/resume/policy";
import { canonicalizeUrl, normalizeExaResult, normalizeDiscoveryItem } from "./normalize";
import { withinFreshnessWindow } from "./freshness";
import { runDiscoveryFunnel } from "./funnel";
import { runProviderDiscovery, DISCOVERY_CAPABILITIES } from "./service";
import { createFailingProvider, createFixtureProvider } from "./providers/fixture";
import { createApifyProvider } from "./providers/apify";
import { APIFY_NOT_ENABLED } from "./providers/contract";
import { buildSearchQueries } from "./queries";
import { deskDiscoveryFacts } from "./desk";
import type { DiscoveryProvider } from "./types";

const NOW = new Date("2026-09-19T09:00:00.000Z");

async function seedDb() {
  const file = path.join(os.tmpdir(), `apply-os-disc-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  resetDriverForTests(sqliteDriver(file));
  const profile = await saveProfile({
    goals: SAMPLE_GOALS,
    constraints: SAMPLE_CONSTRAINTS,
    weights: SAMPLE_WEIGHTS,
    bullets: SAMPLE_BULLETS,
  });
  await saveCandidateRules(DEFAULT_CANDIDATE_PROFILE);
  await replaceEvidence(evidenceFromBullets(SAMPLE_BULLETS));
  return profile;
}

function fakeHydrator(calls: string[]): DiscoveryProvider {
  return {
    id: "playwright",
    async discover() {
      return { providerId: "playwright", live: false, items: [], nextCursor: null };
    },
    async hydrate(item) {
      calls.push(item.url);
      return {
        ...item,
        description:
          "Hydrated full posting. Python SQL forecasting for an Australian team. Right to work in Australia. ".repeat(8),
        hydrated: true,
        hydrateProviderId: "playwright",
      };
    },
  };
}

describe("discovery layer", () => {
  afterEach(() => {
    resetDriverForTests(undefined);
  });

  it("1. Exa results normalize without inventing missing fields", () => {
    const hit = {
      title: "Data Scientist - Horizon Retail AU",
      url: "https://careers.horizonretail.example/jobs/ds-forecast?utm_source=exa",
      publishedDate: "2026-09-17T00:00:00.000Z",
      author: "Horizon Retail AU",
      highlights: ["Melbourne hybrid Python SQL"],
    };
    const raw = normalizeExaResult(hit, true);
    expect(raw).toBeTruthy();
    const job = normalizeDiscoveryItem(raw!, null, NOW.toISOString());
    expect(job.providerId).toBe("exa");
    expect(job.live).toBe(true);
    expect(job.canonicalUrl).toBe("https://careers.horizonretail.example/jobs/ds-forecast");
    expect(job.title).toBe("Data Scientist - Horizon Retail AU");
    expect(job.company).toBe("Horizon Retail AU");
    expect(job.salaryText).toBeNull();
    expect(job.location).toBeNull();
    expect(job.postedAt).toBe("2026-09-17T00:00:00.000Z");
    expect(job.provenance[0]?.sourceUrl).toContain("utm_source=exa");
  });

  it("2. duplicate job from two providers becomes one opportunity", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    const horizon = result.clusters.filter((c) => c.company === "Horizon Retail AU");
    expect(horizon).toHaveLength(1);
    expect(horizon[0]!.sourceUrls).toEqual(
      expect.arrayContaining([
        "https://careers.horizonretail.example/jobs/ds-forecast?utm_source=exa",
        "https://www.seek.com.au/job/8881111",
      ]),
    );
    expect(horizon[0]!.providers.sort()).toEqual(["exa", "feeds"]);
  });

  it("3. different legitimate jobs are not incorrectly merged", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    const companies = result.clusters.map((c) => c.company);
    expect(companies).toContain("Horizon Retail AU");
    expect(companies).toContain("Harbor Labs");
    expect(companies).toContain("Ledger & Grain");
    expect(result.clusters.filter((c) => c.company === "Horizon Retail AU")).toHaveLength(1);
  });

  it("4. old jobs outside freshness window are filtered", async () => {
    expect(withinFreshnessWindow("2026-08-01T00:00:00.000Z", 7, NOW)).toBe(false);
    expect(withinFreshnessWindow("2026-09-17T00:00:00.000Z", 7, NOW)).toBe(true);
    expect(withinFreshnessWindow(null, 7, NOW)).toBe(true);
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    expect(result.counts.stale).toBeGreaterThanOrEqual(1);
    expect(result.clusters.some((c) => c.company === "Old Co")).toBe(false);
  });

  it("5. irrelevant role can reach LOW_PRIORITY_ARCHIVE without Jev", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    const warehouse = result.clusters.find((c) => c.title === "Warehouse Operator");
    expect(warehouse?.triageBucket).toBe("LOW_PRIORITY_ARCHIVE");
    expect(warehouse?.jevRan).toBe(false);
    expect(result.expensive.jevCalls).toBe(0);
    expect(result.expensive.ingestCalls).toBe(0);
  });

  it("6. plausible role reaches DEEP_REVIEW", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    const ds = result.clusters.find((c) => c.company === "Horizon Retail AU");
    expect(ds?.triageBucket).toBe("DEEP_REVIEW");
    expect(ds?.stage).toBe("DEEP_REVIEW");
  });

  it("7. only deep-review jobs trigger expensive hydration/Jev", async () => {
    await seedDb();
    const hydrateCalls: string[] = [];
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider(), fakeHydrator(hydrateCalls)],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: true,
      ingestDeepReview: true,
    });
    const warehouse = result.clusters.find((c) => c.title === "Warehouse Operator");
    expect(warehouse?.triageBucket).toBe("LOW_PRIORITY_ARCHIVE");
    expect(warehouse?.jevRan).toBe(false);
    expect(hydrateCalls.every((url) => !url.includes("warehouse"))).toBe(true);
    const thin = result.clusters.find((c) => c.company === "Thinboard");
    expect(thin?.triageBucket).toBe("DEEP_REVIEW");
    expect(thin?.hydrateAttempted).toBe(true);
    expect(hydrateCalls.some((url) => url.includes("thinboard") || url.includes("441122"))).toBe(true);
    expect(result.expensive.ingestCalls).toBeGreaterThan(0);
    expect(result.clusters.filter((c) => c.triageBucket !== "DEEP_REVIEW").every((c) => !c.jevRan)).toBe(true);
  });

  it("8. missing salary does not reject", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    const mystery = result.clusters.find((c) => c.company === "Mystery Pay");
    expect(mystery?.triageBucket).toBe("DEEP_REVIEW");
    expect(mystery?.triageBucket).not.toBe("HARD_REJECT");
  });

  it("9. soft preference does not reject", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    const sydney = result.clusters.find((c) => c.company === "Remote North");
    expect(sydney?.triageBucket).not.toBe("HARD_REJECT");
    expect(["DEEP_REVIEW", "HUMAN_REVIEW", "LOW_PRIORITY_ARCHIVE"]).toContain(sydney?.triageBucket);
  });

  it("9b. discovery ingest keeps a soft location preference out of HARD_REJECT", async () => {
    await seedDb();
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: true,
    });
    const sydney = result.clusters.find((c) => c.company === "Remote North");
    expect(sydney?.opportunityId).toBeTruthy();
    const evaluation = await latestJobEvaluationV2(sydney!.opportunityId!);
    expect(evaluation?.triage).not.toBe("HARD_REJECT");
    expect(evaluation?.deterministicResults.hardBlockers.some((b) => /location/i.test(b))).toBe(false);
  });

  it("10. provider failure does not corrupt the pipeline", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFailingProvider(), createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    expect(result.providerErrors.some((e) => e.error.includes("PROVIDER_UNAVAILABLE"))).toBe(true);
    expect(result.clusters.length).toBeGreaterThan(0);
    expect(result.status).toBe("partial");
  });

  it("11. mock results are never shown as live", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    expect(result.live).toBe(false);
    expect(result.liveDiscovery).toBe("NOT_RUN");
    expect(result.clusters.every((c) => c.live === false)).toBe(true);
    const facts = deskDiscoveryFacts(
      {
        id: "x",
        runId: result.runId,
        clusterId: "c",
        opportunityId: null,
        stage: "TRIAGED",
        triageBucket: "DEEP_REVIEW",
        providerId: "fixture",
        live: false,
        title: "Data Scientist",
        company: "Mock Co",
        location: "Melbourne",
        canonicalUrl: null,
        sourceUrls: ["https://example.test/job"],
        contentHash: "h",
        normalized: {},
        provenance: [],
        createdAt: NOW.toISOString(),
      },
      null,
      NOW,
    );
    expect(facts?.mock).toBe(true);
    expect(facts?.live).toBe(false);
    expect(facts?.why.some((w) => /MOCK/.test(w))).toBe(true);
  });

  it("12. discovery retains source provenance", async () => {
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: false,
    });
    const horizon = result.clusters.find((c) => c.company === "Horizon Retail AU")!;
    expect(horizon.sourceUrls.length).toBeGreaterThanOrEqual(2);
    expect(horizon.members.flatMap((m) => m.provenance).length).toBeGreaterThanOrEqual(2);
    expect(canonicalizeUrl(horizon.sourceUrls[0]!)).toBeTruthy();
  });

  it("13. P02 remains excluded downstream", async () => {
    await seedDb();
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: true,
    });
    const ingested = result.clusters.find((c) => c.opportunityId && c.triageBucket === "DEEP_REVIEW");
    expect(ingested?.opportunityId).toBeTruthy();
    const jobs = await listCanonicalJobs();
    const job = jobs.find((j) => j.id === ingested!.opportunityId)!;
    const retrieved = retrieveRelevantEvidence(job, loadCanonicalProfile());
    expect(retrieved.projects.some((p) => isApplicationExcludedProject(p.project_id))).toBe(false);
    expect(retrieved.evidence.some((e) => e.subject.id === "P02")).toBe(false);
  });

  it("14. Resume Studio still works from a discovered opportunity", async () => {
    await seedDb();
    const result = await runDiscoveryFunnel({
      providers: [createFixtureProvider()],
      now: NOW,
      live: false,
      usedFixture: true,
      hydrate: false,
      ingestDeepReview: true,
    });
    const ingested = result.clusters.find((c) => c.company === "Horizon Retail AU" && c.opportunityId);
    expect(ingested?.opportunityId).toBeTruthy();
    const jobs = await listCanonicalJobs();
    const job = jobs.find((j) => j.id === ingested!.opportunityId)!;
    const { context, roleFamilyId } = buildResumeContext({ job });
    expect(context.claims.some((c) => c.subject.id === "P02" && c.approval.status === "approved")).toBe(false);
    const { policy } = loadResumePolicy(roleFamilyId);
    const plan = makePlan(context, policy);
    expect(plan.entryIds).not.toContain("P02");
  });

  it("15. no discovery path can auto-apply or send a message", async () => {
    expect(DISCOVERY_CAPABILITIES.automaticApplication).toBe(false);
    expect(DISCOVERY_CAPABILITIES.outboundMessage).toBe(false);
    expect(DISCOVERY_CAPABILITIES.resumeUpload).toBe(false);
    expect(DISCOVERY_CAPABILITIES.autonomousApplicant).toBe(false);
    const src = [
      readFileSync(path.join(process.cwd(), "src/lib/discovery/service.ts"), "utf8"),
      readFileSync(path.join(process.cwd(), "src/lib/discovery/funnel.ts"), "utf8"),
      readFileSync(path.join(process.cwd(), "src/lib/discovery/providers/playwright.ts"), "utf8"),
    ].join("\n");
    expect(src).not.toMatch(/auto-?apply|submitApplication|sendMessage\(|uploadResume/i);
    await expect(createApifyProvider().discover(buildSearchQueries()[0]!)).rejects.toThrow(APIFY_NOT_ENABLED);
  });

  it("search queries come from enabled families, not a hardcoded career profile", () => {
    const queries = buildSearchQueries();
    expect(queries.map((q) => q.roleFamilyId).sort()).toEqual(
      ["ai_engineering", "data_engineering_cloud", "data_science", "mlops_engineering"].sort(),
    );
    const blob = JSON.stringify(queries);
    expect(blob).not.toMatch(/Osmman|Ozzy|Craigieburn/i);
    expect(queries.every((q) => q.freshnessDays === 7)).toBe(true);
    expect(queries.every((q) => q.includeAustraliaRemote)).toBe(true);
  });

  it("runProviderDiscovery persists MOCK runs and refreshes Morning Desk", async () => {
    await seedDb();
    const hydrateCalls: string[] = [];
    const result = await runProviderDiscovery({
      providers: [createFixtureProvider(), fakeHydrator(hydrateCalls)],
      now: NOW,
      hydrate: true,
      ingestDeepReview: true,
      persist: true,
      refreshDesk: true,
    });
    expect(result.liveDiscovery).toBe("NOT_RUN");
    expect(result.usedFixture).toBe(true);
    const briefing = await getBriefing(briefingDate(NOW));
    expect(briefing?.opportunityIds.length ?? 0).toBeLessThanOrEqual(5);
  });
});
