import { randomUUID } from "node:crypto";
import type { CandidateProfile, DeterministicResults, JobEvaluation, JobPosting, StructuredJobDecision } from "@/lib/domain/schemas";
import { sha256 } from "@/lib/domain/hash";
import { buildEvaluation } from "@/lib/policy/compose";
import { POLICY_VERSION } from "@/lib/policy/version";
import { getDecisionProvider } from "@/lib/providers/factory";
import { loadCanonicalBundle } from "./load";
import { canonicalEvidenceToRows, mapCanonicalToRules } from "./map";
import { retrieveRelevantEvidence } from "./retrieve";
import { evidenceCoverage, extractJobRequirements, matchRequirementsToEvidence } from "./requirements";
import { EVALUATION_SCHEMA_VERSION, PROFILE_VERSION_NUMBER, type EvidenceMatch, type JobRequirement, type TriageBucket } from "./types";
import { triageJob, type TriageResult } from "@/lib/policy/triage";

export function jobInputHash(job: JobPosting): string {
  return sha256(`${job.title}|${job.company ?? ""}|${job.descriptionRaw}`).slice(0, 32);
}

function scored(score: number, confidence: number): StructuredJobDecision["roleFit"] {
  return { score, confidence, probabilities: { "0": score < 0.3 ? 1 : 0, "4": score >= 0.7 ? 1 : 0 } };
}

function syntheticDecision(triage: TriageBucket): StructuredJobDecision {
  if (triage === "HARD_REJECT") {
    return {
      roleFit: scored(0.1, 0.9),
      skillsFit: scored(0.1, 0.9),
      seniorityFit: scored(0.1, 0.9),
      strategicValue: scored(0.1, 0.9),
      missingInformation: { value: false, probability: 0.1 },
      redFlag: { value: true, probability: 0.9 },
      recommendation: { choice: "SKIP", confidence: 0.92 },
    };
  }
  if (triage === "LOW_PRIORITY_ARCHIVE") {
    return {
      roleFit: scored(0.15, 0.86),
      skillsFit: scored(0.15, 0.86),
      seniorityFit: scored(0.4, 0.7),
      strategicValue: scored(0.1, 0.8),
      missingInformation: { value: false, probability: 0.2 },
      redFlag: { value: false, probability: 0.15 },
      recommendation: { choice: "SKIP", confidence: 0.84 },
    };
  }
  return {
    roleFit: scored(0.55, 0.6),
    skillsFit: scored(0.5, 0.6),
    seniorityFit: scored(0.55, 0.6),
    strategicValue: scored(0.5, 0.6),
    missingInformation: { value: true, probability: 0.62 },
    redFlag: { value: false, probability: 0.2 },
    recommendation: { choice: "REVIEW_REQUIRED", confidence: 0.55 },
  };
}

export function evaluationCacheKey(job: JobPosting): {
  jobInputHash: string;
  candidateProfileVersionLabel: string;
  decisionPolicyVersion: string;
  evaluationSchemaVersion: string;
} {
  const { profile, policy } = loadCanonicalBundle();
  return {
    jobInputHash: jobInputHash(job),
    candidateProfileVersionLabel: profile.schema_version,
    decisionPolicyVersion: policy.policy_version,
    evaluationSchemaVersion: EVALUATION_SCHEMA_VERSION,
  };
}

export function canReuseEvaluation(existing: JobEvaluation | null, job: JobPosting): boolean {
  if (!existing) return false;
  const key = evaluationCacheKey(job);
  return (
    existing.jobInputHash === key.jobInputHash &&
    existing.candidateProfileVersionLabel === key.candidateProfileVersionLabel &&
    existing.decisionPolicyVersion === key.decisionPolicyVersion &&
    existing.evaluationSchemaVersion === key.evaluationSchemaVersion
  );
}

export async function evaluateCanonicalJob(input: {
  job: JobPosting;
  rules: CandidateProfile;
  deterministic: DeterministicResults;
  previous?: JobEvaluation | null;
  dbEvidence?: import("@/lib/domain/schemas").CandidateEvidence[];
}): Promise<{
  evaluation: JobEvaluation;
  decision: StructuredJobDecision;
  triage: TriageResult;
  requirements: JobRequirement[];
  matches: EvidenceMatch[];
  retrievedEvidenceIds: string[];
  reusedCache: boolean;
  deepReviewRan: boolean;
}> {
  const { profile, policy } = loadCanonicalBundle();
  const rules = input.rules.version >= PROFILE_VERSION_NUMBER ? input.rules : mapCanonicalToRules(profile);
  const triage = triageJob({
    job: input.job,
    rules,
    profile,
    policy,
    deterministic: input.deterministic,
  });

  if (canReuseEvaluation(input.previous ?? null, input.job)) {
    return {
      evaluation: input.previous as JobEvaluation,
      decision: syntheticDecision(triage.bucket),
      triage,
      requirements: [],
      matches: [],
      retrievedEvidenceIds: [],
      reusedCache: true,
      deepReviewRan: false,
    };
  }

  const key = evaluationCacheKey(input.job);
  let decision: StructuredJobDecision;
  let requirements: JobRequirement[] = [];
  let matches: EvidenceMatch[] = [];
  let retrievedEvidenceIds: string[] = [];
  let deepReviewRan = false;
  let coverage = 0;

  if (triage.bucket === "DEEP_REVIEW") {
    const retrieved = retrieveRelevantEvidence(input.job, profile);
    retrievedEvidenceIds = retrieved.evidence.map((e) => e.evidence_id);
    requirements = extractJobRequirements(input.job);
    matches = matchRequirementsToEvidence({
      requirements,
      evidence: retrieved.evidence,
      projects: retrieved.projects,
      profile,
    });
    coverage = evidenceCoverage(matches);
    const provider = getDecisionProvider();
    const retrievedRows = canonicalEvidenceToRows(retrieved.evidence, profile);
    const overlay = (input.dbEvidence ?? []).filter((e) => e.id !== "EV-P02-01" && !e.id.startsWith("EV-P02-"));
    decision = await provider.evaluateJob({
      candidate: rules,
      evidence: [...retrievedRows, ...overlay].slice(0, 36),
      job: input.job,
      policyContext: {
        hardFilterResults: { ...input.deterministic, triage: triage.bucket },
        decisionThresholds: { ...rules.applicationRules },
      },
    });
    deepReviewRan = true;
  } else {
    decision = syntheticDecision(triage.bucket);
  }

  const evaluation = buildEvaluation({
    id: randomUUID(),
    jobId: input.job.id,
    candidateProfileVersion: rules.version,
    deterministic: input.deterministic,
    decision,
    evidenceReady: deepReviewRan && coverage >= 0.45,
    evaluatedAt: new Date().toISOString(),
    thresholds: {
      applyMinimumScore: rules.applicationRules.applyRecommendationMinimumScore,
      reviewMinimumScore: rules.applicationRules.reviewRecommendationMinimumScore,
      minimumDecisionConfidence: rules.applicationRules.minimumDecisionConfidence,
    },
  });

  evaluation.triage = triage.bucket;
  evaluation.candidateProfileVersionLabel = key.candidateProfileVersionLabel;
  evaluation.decisionPolicyVersion = key.decisionPolicyVersion;
  evaluation.jobInputHash = key.jobInputHash;
  evaluation.evaluationSchemaVersion = key.evaluationSchemaVersion;
  evaluation.jevModelVersion = deepReviewRan ? getDecisionProvider().modelVersion : null;
  evaluation.roleFit = decision.roleFit.score;
  evaluation.evidenceCoverage = coverage;
  evaluation.informationCompleteness = 1 - decision.missingInformation.probability;
  evaluation.decisionConfidence = decision.recommendation.confidence;
  evaluation.priorityScore = evaluation.finalFitScore;
  evaluation.explanationReasons = [...triage.reasons, ...evaluation.explanationReasons];
  evaluation.policyVersion = POLICY_VERSION;

  if (triage.bucket === "HARD_REJECT") evaluation.finalDecision = "SKIP";
  if (triage.bucket === "LOW_PRIORITY_ARCHIVE") evaluation.finalDecision = "SKIP";
  if (triage.bucket === "HUMAN_REVIEW" && evaluation.finalDecision === "APPLY_CANDIDATE") {
    evaluation.finalDecision = "REVIEW_REQUIRED";
  }
  if (input.deterministic.salaryCompatible == null && evaluation.finalDecision === "SKIP" && triage.bucket === "DEEP_REVIEW") {
    evaluation.finalDecision = "REVIEW_REQUIRED";
    evaluation.explanationReasons.push("Missing salary is review, not rejection.");
  }

  return {
    evaluation,
    decision,
    triage,
    requirements,
    matches,
    retrievedEvidenceIds,
    reusedCache: false,
    deepReviewRan,
  };
}
