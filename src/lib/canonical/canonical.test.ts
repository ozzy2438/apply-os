import { describe, expect, it } from "vitest";
import { normalizeJobPosting } from "@/lib/ingest/normalize";
import { runHardFilters } from "@/lib/policy/hard-filters";
import { applyPostJevPolicy } from "@/lib/policy/compose";
import { deriveCommercialEvidence } from "./commercial";
import { loadCanonicalBundle, loadCanonicalProfile } from "./load";
import { validateCandidateProfileIntegrity } from "./validate";
import { mapCanonicalToRules } from "./map";
import { retrieveRelevantEvidence } from "./retrieve";
import { scanClaimSafety, isApplicationExcludedProject } from "./claims";
import { evaluateCanonicalJob } from "./evaluate";
import { extractJobRequirements, matchRequirementsToEvidence } from "./requirements";

function job(raw: string, id = "j1") {
  return normalizeJobPosting({ id, rawText: raw, sourceType: "job_posting" });
}

const cleanDeterministic = {
  isRecent: true,
  locationCompatible: true,
  workplaceCompatible: true,
  salaryCompatible: null as boolean | null,
  workAuthorizationCompatible: true,
  employmentTypeCompatible: true,
  roleNotExcluded: true,
  duplicateStatus: "UNIQUE" as const,
  closedOrExpired: false,
  redFlagHit: false,
  hardBlockers: [] as string[],
};

describe("canonical profile 1.1.0", () => {
  const profile = loadCanonicalProfile();
  const { schema, policy } = loadCanonicalBundle();

  it("1. profile schema validation passes", () => {
    const result = validateCandidateProfileIntegrity(profile);
    expect(result).toEqual({ ok: true });
    expect(profile.schema_version).toBe("1.1.0");
    expect(schema.$schema).toContain("json-schema");
    expect((schema.$defs as { evidence_record: { required: string[] } }).evidence_record.required).toContain("subject");
    expect(policy.policy_version).toBe("1.1.0");
  });

  it("2-5. 64 projects, 169 evidence, unique ids, no broken refs", () => {
    expect(profile.projects).toHaveLength(64);
    expect(profile.evidence).toHaveLength(169);
    expect(new Set(profile.projects.map((p) => p.project_id)).size).toBe(64);
    expect(new Set(profile.skills.map((s) => s.skill_id)).size).toBe(profile.skills.length);
    expect(new Set(profile.evidence.map((e) => e.evidence_id)).size).toBe(169);
    expect(profile.evidence.every((e) => e.subject.type === "project" && e.subject.id.startsWith("P"))).toBe(true);
    expect(validateCandidateProfileIntegrity(profile).ok).toBe(true);
  });

  it("6. commercial_evidence derivation", () => {
    expect(deriveCommercialEvidence(["contract", "independent"])).toBe(true);
    expect(deriveCommercialEvidence(["independent", "portfolio"])).toBe(false);
    expect(deriveCommercialEvidence(["unknown", "independent"])).toBe("unknown");
    const byId = new Map(profile.projects.map((p) => [p.project_id, p]));
    for (const skill of profile.skills) {
      const types = skill.project_ids.map((id) => byId.get(id)?.engagement_type).filter(Boolean) as string[];
      expect(skill.commercial_evidence).toBe(deriveCommercialEvidence(types));
    }
    const mlflow = profile.skills.find((s) => s.skill_id === "SK-mlflow");
    const duck = profile.skills.find((s) => s.skill_id === "SK-duckdb");
    expect(mlflow?.commercial_evidence).toBe("unknown");
    expect(duck?.commercial_evidence).toBe(true);
  });

  it("7. missing salary does not auto-reject", async () => {
    const posting = job(`Title: Data Scientist
Company: Mystery
Location: Melbourne hybrid
Right to work in Australia.`);
    const rules = mapCanonicalToRules(profile);
    const deterministic = runHardFilters({ job: posting, profile: rules, duplicateStatus: "UNIQUE" });
    expect(deterministic.salaryCompatible).toBeNull();
    expect(deterministic.hardBlockers.some((b) => /pay/i.test(b))).toBe(false);
    const result = await evaluateCanonicalJob({ job: posting, rules, deterministic });
    expect(result.evaluation.finalDecision).not.toBe("SKIP");
    expect(result.triage.bucket).toBe("DEEP_REVIEW");
  });

  it("8. soft negative does not auto-reject", async () => {
    const posting = job(`Title: Data Scientist
Company: River
Location: Melbourne
Salary: AUD $140,000
Primary language is R. Dashboard-heavy reporting.`);
    const rules = mapCanonicalToRules(profile);
    const deterministic = runHardFilters({ job: posting, profile: rules, duplicateStatus: "UNIQUE" });
    const result = await evaluateCanonicalJob({ job: posting, rules, deterministic });
    expect(result.triage.bucket).not.toBe("HARD_REJECT");
    expect(result.evaluation.deterministicResults.hardBlockers).toEqual([]);
  });

  it("9. exact-title years requirement normally routes to review", async () => {
    const posting = job(`Title: Data Architect
Company: Civic
Location: Melbourne
Salary: AUD $160,000
Minimum 10 years as a Data Architect.`);
    const rules = mapCanonicalToRules(profile);
    const deterministic = runHardFilters({ job: posting, profile: rules, duplicateStatus: "UNIQUE" });
    const result = await evaluateCanonicalJob({ job: posting, rules, deterministic });
    expect(result.triage.bucket).toBe("HUMAN_REVIEW");
    expect(result.deepReviewRan).toBe(false);
    expect(result.evaluation.finalDecision).toBe("REVIEW_REQUIRED");
  });

  it("10. hard regulatory requirement can reject", async () => {
    const posting = job(`Title: Licensed Conveyancer
Company: Registry
Location: Melbourne
This role is a non-negotiable regulatory requirement: you must hold a current licence
and at least 8 years as a Licensed Conveyancer. Adjacent experience cannot be substituted.`);
    const rules = mapCanonicalToRules(profile);
    const deterministic = runHardFilters({ job: posting, profile: rules, duplicateStatus: "UNIQUE" });
    const result = await evaluateCanonicalJob({ job: posting, rules, deterministic });
    expect(result.triage.bucket).toBe("HARD_REJECT");
    expect(result.evaluation.finalDecision).toBe("SKIP");
    expect(result.deepReviewRan).toBe(false);
  });

  it("11. P02 cannot enter generated application evidence", () => {
    expect(isApplicationExcludedProject("P02")).toBe(true);
    const posting = job(`Title: Healthcare Data Scientist
Company: Clinic
Location: Melbourne
Hospital capacity forecasting, AUC-ROC, overtime reduction.`);
    const retrieved = retrieveRelevantEvidence(posting, profile);
    expect(retrieved.projects.every((p) => p.project_id !== "P02")).toBe(true);
    expect(retrieved.evidence.every((e) => e.subject.id !== "P02")).toBe(true);
    const blockers = scanClaimSafety("We delivered AUC-ROC 1.0000 and 99.94% recall on hospital capacity (P02).");
    expect(blockers.join(" ")).toMatch(/P02/i);
  });

  it("12. independent project cannot be presented as client work", () => {
    const blockers = scanClaimSafety(
      "EquityLens was delivered to a client as a commissioned paid client engagement.",
      profile,
    );
    expect(blockers.join(" ")).toMatch(/independent|client/i);
  });

  it("13. simulated/modelled result retains its qualifier", () => {
    const qualified = profile.claim_policy.qualified_claims.find((q) => /revenue/i.test(q.claim));
    expect(qualified?.required_qualification).toMatch(/modelled|simulated/i);
    const blockers = scanClaimSafety("We generated realised revenue of A$156M in live client impact.");
    expect(blockers.join(" ")).toMatch(/qualifier|simulated|modelled/i);
  });

  it("14. unchanged job/profile can reuse cached evaluation", async () => {
    const posting = job(`Title: Data Scientist
Company: CacheCo
Location: Melbourne
Salary: AUD $140,000
Python SQL forecasting.`, "cache-1");
    const rules = mapCanonicalToRules(profile);
    const deterministic = runHardFilters({ job: posting, profile: rules, duplicateStatus: "UNIQUE" });
    const first = await evaluateCanonicalJob({ job: posting, rules, deterministic });
    expect(first.reusedCache).toBe(false);
    const second = await evaluateCanonicalJob({
      job: posting,
      rules,
      deterministic,
      previous: first.evaluation,
    });
    expect(second.reusedCache).toBe(true);
    expect(second.deepReviewRan).toBe(false);
    expect(second.evaluation.id).toBe(first.evaluation.id);
  });

  it("15. low-relevance bulk discovery item does not trigger deep review", async () => {
    const posting = job(`Title: Retail Store Manager
Company: BigBox
Location: Melbourne
Weekend shifts. Stock and rostering. No data or AI work.`);
    const rules = mapCanonicalToRules(profile);
    const deterministic = runHardFilters({ job: posting, profile: rules, duplicateStatus: "UNIQUE" });
    const result = await evaluateCanonicalJob({ job: posting, rules, deterministic });
    expect(result.triage.bucket).toBe("LOW_PRIORITY_ARCHIVE");
    expect(result.deepReviewRan).toBe(false);
    expect(result.evaluation.finalDecision).toBe("SKIP");
  });

  it("requirement matching is per-requirement, not one CV score", () => {
    const posting = job(`Title: AI Engineer
Company: Guard
Location: Melbourne
Must have Python.
Nice to have Kubernetes.`);
    const requirements = extractJobRequirements(posting);
    expect(requirements.some((r) => r.importance === "MUST")).toBe(true);
    const retrieved = retrieveRelevantEvidence(posting, profile);
    const matches = matchRequirementsToEvidence({
      requirements,
      evidence: retrieved.evidence,
      projects: retrieved.projects,
      profile,
    });
    expect(matches).toHaveLength(requirements.length);
    expect(new Set(matches.map((m) => m.requirementId)).size).toBe(matches.length);
  });

  it("post-Jev policy does not treat missing salary as a hard fail", () => {
    const result = applyPostJevPolicy({
      deterministic: cleanDeterministic,
      decision: {
        roleFit: { score: 0.8, confidence: 0.9, probabilities: {} },
        skillsFit: { score: 0.8, confidence: 0.9, probabilities: {} },
        seniorityFit: { score: 0.8, confidence: 0.9, probabilities: {} },
        strategicValue: { score: 0.8, confidence: 0.9, probabilities: {} },
        missingInformation: { value: true, probability: 0.5 },
        redFlag: { value: false, probability: 0.1 },
        recommendation: { choice: "APPLY_CANDIDATE", confidence: 0.88 },
      },
      evidenceReady: true,
    });
    expect(result.finalDecision).toBe("REVIEW_REQUIRED");
  });
});
