import { randomUUID } from "node:crypto";
import type { Profile, SourceType } from "@/lib/jev/types";
import { normalizeJobPosting } from "./normalize";
import { classifyDuplicate } from "./duplicates";
import { runHardFilters } from "@/lib/policy/hard-filters";
import { buildEvaluation, explanationFromEvaluation } from "@/lib/policy/compose";
import { evidenceReadiness } from "@/lib/policy/evidence";
import { nextAfterEvaluation } from "@/lib/policy/state-machine";
import { toV1Status } from "@/lib/domain/mapping";
import { getDecisionProvider } from "@/lib/providers/factory";
import { sha256 } from "@/lib/domain/hash";
import { POLICY_VERSION } from "@/lib/policy/version";
import {
  getCanonicalJob,
  insertAudit,
  insertRawImport,
  latestJobEvaluationV2,
  listCanonicalJobs,
  saveCanonicalJob,
  saveJobEvaluationV2,
  getCandidateRules,
  listEvidence,
} from "@/lib/db/store-extended";
import { insertEvaluation, insertOpportunity, updateOpportunityStatus } from "@/lib/db/store";
import { evaluateOpportunity } from "@/lib/jev/evaluate";
import { suggestedStatus } from "@/lib/jev/compose";
import type { JobEvaluation, JobPosting } from "@/lib/domain/schemas";

export async function ingestCanonical(input: {
  rawText: string;
  url?: string | null;
  sourceType: SourceType;
  profile: Profile;
  existingId?: string;
}): Promise<{
  job: JobPosting;
  evaluation: JobEvaluation;
  opportunityId: string;
  explanation: string;
}> {
  await insertRawImport({ source: input.sourceType, url: input.url ?? null, rawText: input.rawText });
  const id = input.existingId ?? randomUUID();
  const job = normalizeJobPosting({
    id,
    rawText: input.rawText,
    url: input.url,
    sourceType: input.sourceType,
  });

  const existing = await listCanonicalJobs();
  const duplicateStatus = classifyDuplicate(job, existing);
  const rules = await getCandidateRules();
  const evidence = await listEvidence();
  const deterministic = runHardFilters({ job, profile: rules, duplicateStatus });

  const provider = getDecisionProvider();
  const decision = deterministic.hardBlockers.length
    ? {
        roleFit: { score: 0.1, confidence: 0.9, probabilities: { "0": 1 } },
        skillsFit: { score: 0.1, confidence: 0.9, probabilities: { "0": 1 } },
        seniorityFit: { score: 0.1, confidence: 0.9, probabilities: { "0": 1 } },
        strategicValue: { score: 0.1, confidence: 0.9, probabilities: { "0": 1 } },
        missingInformation: { value: false, probability: 0.1 },
        redFlag: { value: true, probability: 0.9 },
        recommendation: { choice: "SKIP" as const, confidence: 0.92 },
      }
    : await provider.evaluateJob({
        candidate: rules,
        evidence,
        job,
        policyContext: {
          hardFilterResults: { ...deterministic },
          decisionThresholds: { ...rules.applicationRules },
        },
      });

  const evaluation = buildEvaluation({
    id: randomUUID(),
    jobId: job.id,
    candidateProfileVersion: rules.version,
    deterministic,
    decision,
    evidenceReady: evidenceReadiness(job, evidence, rules) >= 0.45,
    evaluatedAt: new Date().toISOString(),
    thresholds: {
      applyMinimumScore: rules.applicationRules.applyRecommendationMinimumScore,
      reviewMinimumScore: rules.applicationRules.reviewRecommendationMinimumScore,
      minimumDecisionConfidence: rules.applicationRules.minimumDecisionConfidence,
    },
  });

  job.status = nextAfterEvaluation(evaluation.finalDecision);
  if (job.extractionConfidence < 0.5 && job.status === "APPLY_CANDIDATE") {
    job.status = "REVIEW_REQUIRED";
    evaluation.finalDecision = "REVIEW_REQUIRED";
    evaluation.explanationReasons.push("Extraction confidence is too low to auto-route as apply.");
  }

  const already = await getCanonicalJob(job.id);
  if (!already) {
    await insertOpportunity({
      id: job.id,
      sourceType: input.sourceType,
      title: job.title,
      company: job.company ?? "Unknown company",
      location: job.location ?? "Unspecified",
      compensation: job.salaryMax ? `${job.salaryCurrency ?? ""} ${job.salaryMax}` : null,
      url: job.sourceUrl,
      rawText: job.descriptionRaw,
      status: toV1Status(job.status),
    });
  }

  await saveCanonicalJob(job);
  await saveJobEvaluationV2(evaluation);

  const v1 = await evaluateOpportunity(
    {
      posting: {
        sourceType: input.sourceType,
        title: job.title,
        company: job.company ?? "Unknown",
        location: job.location ?? "Unspecified",
        compensation: job.salaryMax ? `${job.salaryCurrency ?? ""} ${job.salaryMax}` : null,
        url: job.sourceUrl,
        rawText: job.descriptionRaw,
      },
      profile: {
        goals: input.profile.goals,
        constraints: input.profile.constraints,
        cv: input.profile.bullets,
      },
    },
    input.profile.weights,
  );
  await insertEvaluation({
    opportunityId: job.id,
    model: v1.model,
    demo: v1.demo,
    answers: v1.answers,
    composed: v1.composed,
  });

  const routed = toV1Status(job.status);
  const v1Suggest = suggestedStatus(v1.composed);
  const status = routed === "skipped" || v1Suggest === "skipped" ? "skipped" : routed;
  if (status !== "inbox") {
    await updateOpportunityStatus(job.id, status, "policy+Jev route");
  }

  await insertAudit({
    userId: "default",
    jobId: job.id,
    eventType: "JOB_EVALUATED",
    profileVersion: rules.version,
    policyVersion: POLICY_VERSION,
    modelProvider: provider.name === "DEMO" ? "DEMO" : "JEV",
    modelVersion: provider.modelVersion,
    inputHash: sha256(job.descriptionRaw).slice(0, 24),
    observationVersion: null,
    decisionSummary: {
      finalDecision: evaluation.finalDecision,
      finalFitScore: evaluation.finalFitScore,
      recommendation: evaluation.semanticSignals.recommendation,
    },
    policyResult: { ...evaluation.deterministicResults },
    executionResult: { explanation: explanationFromEvaluation(evaluation) },
  });

  return { job, evaluation, opportunityId: job.id, explanation: explanationFromEvaluation(evaluation) };
}

export async function evaluationForJob(jobId: string): Promise<JobEvaluation | null> {
  return latestJobEvaluationV2(jobId);
}

export async function backfillCanonicalForOpportunity(input: {
  id: string;
  rawText: string;
  url: string | null;
  sourceType: SourceType;
  title: string;
  company: string;
}): Promise<void> {
  if (await getCanonicalJob(input.id)) return;
  const job = normalizeJobPosting({
    id: input.id,
    rawText: input.rawText,
    url: input.url,
    sourceType: input.sourceType,
  });
  job.title = input.title;
  job.company = input.company;
  const existing = await listCanonicalJobs();
  const duplicateStatus = classifyDuplicate(job, existing);
  const rules = await getCandidateRules();
  const evidence = await listEvidence();
  const deterministic = runHardFilters({ job, profile: rules, duplicateStatus });
  const provider = getDecisionProvider();
  const decision = await provider.evaluateJob({
    candidate: rules,
    evidence,
    job,
    policyContext: {
      hardFilterResults: { ...deterministic },
      decisionThresholds: { ...rules.applicationRules },
    },
  });
  const evaluation = buildEvaluation({
    id: randomUUID(),
    jobId: job.id,
    candidateProfileVersion: rules.version,
    deterministic,
    decision,
    evidenceReady: evidenceReadiness(job, evidence, rules) >= 0.45,
    evaluatedAt: new Date().toISOString(),
    thresholds: {
      applyMinimumScore: rules.applicationRules.applyRecommendationMinimumScore,
      reviewMinimumScore: rules.applicationRules.reviewRecommendationMinimumScore,
      minimumDecisionConfidence: rules.applicationRules.minimumDecisionConfidence,
    },
  });
  job.status = nextAfterEvaluation(evaluation.finalDecision);
  await saveCanonicalJob(job);
  await saveJobEvaluationV2(evaluation);
}
